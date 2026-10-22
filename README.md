# PARALLAX — 3D Inspection Suite

A local-first Three.js workbench for inspecting and comparing repeated 3D model edits. This repository is a **direct static GitHub Pages site**, requiring no Vite build, backend, or upload service.

**Live site:** https://vickmaspc.github.io/3D-Viewer-suite/

## Mouse and keyboard

| Input | Action |
|---|---|
| **Left mouse drag** | **Pan camera** (up, down, left, right) |
| **Right mouse drag** | **Vertical camera tilt ONLY** (pitch; horizontal movement is ignored) |
| **Two-finger touchpad swipe** | **Orbit yaw + pitch** (horizontal and vertical swipes) |
| **Touchpad pinch** | Zoom |
| **Mouse wheel** | Zoom (choose Mouse input if Auto guesses incorrectly) |
| Left-click, without dragging | Pick object or mesh |
| Shift + left-click | Measure surface points |
| F | Frame selected object (or all) |
| 1 / 2 / 3 / 4 / 5 / 6 | Front / Back / Left / Right / Top / Bottom |
| P | Toggle perspective / orthographic |
| O | Open model |
| M | Toggle measurement tool |
| H | Toggle selected visibility |
| Esc | Clear selection |

Press/dragging the touchpad primary button and holding the mouse left button both pan; browsers cannot reliably distinguish those two primary clicks. In Chrome on Windows, two-finger scrolling typically arrives as wheel events rather than touch pointers. The **INPUT** selector in the toolbar offers **Auto / Touchpad / Mouse** because the browser does not expose a guaranteed device type for wheel events. Two-finger swipe translates to orbit in Touchpad mode; Ctrl+wheel/pinch always zooms. Sensitivity and axis inversion are available under **Inspector → Tools** and persist locally.

Right-click context menus are disabled only over the WebGL viewport. This is *deliberately unlike Blender*.

## Supported formats

- GLB and GLTF: textured PBR assets, rigs and clips where supported by Three.js.
- OBJ + MTL and associated image textures. Load all companion files together, or open their folder.
- FBX and DAE: model/rig data and supported animation clips.
- STL and PLY: geometry inspection, with vertex colors when available.
- ZIP packs: drop the complete model archive straight onto the viewport; contents are expanded **in your browser** (up to 500 MB compressed per ZIP).
- Remote http(s) file URLs for A and B, subject to the server allowing CORS.

To compare Roxy variants: load your **original Roxy OBJ with its MTL and PNGs** (or original ZIP) into slot A; load your **Midnight Circuit GLB** into slot B. Select **A / B split** to see both with *exactly the same camera*. Alternatively use A/B overlay to check proportion and alignment.

The original Roxy assets are not bundled with the site; no model data is uploaded to a third-party service. They remain in your browser's memory.

## Inspection features

- Searchable-by-eye scene hierarchy, visibility toggles, picking, isolate and focus.
- Stats: triangles, vertices, meshes, materials, sizes, UV channels, rigged meshes, textures, and animation clips.
- Materials, clay, normals, wireframe, UV checker shading modes.
- Adjustable key/ambient/rim lighting, exposure, background, ground grid, bounds and skeleton overlays.
- Session-only material editing: color, metalness, roughness, alpha, emissive strength, double-sided.
- Two-point world-space measurements reported in **source model units**.
- Shared-camera side-by-side or opacity-overlaid comparisons.
- Six canonical viewpoints, perspective/orthographic switch, camera target pan, touchpad two-finger orbit, one-axis right-drag tilt, turntable rotation.
- Named camera bookmarks saved in browser localStorage.
- PNG screenshots, detailed JSON inspection reports, and portable JSON workspace setup files.
- Link sharing for URL-loaded models and a saved view. **Local files cannot be embedded in shared links.**
- Live FPS, draw call and triangle display.

## GitHub Pages

This is plain static HTML/CSS/JS served directly from the repository root. An Actions workflow at .github/workflows/pages.yml deploys on pushes to main. If the site does not start automatically, open **Settings → Pages → Build and deployment → Source → GitHub Actions**, and rerun the latest deployment workflow. Alternatively choose **Deploy from a branch → main → /(root)**. Only one deployment source should be active.

## Implementation

- index.html — interface markup and pinned Three.js import map.
- style.css — responsive workstation layout.
- src/app.js — WebGL rendering, loaders, custom pointer controls, touchpad gestures, picking, analysis and export.
- src/camera-input.js — wheel-event classification, normalization, zoom helper (with explicit device override).
- tests/smoke.mjs — real Chromium checks for camera gestures, mouse wheel/pinch, importing 3D formats and comparing revisions.
- .github/workflows/pages.yml — static Pages deployment.
- Dependencies fetched from pinned jsDelivr URLs: Three.js 0.169.0; fflate 0.8.2. A fresh load requires an internet connection.

## Scope and limitations

PARALLAX inspects existing meshes; it is **not** a vertex editor or exporter of newly changed 3D geometry. Material changes are temporary until refreshed. Visual comparisons are not numerical vertex-deviation heatmaps. Measurements use the file's own units without silently assuming meters, centimeters, or game units. Animation/material fidelity varies by format and external texture availability. ZIP expansion can consume considerable memory for large assets.
