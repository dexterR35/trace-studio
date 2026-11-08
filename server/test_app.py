"""Exercise the adapter without downloading weights or pretending to run SAM 3."""
import json
import tempfile
import time
import unittest
from fractions import Fraction
from pathlib import Path

import cv2
import numpy as np
from fastapi.testclient import TestClient

from server.app import Manager, SamEngine, Selection, Session, create_app, outline, scene_cut, sample_video


class PredictorDouble:
    """Implements the official request contract; detects only our synthetic bright box."""
    def __init__(self, lose_at=None):
        self.requests = []
        self.frames = []
        self.closed = False
        self.lose_at = lose_at

    def output(self, i):
        mask = self.frames[i][:, :, 0] > 150
        if self.lose_at is not None and i >= self.lose_at:
            return {"out_obj_ids": [], "out_binary_masks": [], "out_boxes_xywh": [], "out_probs": []}
        ys, xs = np.nonzero(mask)
        h, w = mask.shape
        return {"out_obj_ids": [7], "out_binary_masks": [mask], "out_boxes_xywh": [[xs.min() / w, ys.min() / h, (xs.max() - xs.min() + 1) / w, (ys.max() - ys.min() + 1) / h]], "out_probs": [.95]}

    def handle_request(self, request):
        self.requests.append(request)
        if request["type"] == "start_session":
            self.frames = [cv2.imread(str(p)) for p in sorted(Path(request["resource_path"]).glob("*.jpg"))]
            return {"session_id": "test-model-session"}
        if request["type"] == "add_prompt":
            return {"frame_index": 0, "outputs": self.output(0)}
        if request["type"] == "close_session":
            self.closed = True
        return {}

    def handle_stream_request(self, request):
        self.requests.append(request)
        for i in range(len(self.frames)):
            yield {"frame_index": i, "outputs": self.output(i)}


def fixture(cut_at=None):
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "clip.avi"
        writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 8, (128, 96))
        for i in range(8):
            frame = np.full((96, 128, 3), [20, 40, 60] if cut_at is None or i < cut_at else [200, 180, 80], np.uint8)
            frame[24:72, 32 + i * 3:56 + i * 3] = 240
            writer.write(frame)
        writer.release()
        return path.read_bytes()


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.engine = SamEngine()
        self.predictor = PredictorDouble()
        self.engine.predictor = self.predictor
        self.engine.health = lambda: {"ready": True, "message": "Predictor test double"}
        self.manager = Manager(self.engine)
        self.client = TestClient(create_app(self.manager))
        self.client.__enter__()
        self.options = {"box": [.25, .25, .1875, .5], "times": [i / 8 for i in range(8)], "end": 1, "source_start": 0}

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def analyze(self, video=None):
        response = self.client.post("/sessions", files={"video": ("clip.avi", video or fixture(), "video/avi")}, data={"options": json.dumps(self.options)})
        self.assertEqual(response.status_code, 202, response.text)
        return response.json()["id"]

    def wait(self, sid, target):
        for _ in range(300):
            snapshot = self.client.get(f"/sessions/{sid}").json()
            if snapshot["status"] == target:
                return snapshot
            if snapshot["status"] == "failed":
                self.fail(snapshot["error"])
            time.sleep(.01)
        self.fail("Job did not finish")

    def test_analyze_preview_then_track_preserves_times_and_cleans_temp_files(self):
        sid = self.analyze()
        ready = self.wait(sid, "ready")
        self.assertEqual(len(ready["seed"]["vertices"]), 96)
        self.assertAlmostEqual(ready["seed"]["x"], 44 / 128, places=2)
        root = self.manager.sessions[sid].directory.name
        self.assertTrue(Path(root).exists())
        prompt = next(r for r in self.predictor.requests if r["type"] == "add_prompt")
        self.assertEqual(prompt["bounding_boxes"], [self.options["box"]])
        self.assertEqual(self.client.post(f"/sessions/{sid}/track").status_code, 202)
        result = self.wait(sid, "complete")["result"]
        self.assertEqual([k["time"] for k in result["keys"]], self.options["times"])
        self.assertGreater(result["keys"][-1]["x"], result["keys"][0]["x"])
        self.assertEqual(result["reason"], "complete")
        # Cleanup runs immediately after the terminal status is set.
        for _ in range(50):
            if not Path(root).exists():
                break
            time.sleep(.01)
        self.assertFalse(Path(root).exists()); self.assertTrue(self.predictor.closed)

    def test_cut_stops_track_and_hides_after_first_frame_of_next_shot(self):
        sid = self.analyze(fixture(cut_at=4)); self.wait(sid, "ready")
        self.client.post(f"/sessions/{sid}/track")
        result = self.wait(sid, "complete")["result"]
        self.assertEqual(result["reason"], "scene-cut")
        self.assertEqual(result["end"], .5); self.assertEqual(len(result["keys"]), 4)

    def test_missing_subject_stops_without_switching_id_or_freezing_mask(self):
        self.predictor.lose_at = 3
        sid = self.analyze(); self.wait(sid, "ready"); self.client.post(f"/sessions/{sid}/track")
        result = self.wait(sid, "complete")["result"]
        self.assertEqual(result["reason"], "subject-lost")
        self.assertEqual(result["end"], 3 / 8); self.assertEqual(len(result["keys"]), 3)

    def test_cancel_ready_analysis_releases_model_and_removes_upload(self):
        sid = self.analyze(); self.wait(sid, "ready")
        root = self.manager.sessions[sid].directory.name
        self.assertEqual(self.client.delete(f"/sessions/{sid}").json()["status"], "cancelled")
        self.assertTrue(self.predictor.closed); self.assertFalse(Path(root).exists())
        self.assertEqual(self.client.post(f"/sessions/{sid}/track").status_code, 409)

    def test_invalid_jobs_untrusted_origins_and_busy_model_are_rejected(self):
        response = self.client.post("/sessions", files={"video": ("clip.avi", b"bad")}, data={"options": "{}"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/health", headers={"origin": "https://untrusted.example"}).status_code, 403)
        sid = self.analyze(); self.wait(sid, "ready")
        self.assertEqual(self.client.post("/sessions", files={"video": ("clip.avi", fixture())}, data={"options": json.dumps(self.options)}).status_code, 409)

    def test_bad_video_fails_and_removes_upload(self):
        sid = self.analyze(b"not a video")
        for _ in range(100):
            state = self.client.get(f"/sessions/{sid}").json()
            if state["status"] == "failed":
                break
            time.sleep(.01)
        self.assertEqual(state["status"], "failed")
        self.assertIn("decodable", state["error"])
        self.assertFalse(Path(self.manager.sessions[sid].directory.name).exists())

    def test_contours_are_normalized_and_empty_masks_are_not_blockers(self):
        self.assertIsNone(outline(np.zeros((32, 32), np.uint8)))
        mask = np.zeros((32, 32), np.uint8); mask[5:25, 8:24] = 1
        result = outline(mask)
        self.assertEqual(len(result["vertices"]), 96)
        self.assertTrue(all(0 <= v["x"] <= 1 and 0 <= v["y"] <= 1 for v in result["vertices"]))
        self.assertFalse(scene_cut(np.zeros((32, 32, 3), np.uint8), np.zeros((32, 32, 3), np.uint8)))
        with self.assertRaises(ValueError):
            Selection(box=[.9, .5, .5, .2], times=[0, .2], end=1, source_start=0)

    def test_variable_frame_timestamps_hold_the_correct_source_frame_through_eof(self):
        import av
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "variable.mp4"
            with av.open(str(path), "w") as output:
                stream = output.add_stream("libx264", rate=25)
                stream.width, stream.height, stream.pix_fmt = 128, 96, "yuv420p"
                stream.options = {"bf": "0"}
                stream.time_base = Fraction(1, 1000)
                stream.codec_context.time_base = Fraction(1, 1000)
                for i, timestamp in enumerate([0, 40, 120, 400, 900]):
                    pixels = np.full((96, 128, 3), 20 + i * 40, np.uint8)
                    frame = av.VideoFrame.from_ndarray(pixels, format="rgb24")
                    frame.pts, frame.time_base = timestamp, Fraction(1, 1000)
                    for packet in stream.encode(frame):
                        output.mux(packet)
                for packet in stream.encode():
                    output.mux(packet)
            selection = Selection(box=[.2, .2, .2, .2], times=[0, .03, .06, .14, .39, .4, .91], end=.94, source_start=0)
            session = Session("vfr", selection, tempfile.TemporaryDirectory())
            try:
                means = [round(float(frame.mean())) for frame in sample_video(path, session)]
                for actual, expected in zip(means, [20, 20, 60, 100, 100, 140, 180]):
                    self.assertAlmostEqual(actual, expected, delta=3)
            finally:
                session.directory.cleanup()


if __name__ == "__main__":
    unittest.main()
