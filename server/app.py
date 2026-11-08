"""Local-only SAM 3 adapter. GPU/model imports are lazy; /health works without them."""
from __future__ import annotations

import importlib.util
import math
import os
import tempfile
import threading
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError, model_validator

MAX_BYTES = 100 * 1024 * 1024
ORIGINS = os.getenv("TRACE_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174").split(",")


class Selection(BaseModel):
    box: list[float] = Field(min_length=4, max_length=4)  # source-normalized xywh
    times: list[float] = Field(min_length=2, max_length=240)
    end: float = Field(gt=0, le=30.001)
    source_start: float = Field(ge=0, le=600)
    prompt: str = Field(default="", max_length=150)

    @model_validator(mode="after")
    def valid(self):
        x, y, w, h = self.box
        if not all(math.isfinite(v) for v in self.box + self.times) or x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 1.000001 or y + h > 1.000001:
            raise ValueError("Select a subject inside the source video.")
        if self.times[0] < 0 or self.times[-1] >= self.end or any(a >= b for a, b in zip(self.times, self.times[1:])):
            raise ValueError("Invalid tracking time range.")
        return self


@dataclass
class Session:
    id: str
    selection: Selection
    directory: tempfile.TemporaryDirectory
    status: str = "analyzing"
    progress: float = 0
    seed: dict | None = None
    result: dict | None = None
    error: str | None = None
    object_id: int | None = None
    model_session: str | None = None
    stop_reason: str = "complete"
    frames: int = 0
    last_used: float = field(default_factory=time.monotonic)
    cancel: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def snapshot(self):
        with self.lock:
            self.last_used = time.monotonic()
            return {"id": self.id, "status": self.status, "progress": self.progress, "seed": self.seed, "result": self.result, "error": self.error}


class Cancelled(Exception):
    pass


class SamEngine:
    def __init__(self):
        self.predictor = None

    def health(self):
        if not importlib.util.find_spec("sam3") or not importlib.util.find_spec("torch"):
            return {"ready": False, "message": "Install official SAM 3 and CUDA PyTorch in this service's Python environment. See server/README.md."}
        import torch
        if not torch.cuda.is_available():
            return {"ready": False, "message": "SAM 3 requires an NVIDIA CUDA GPU. Use local tracking on this computer or run this service on a CUDA machine."}
        return {"ready": True, "message": "CUDA available. Model weights load on first analysis; Hugging Face access or SAM3_CHECKPOINT is required.", "loaded": self.predictor is not None}

    def load(self):
        if self.predictor is None:
            health = self.health()
            if not health["ready"]:
                raise RuntimeError(health["message"])
            from sam3.model_builder import build_sam3_video_predictor
            self.predictor = build_sam3_video_predictor(gpus_to_use=[0], checkpoint_path=os.getenv("SAM3_CHECKPOINT") or None)
        return self.predictor

    def close(self, session):
        if self.predictor is not None and session.model_session:
            self.predictor.handle_request({"type": "close_session", "session_id": session.model_session})
            session.model_session = None

    def analyze(self, session: Session):
        import cv2
        predictor = self.load()
        check_cancel(session)
        root = Path(session.directory.name)
        frames_dir = root / "frames"
        frames_dir.mkdir()
        previous = None
        samples = sample_video(root / "video", session)
        try:
            for i, frame in enumerate(samples):
                if previous is not None and scene_cut(previous, frame):
                    session.stop_reason = "scene-cut"
                    break
                if not cv2.imwrite(str(frames_dir / f"{i:06d}.jpg"), frame):
                    raise ValueError("Could not prepare inference frames.")
                previous = frame
                session.frames += 1
                session.progress = .5 * (i + 1) / len(session.selection.times)
        finally:
            samples.close()
        response = predictor.handle_request({"type": "start_session", "resource_path": str(frames_dir)})
        session.model_session = response["session_id"]
        check_cancel(session)
        request = {"type": "add_prompt", "session_id": session.model_session, "frame_index": 0,
                   "bounding_boxes": [session.selection.box], "bounding_box_labels": [1]}
        if session.selection.prompt.strip():
            request["text"] = session.selection.prompt.strip()
        response = predictor.handle_request(request)
        outputs = response["outputs"]
        selected = select_object(outputs, session.selection.box)
        if selected is None:
            raise ValueError("SAM 3 found no subject in this selection. Draw a tighter box or describe the subject.")
        session.object_id = int(outputs["out_obj_ids"][selected])
        session.seed = outline(outputs["out_binary_masks"][selected])
        if session.seed is None:
            raise ValueError("The subject's mask is empty.")
        # Remove other instances so another person/object cannot replace the selected subject.
        for obj in outputs["out_obj_ids"]:
            if int(obj) != session.object_id:
                predictor.handle_request({"type": "remove_object", "session_id": session.model_session, "obj_id": int(obj), "is_user_action": False})
        session.progress = 1

    def track(self, session: Session):
        predictor = self.load()
        keys = [{"time": session.selection.times[0], **session.seed}]
        reason = session.stop_reason
        end = session.selection.end if session.frames == len(session.selection.times) else session.selection.times[session.frames]
        previous = session.seed
        stream = predictor.handle_stream_request({"type": "propagate_in_video", "session_id": session.model_session, "propagation_direction": "forward", "start_frame_index": 0, "max_frame_num_to_track": session.frames})
        try:
            for response in stream:
                check_cancel(session)
                i = int(response["frame_index"])
                if i == 0:
                    continue
                if i >= session.frames:
                    break
                outputs = response["outputs"]
                ids = list(map(int, outputs["out_obj_ids"]))
                mask = None
                if session.object_id in ids:
                    index = ids.index(session.object_id)
                    probs = outputs.get("out_probs")
                    if probs is None or float(probs[index]) >= .5:
                        mask = outline(outputs["out_binary_masks"][index])
                if mask is None or not plausible(previous, mask):
                    reason, end = "subject-lost", session.selection.times[i]
                    break
                keys.append({"time": session.selection.times[i], **mask})
                previous = mask
                session.progress = (i + 1) / session.frames
        finally:
            stream.close()
        check_cancel(session)
        # An early end from the predictor is also a lost track, never a frozen mask for the rest of the shot.
        if len(keys) < session.frames and reason == "complete":
            reason, end = "subject-lost", session.selection.times[len(keys)]
        if len(keys) < 2:
            raise ValueError("SAM 3 lost the subject immediately. Refine the selection and analyze again.")
        session.result = {"keys": keys, "end": end, "reason": reason}


def check_cancel(session):
    if session.cancel.is_set():
        raise Cancelled()


def sample_video(path, session):
    """Sample by presentation timestamp, holding the last frame until the clip ends.

    Seeking by an estimated frame rate rounds to the wrong frame in VFR footage and
    can seek past EOF for the final sample, so decode monotonically instead.
    """
    import av
    import cv2
    import numpy as np
    try:
        container = av.open(str(path))
    except av.FFmpegError as error:
        raise ValueError("Choose a decodable video up to 30 seconds.") from error
    with container:
        if not container.streams.video:
            raise ValueError("Choose a decodable video up to 30 seconds.")
        stream = container.streams.video[0]
        duration = float(stream.duration * stream.time_base) if stream.duration is not None else (container.duration or 0) / av.time_base
        source_start = float((stream.start_time or 0) * stream.time_base)
        if not math.isfinite(duration) or duration <= 0 or duration > 30.05:
            raise ValueError("Choose a decodable video up to 30 seconds.")
        if session.selection.source_start + session.selection.end > source_start + duration + .05:
            raise ValueError("Tracking range exceeds the uploaded video.")
        decoded = iter(container.decode(stream))
        current = following = next(decoded, None)
        for target in session.selection.times:
            target += session.selection.source_start
            check_cancel(session)
            while following is not None and following.time is not None and following.time <= target + 1e-6:
                current = following
                following = next(decoded, None)
                check_cancel(session)
            if current is None or current.time is None or current.time > target + .05:
                raise ValueError("Could not decode a requested video frame.")
            if current.width > 16384 or current.height > 16384:
                raise ValueError("The source video dimensions are too large.")
            # Honor display orientation and non-square source pixels before normalizing masks.
            rotation = float(current.rotation)
            if abs(rotation / 90 - round(rotation / 90)) > .01:
                raise ValueError("Rotate this video to a standard orientation before tracking.")
            sar = float(stream.sample_aspect_ratio or 1)
            display_w = max(1, round(current.width * sar))
            scale = min(1, 768 / max(display_w, current.height))
            frame = current.to_ndarray(format="bgr24", width=max(1, round(display_w * scale)), height=max(1, round(current.height * scale)))
            if rotation:
                frame = np.ascontiguousarray(np.rot90(frame, round(rotation / 90)))
            yield frame


def scene_cut(a, b):
    import cv2
    import numpy as np
    diff = np.abs(cv2.resize(a, (24, 18)).astype(float) - cv2.resize(b, (24, 18)).astype(float)).mean(axis=2)
    return bool((diff > 45).mean() > .7 and diff.mean() > 55)


def select_object(outputs, selection):
    # Match the selected region on the seed frame, then keep the same object ID throughout.
    x, y, w, h = selection
    best, best_score = None, 0
    for i, box in enumerate(outputs["out_boxes_xywh"]):
        bx, by, bw, bh = map(float, box)
        overlap = max(0, min(x + w, bx + bw) - max(x, bx)) * max(0, min(y + h, by + bh) - max(y, by))
        score = overlap / max(1e-9, w * h + bw * bh - overlap)
        if score > best_score:
            best, best_score = i, score
    return best


def outline(mask):
    """Largest connected silhouette -> editable, uniformly sampled 96-point outline."""
    import cv2
    import numpy as np
    mask = np.asarray(mask).squeeze().astype(np.uint8)
    if mask.ndim != 2:
        raise ValueError("Unsupported SAM 3 mask format.")
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea).reshape(-1, 2).astype(float)
    if len(contour) < 3 or cv2.contourArea(contour.astype(np.float32)) < 8:
        return None
    # Stable winding and anchor; hold interpolation avoids twisting when a silhouette changes.
    contour = np.roll(contour, -int(np.lexsort((contour[:, 0], contour[:, 1]))[0]), axis=0)
    closed = np.vstack((contour, contour[0]))
    distance = np.concatenate(([0], np.cumsum(np.linalg.norm(np.diff(closed, axis=0), axis=1))))
    samples = np.arange(96) * distance[-1] / 96
    points = np.column_stack([np.interp(samples, distance, closed[:, axis]) for axis in (0, 1)])
    # Pixel edges include the outermost pixels instead of shrinking the mask by half a pixel.
    left, top = contour.min(axis=0)
    right, bottom = contour.max(axis=0) + 1
    height, width = mask.shape
    return {"x": float((left + right) / 2 / width), "y": float((top + bottom) / 2 / height), "width": float((right - left) / width), "height": float((bottom - top) / height),
            "vertices": [{"x": float((px - left + .5) / (right - left)), "y": float((py - top + .5) / (bottom - top))} for px, py in points]}


def plausible(a, b):
    ratio = b["width"] * b["height"] / max(1e-9, a["width"] * a["height"])
    travel = math.hypot(a["x"] - b["x"], a["y"] - b["y"])
    return .2 < ratio < 5 and travel < max(.15, math.hypot(a["width"], a["height"]))


class Manager:
    def __init__(self, engine=None):
        self.engine = engine or SamEngine()
        self.sessions: dict[str, Session] = {}
        self.lock = threading.Lock()

    def cleanup(self, session):
        try:
            self.engine.close(session)
        finally:
            session.directory.cleanup()

    def work(self, session, operation):
        outcome = "failed"
        try:
            check_cancel(session)
            getattr(self.engine, operation)(session)
            check_cancel(session)
            outcome = "ready" if operation == "analyze" else "complete"
        except Cancelled:
            outcome = "cancelled"
        except Exception as error:
            session.error = str(error)[:600]
        finally:
            with session.lock:
                if session.cancel.is_set():
                    outcome = "cancelled"
                try:
                    if outcome != "ready":
                        self.cleanup(session)
                except Exception as error:
                    outcome, session.error = "failed", str(error)[:600]
                session.last_used = time.monotonic()
                # Publish completion only after releasing GPU resources and temporary files.
                session.status = outcome

    def reap(self):
        with self.lock:
            for sid, session in list(self.sessions.items()):
                with session.lock:
                    if time.monotonic() - session.last_used > 600 and session.status not in ("uploading", "analyzing", "tracking", "cancelling"):
                        if session.status == "ready":
                            self.cleanup(session)
                        del self.sessions[sid]


def create_app(manager=None):
    manager = manager or Manager()

    @asynccontextmanager
    async def lifespan(app):
        import asyncio
        async def reaper():
            while True:
                await asyncio.sleep(30)
                await asyncio.to_thread(manager.reap)
        task = asyncio.create_task(reaper())
        yield
        task.cancel()
        for session in list(manager.sessions.values()):
            session.cancel.set()
            if session.status == "ready":
                manager.cleanup(session)

    app = FastAPI(title="Trace SAM 3", lifespan=lifespan)
    app.state.manager = manager
    app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"])

    @app.middleware("http")
    async def local_requests(request, call_next):
        origin = request.headers.get("origin")
        if origin and origin not in ORIGINS:
            return JSONResponse({"detail": "Origin not allowed. Set TRACE_ORIGINS to your editor origin."}, status_code=403)
        length = request.headers.get("content-length", "0")
        if not length.isdigit() or int(length) > MAX_BYTES + 65536:
            return JSONResponse({"detail": "Video upload exceeds 100 MB."}, status_code=413)
        return await call_next(request)

    @app.get("/health")
    def health():
        return {"service": "trace-sam3", "version": 1, **manager.engine.health()}

    @app.post("/sessions", status_code=202)
    async def analyze(video: UploadFile = File(...), options: str = Form(...)):
        try:
            selection = Selection.model_validate_json(options)
        except ValidationError:
            raise HTTPException(422, "Invalid selection or tracking range.")
        health = manager.engine.health()
        if not health["ready"]:
            raise HTTPException(503, health["message"])
        with manager.lock:
            if any(s.status in ("uploading", "analyzing", "ready", "tracking", "cancelling") for s in manager.sessions.values()):
                raise HTTPException(409, "Another subject is active. Cancel it or wait for it to finish.")
            session = Session(uuid.uuid4().hex, selection, tempfile.TemporaryDirectory(prefix="trace-sam3-"), status="uploading")
            manager.sessions[session.id] = session
        try:
            size = 0
            with (Path(session.directory.name) / "video").open("wb") as destination:
                while chunk := await video.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise HTTPException(413, "Video upload exceeds 100 MB.")
                    destination.write(chunk)
            if not size:
                raise HTTPException(422, "The video is empty.")
            session.status = "analyzing"
            threading.Thread(target=manager.work, args=(session, "analyze"), daemon=True).start()
        except BaseException:
            session.status = "failed"
            manager.cleanup(session)
            raise
        finally:
            await video.close()
        return {"id": session.id}

    def get_session(sid):
        session = manager.sessions.get(sid)
        if session is None:
            raise HTTPException(404, "Analysis expired. Analyze the subject again.")
        return session

    @app.get("/sessions/{sid}")
    def status(sid: str):
        return get_session(sid).snapshot()

    @app.post("/sessions/{sid}/track", status_code=202)
    def track(sid: str):
        session = get_session(sid)
        with session.lock:
            if session.status != "ready":
                raise HTTPException(409, "Analyze the subject before starting tracking.")
            session.status, session.progress = "tracking", 0
        threading.Thread(target=manager.work, args=(session, "track"), daemon=True).start()
        return {"id": session.id}

    @app.delete("/sessions/{sid}")
    def cancel(sid: str):
        session = get_session(sid)
        with session.lock:
            session.cancel.set()
            if session.status == "ready":
                manager.cleanup(session)
                session.status = "cancelled"
            elif session.status in ("analyzing", "tracking"):
                session.status = "cancelling"
        return {"id": session.id, "status": session.status}

    return app


app = create_app()
from server.image_api import router as image_router
app.include_router(image_router)
