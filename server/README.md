# Trace · local SAM 3 service

The service now also exposes the image workspace's `/images/models` and `/images/jobs` endpoints for SAM 2.1 Large, SAM 3, BiRefNet/HR, LaMa, Qwen, RTMW, MoGe-2 and Depth Anything 3. The image editor defaults to SAM 2.1 Large for click/box selection and full BiRefNet-matting for edge refinement. See the [image workspace setup and verification guide](../docs/IMAGE-STUDIO.md). The existing video session API below is preserved.

FastAPI connects Trace's **Analyze subject → Start tracking** controls to Meta's official SAM 3 video predictor. Draw a blocker around one subject, analyze at the playhead, inspect the mask preview, then track forward within the current video section. Trace converts the result into an editable foreground blocker, usable in both 2D and 3D exports. Original video and audio are preserved.

The **Local · follow drawn shape** option runs entirely in the browser and needs no server. It follows position and gradual size changes using the selected area's appearance. It does not segment a person's silhouette. For either method, tracking stops at the next separator, a detected hard scene cut or a lost subject. These checks are heuristics; inspect the resulting track and correct keys when needed.

## Start FastAPI

Use Python **3.12** (a dedicated environment avoids model dependency conflicts). Run from the project root:

```powershell
py -3.12 -m venv server/.venv
server/.venv/Scripts/python -m pip install -r server/requirements.txt
server/.venv/Scripts/python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

On Linux, use `python3.12 -m venv server/.venv` and `server/.venv/bin/python` instead. `/health` reports whether the model runtime is available. The API can start without SAM 3; it reports setup requirements and rejects analysis until the model is installed. It never substitutes a fake mask.

In Trace select a blocker, open its properties, choose **SAM 3 · subject silhouette** and use `http://127.0.0.1:8000` under **Local FastAPI connection**.

## Enable the model on a compatible machine

[Meta's official prerequisites](https://github.com/facebookresearch/sam3#installation) include a CUDA-compatible NVIDIA GPU, CUDA 12.6+, Python 3.12+ and PyTorch 2.7+. The standard video predictor uses CUDA; an AMD Radeon RX 580 does **not** run this backend. Use browser tracking there, or run this service in a compatible NVIDIA environment. FastAPI itself works on Windows; the full upstream model runtime must also be supported on the chosen system.

Inside the same Python 3.12 environment, install CUDA PyTorch (the upstream installation currently uses this command), then the model adapter requirements:

```sh
python -m pip install torch==2.10.0 torchvision --index-url https://download.pytorch.org/whl/cu128
python -m pip install -r server/requirements-model.txt
```

The official SAM 3 source is pinned to `7f473cfd983d5eb43040ff608f66bff0d7bdcb53`. Request access to [facebook/sam3 checkpoints](https://huggingface.co/facebook/sam3) and authenticate with `hf auth login` in that environment. Meta's SAM license applies. Weights load on the first analysis. Alternatively set `SAM3_CHECKPOINT` to an already downloaded checkpoint's absolute path. No Hugging Face token belongs in the browser or this repository.

For a different editor origin, set `TRACE_ORIGINS` to a comma-separated list before starting the service. Defaults allow localhost/127.0.0.1 ports 5173 and 5174. For a separate CUDA machine, configure the endpoint and origin, and put authentication and HTTPS in front of the service before exposing it beyond a trusted local network. This local adapter does not include public hosting or authentication.

## Behavior and limits

- `GET /health`: runtime availability, without loading weights.
- `POST /sessions`: multipart `video` and JSON `options` (`box` in source-normalized xywh, timeline `times`, `end`, `source_start`, optional `prompt`). Returns an analysis ID.
- `GET /sessions/{id}`: analysis/track status, progress and mask result.
- `POST /sessions/{id}/track`: track the analyzed object ID forward.
- `DELETE /sessions/{id}`: cancel, close the model session and remove temporary footage. Cancellation takes effect between inference steps.

One subject/session runs at a time. Video uploads are limited to 100 MB and 30 seconds; at most 240 frames are sampled, up to 12 per second and 768 pixels on the long edge. Actual timeline sample times are carried through to the resulting keys, including variable frame rate footage. Audio is not processed by this service.

SAM 3 masks are converted into **96-point editable outlines of the largest connected silhouette**, with hold interpolation. Small detached regions and holes are not represented by this vector blocker. The same object ID is retained across the track; absent/low-confidence masks, abrupt jumps and hard cuts stop it. A stopped mask is hidden after its tracked range instead of covering the rest of the video. Motion blur, full occlusion, similar subjects and subtle transitions can still need manual correction.

The source upload and sampled frames live in a private temporary directory. They are removed on completion, cancellation or error; an unused analysis expires after 10 minutes. A hard process kill may leave an operating-system temporary directory behind. The browser keeps the final outlines with the project, so preview and export work without the service after tracking.

## Checks

```sh
python -m pip install -r server/requirements-test.txt
python -m unittest server.test_app -v
```

The service tests exercise real video decoding, contour conversion, API jobs, cancellation and cleanup with a predictor test double using the official request/response contract. They do not measure SAM 3 inference quality. Real model inference requires the CUDA hardware and checkpoint access above.
