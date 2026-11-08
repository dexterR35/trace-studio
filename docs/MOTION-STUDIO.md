# Motion Studio guide

## What you can do

- **Build 2D and 3D scenes.** Add text, shapes and cubes, import PNG, SVG, JPEG or WebP images, or bring in Blender objects and animations as GLB files.
- **Draw motion paths.** Click A, B and additional points, or choose Freehand and drag. New elements start stationary at the canvas center. Bézier curves, handles and straight segments remain editable.
- **Place points mathematically.** Inspect or edit every point's XY/XYZ coordinates. Choose A and B, then insert any count within the 60-point limit at equal path distances or travel times. Straight XYZ subdivision is exact; curved distance uses the engine's sampled distance table. Equal-time insertion sets manual arrival times. Subdivision preserves the curve geometry, while added transform keys can change interpolation.
- **Map movement in depth.** Position points along X, Y and Z, measure depth from the Z=0 plane, and inspect paths from front, side, top or orbit views beside the camera preview.
- **Blend animation into video.** Import an MP4, WebM or MOV up to 30 seconds. Keep the original sound, add elements on top, and mark video sections on a separate timeline track.
- **Hide motion behind real objects.** Draw rectangle, ellipse or custom blockers. Invisible masks reveal the original footage. Animate position, size and outline with keyframes, or limit a blocker to a video section.
- **Track a foreground subject.** Analyze a selection, inspect its mask and start tracking. Follow a drawn shape locally, or connect the optional [SAM 3 service](../server/README.md) for editable subject outlines. Tracking stops at section boundaries, detected cuts or lost subjects.
- **Animate every element.** Move, rotate, scale and fade with independent asset keyframes. Play a model's own animation alongside its motion path.
- **Control timing.** Edit keyframes, adjust speed along the path, set clip duration and preview at 24, 30 or 60 fps.
- **Add keys across a clip.** Choose exact start and end frames and generate editable path or blocker keys at regular intervals, such as every 2 seconds. Exports render every frame between your keys.
- **Frame your composition.** Adjust camera angle, lens, zoom and depth of field. Choose landscape, portrait, square or custom scene sizes, including HD and 4K.
- **Keep your work.** Autosave locally, undo changes, and save or reopen editable `.trace.json` projects with embedded assets. Local editing stays in your browser; optional SAM 3 analysis sends the video to your configured service.

## Export

| Format | What you get |
| --- | --- |
| **MP4** | Video with a solid background. |
| **WebM · VP9** | Transparent video for animation overlays. |
| **PNG sequence · ZIP** | Lossless frames with transparency for further editing. |
| **Motion JSON** | Embedded assets, editable project, mathematical path controls, coordinate conventions, camera and per-frame reconstruction data. |

Choose resolution, codec and quality. Exports use the scene's frame rate; available video codecs depend on your browser and device.

### Precise paths and motion JSON

Press **P** or choose **Draw path**. With an element selected, this replaces its path; on an empty scene, Finish creates a small path element. Cancel leaves the scene untouched. The default **Click points** mode places a straight path through your clicks; **Finish path** or **Enter** commits it. **Escape** cancels the temporary draft without replacing the previous path. **Freehand** commits a smooth path when you release the pointer. In 3D, draw directly in the scene map or camera. Choose **XY / fixed Z**, **XZ / fixed Y**, or **YZ / fixed X** and enter its offset. The map aligns to that plane and pauses orbiting while drawing. Switch planes between clicks to build a path with depth; exact screen-ray/plane intersections supply XYZ coordinates. Both point clicks and freehand work in the map. Then adjust individual XYZ values in the coordinate table, Transform controls or scene map. Undo restores a replaced path. The five-point sample exists only under the explicit cube example action.

Open **Properties → Path points** for **All point coordinates & times** and **Add points between A and B**. The A/B selectors accept any ordered pair of points; **Use selected point** binds either endpoint to the point clicked on the canvas. Original points and curve controls are retained. New points are transform keys, so inspect scale, rotation and speed after subdivision.

Choose **Motion JSON** in the header, **Project menu → Export motion JSON**, or the JSON button in the video-export dialog. **View JSON** previews the first 60,000 characters; **Download motion JSON** saves the complete `.motion.json`. Sampling defaults to scene FPS and includes an extra exact terminal endpoint, which is distinct from the rendered frames. Source-only exports retain all editable controls and distance/time lookup tables. Large scenes can lower JSON sampling FPS or disable evaluated samples; the safety limit is 200,000 layer evaluations.

The `trace-motion-reference/1.0` schema includes the full original project and embedded image/GLB/video assets, canvas size/aspect/FPS, top-left XY coordinates, Z depth, normalized values, center anchors, path node IDs and arrival times, absolute cubic controls, sampled arc length/time tables, speed settings, independent asset keys, transforms, quaternions/matrices, projected screen quads, visibility, evaluated blockers, model clip times, camera lens/projection/view matrices, focus and depth-of-field settings. Velocities and accelerations are explicitly identified as finite-difference estimates. Projected plane quads are not mesh bounds for 3D objects. Pixel geometry and camera motion are deterministic; a generative video model may still approximate these instructions.

Use **Open project** to reopen either `.trace.json` or `.motion.json`; the latter restores its embedded `project`. Verification covers exact straight XYZ subdivisions, cubic subdivision preservation, equal-time arrival keys, single-edit Undo, frame-by-frame agreement with playback, camera projection, fractional endpoints and source precision.

### Director: cinematic shots and Seedance reference packages

Open **Motion → Director** in the header. Choose a **15-second** or **30-second** sequence. Existing elements, paths and independent animation keys remain editable. The shot strip above the timeline seeks to a cut; double-click a shot to edit it. **Project menu → Director example** opens an explicit three-shot blocking example, with Undo returning to your previous scene.

- **Shots & camera:** edit names, start/end times and action; divide a shot, split at the playhead, or delete a shot and merge its time into a neighbor. Shot ranges must cover the sequence without gaps or overlaps before package export. Sequence duration controls playback; changing it rescales shot times while existing element animation keeps its timing and holds its end pose.
- **Framing:** draw start/end boxes directly on the canvas, or select an element and mark a face/detail region. A marked region uses local asset UV coordinates, so it follows the element's scale and rotation. Target tracking can follow the element or hold its framing from the shot start. Start/end magnification and linear/smooth/hold easing drive pans and pushes. Crops preserve the canvas aspect ratio and may reveal padding outside its boundaries. Canvas crop drawing clears the element target.
- **3D camera:** expand lens/focus settings for separate start/end world position, look-at target, roll, zoom, physical lens, depth of field and focus target. Auto lens preserves the original canvas-fit FOV; enable a physical lens for conventional camera dolly behavior. Lens and DOF affect 3D, while XY framing works in both modes. Camera coordinates are centered Three.js world coordinates with +Y up. Target framing describes a local rectangular region, not detected facial landmarks or 3D mesh bounds.
- **Cast & elements:** assign character/prop/environment/effect roles, appearance descriptions, identity requirements and performance notes. Attach an independent appearance image to a simple stand-in, and choose which elements contribute image references. Stable element IDs bind shots, the manifest and exported data. Performance, dialogue and audio notes guide generation; they do not synthesize local acting or audio.
- **Seedance package:** choose the target model, visual style, continuity notes and audio direction. The local ZIP contains H.264 MP4 animatics (24 FPS, longest side at most 1280 px), appearance PNGs, separate start/end shot keyframes, original-resolution per-frame `motion.json`, an editable `.trace.json`, shot prompts, media bindings, request templates and a manifest. Export supports cancellation and requires browser H.264 encoding. Animatics are silent; sound intentions go into prompts. Keyframes are optional review images and are not attached to the API templates.

The Seedance 2.0 profile splits a 30-second sequence into **two 15-second reference videos/tasks**; the 2.5 profile exports **one 30-second task**. Longer local sequences split into integer-second parts within each profile's limit. Image budgets are checked before rendering (2.0: 9; 2.5: 30); deselect extra references in Cast. Choose a supported aspect ratio: 16:9, 9:16, 1:1, 4:3, 3:4 or 21:9. Model access depends on your provider account. See the [official task API](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api) and [2.5 prompting guide](https://docs.byteplus.com/id/docs/modelark/seedance-2-5-prompt-guide).

Upload each reference clip and its numbered appearance images in a supported Seedance interface, then use the matching prompt. API templates require your account-enabled model ID and uploaded media URLs; the application does not upload, call Seedance or incur generation costs. For 2.5 the prompt uses integer-second timestamps; exact fractional cut times remain in the source JSON and rendered reference. Join separately generated clips afterward. Real-person references may require the provider's supported portrait workflow.

Custom JSON is **not an executable Seedance scene format**. The local renderer follows the stored geometry and shot camera math; generated video may approximate positions, framing, motion, faces and timing. The full motion schema includes the directing source, cast details, per-frame shot ID/progress, evaluated camera settings and matrices, aspect-preserving crop, camera-aware screen coordinates and final 2D affine matrices. Scene footage and blockers are composited before the same framing transform used by preview and export. Switching 3D to 2D preserves cuts/framing but flattens using the scene's base camera and resets shot cameras; animated 3D perspective cannot be reproduced exactly in 2D.
