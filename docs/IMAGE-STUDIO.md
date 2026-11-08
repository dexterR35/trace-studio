# Trace Studio — image reference workspace

The image workspace and existing Motion Studio share a white, navy blue and coral interface. The main workflow is **Select → Analyze → Export**. Use the left rail to switch to Motion, Assets, Projects or Models.

## Start

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:5173/. The launcher also starts the local Python service on 127.0.0.1:8000 when `server/.venv` exists. To run just the model service, use `npm run server`. The editor, mathematical tools and exports work without Python.

For a fresh machine, install Python 3.12 and Git, then run the following from this project folder. Stop the running service before changing Python packages: Windows can lock loaded DLLs.

```powershell
.\SETUP-AI.cmd cpu
# After installing a compatible modern NVIDIA GPU:
.\SETUP-AI.cmd nvidia
# Optional geometry packages:
.\SETUP-AI.cmd depth
# Optional SAM 3 runtime, after configuring compatible CUDA PyTorch:
.\SETUP-AI.cmd sam3
```

Open **Models** to see actual runtime/checkpoint readiness and download published weights. First setup needs internet access and several GB of storage; image inference stays in the browser or the local Python process. The default endpoint accepts only loopback addresses. Model download and inference errors are shown explicitly. Model licenses and gated access are separate from this app; consult each publisher before redistribution or commercial deployment. The optional IMG.LY browser background remover is AGPL licensed (a commercial license is also offered by its publisher).

## Selection and extraction

- Upload, paste or drop PNG, JPEG, WebP or SVG. Images are limited to 35 MB, 20 megapixels and 8192 px per side.
- **SAM 2.1 Hiera Large is the default click/box picker.** SAM 3 adds text/concept selection when its NVIDIA/CUDA and approved-checkpoint requirements are met. Manual uses connected shapes/colors.
- Repeated normal clicks replace one **Current selection** draft. **Extract subject** commits it as a saved asset. Saved thumbnails switch masks without adding another asset; **Select another / Show all** returns to the full source.
- A single click can be ambiguous on touching or nested artwork. Up to three scored boundary candidates let you choose a different scope. Drag a tight box around one chip to separate it from a stack. Shift-click adds a positive prompt; Alt-click excludes a region. Manual region tools combine masks with add/subtract/intersect.
- Box/freehand selection, brush/erase, mask import, expand/contract and feather tools create real editable masks. Mask edits are undoable.
- **Find elements** splits disconnected foreground regions, useful for transparent sprite sheets. Review merged or fragmented regions. Complex photographs benefit from model selection.
- **Extract subject** opens the asset library. Download a transparent PNG or send the cropped asset into Motion. Motion's **Select & extract image** opens a selected image layer in the image workspace, preserving the previous image project.
- Inspect edges against checkerboard, white, black, navy or a chosen color. **Full BiRefNet-matting (1024 input) is the default cutout model.** HR-matting is a 2048-input alternative. Both use Swin-Large; HR denotes higher training/input resolution, not a separate parameter-size tier. Browser IS-Net is optional and never silently replaces the selected full model. LaMa and OpenCV remove/fill the selection and save a separate filled image project.
- Select another asset while inference runs, or choose a different model for the next run. Only one job runs at a time, and its result returns to the original asset. If that asset was deleted or edited, stale results are discarded.

## Analysis and editing

- Color clustering suggests editable part masks. Rename, include/exclude, brush-correct and extract any part. These are color regions, not claimed semantic anatomy. Semantic parts use Qwen suggestions followed by SAM 3 masks and require both models.
- Width, height, area, aspect ratio, artboard coverage, center distances, edge gaps, angles and relative sizes are computed from actual masks and XY points. Rulers and landmarks are draggable. Percentages use image width. A known scale enables centimeters; one uncalibrated image does not provide exact real-world dimensions.
- RTMW supplies whole-body landmarks and generates editable shoulder/hip widths, arm/leg/torso segment lengths and elbow/knee angles for sufficiently confident landmark pairs. Inspect pose predictions on artwork, animals or unusual poses. The included checkpoint is for humans; animal-specific detection requires an additional checkpoint/adapter.
- Contours preserve holes and disconnected islands. Drag vector nodes, simplify points and export an SVG silhouette. Vector edits also update the raster mask.
- Four clockwise corners define a flat perspective plane. Set output dimensions and download its rectified PNG; the project stores the homography. This is a planar correction, not reconstruction of hidden surfaces.
- Appearance stores sampled palette fractions, top/bottom color averages, editable material/finish descriptions and notes. Qwen can suggest visible descriptions; they need review.
- Keep/change choices for silhouette, pose, proportions, colors, material and background become explicit reconstruction instructions. Add requested changes and copy the prompt.
- Optional MoGe-2 and Depth Anything 3 estimate depth/camera-space points. These estimates are tagged separately from measured pixel geometry and do not establish exact dimensions.

## Exports

Export square tiles at 256, 512, 1024 and 2048 px with consistent padding and optional area-based optical matching.

The reference ZIP contains the original image, annotated PNG, measurements/appearance/constraints JSON, reconstruction prompt, portable editable `.pick.json`, each subject's cutout/full-canvas mask/SVG, enabled part cutouts and masks, and the selected size presets. Full-canvas masks use original image coordinates. The JSON identifies their matching file paths. Use the visual files together with the JSON in GPT Image. The app does not upload automatically to a third party.

Projects autosave in IndexedDB on this browser/device. **Projects → Delete** moves the complete project to recoverable **Trash**; Restore brings it back. Autosave cannot recreate a trashed project. Delete an asset from its thumbnail, the Assets card or Delete key; Undo restores its masks, parts, measurements. The source image stays intact. Motion layers retain their own Delete/Undo controls.

**Help** explains all 12 canvas icons, shortcuts, sections, models and main controls. Search it for terms such as “delete”, “selection” or “measure”. Each active canvas tool also shows a short explanation below the image.

Export editable projects for backups or moving computers. Up to 60 subjects, 30 parts per subject and 100 measurements per subject are supported. Undo keeps 15 recent image edits. Browser storage can be cleared by the browser, so portable project copies remain useful.

## Verification commands

```powershell
npm test
npm run build
.\server\.venv\Scripts\python.exe -m unittest discover -s server -p "test_*.py"
.\server\.venv\Scripts\python.exe -m server.smoke_images
```

The smoke script checks selection with SAM 2.1 Large and masked filling with LaMa using downloaded weights. It writes diagnostic images under `test-results/smoke-images/`.

Official model sources are linked directly from the Models screen and declared in `server/image_api.py`; runtime versions/source revisions are pinned in `scripts/setup-ai.ps1` and requirements/constraints files.
