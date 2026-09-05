# cuetty -- CueMol command-line interface

`cuetty` is the CLI front end to libcuemol2. It has two modes:

- **Headless rendering** -- load a scene file and write a PNG image, with no
  GUI, no window and no OpenGL context (`--render`).
- **Interactive shell** -- an embedded Python REPL with the CueMol API bound
  (`--interactive`).

---

## Build

`cuetty` is a separate CMake project that links against an installed
libcuemol2, so build libcuemol2 first. From `build_scripts/`:

```sh
task build_cli          # builds libcuemol2, then cuetty
```

The binary is installed to `<repo>/.build_out/cuemol2/bin/cuetty`. It is not
placed on `PATH`; invoke it by path.

`task build_cli` currently only has a macOS variant. Elsewhere, configure and
build `cli/` directly (see `build_scripts/build_cuetty_posix/run.sh` for the
cmake arguments).

**Headless rendering additionally requires libcuemol2 to be built with
`ENABLE_UMBREON=ON`**. CI builds every release artifact that way, but it is
*not* the default for a local build:

```sh
task install_umbreon                        # build+install umbreon into the deplibs prefix
ENABLE_UMBREON=ON task rebuild_libcuemol2   # reconfigure libcuemol2 with umbreon
task build_cli
```

Without it the exporter is never registered and `--render` fails with
`umbreon exporter is not available; libcuemol2 must be built with
ENABLE_UMBREON=ON` (exit status 1). Note that a later plain
`task rebuild_libcuemol2` turns the option back off.

---

## Headless rendering

### Synopsis

```sh
cuetty --input <scene.qsc> --render <out.png> [--width W] [--height H] [--camera NAME]
```

The scene is rendered with **umbreon**, the Embree-based CPU ray tracer.
Nothing in this path touches OpenGL: `UmbreonSceneExporter` needs only the
scene and a camera, and walks the scene through a file `DisplayContext`. No
`qsys::View` is created, so it runs on a machine with no display.

(The GL-based `PngSceneExporter` cannot be used this way -- it requires
`View::createOffScreenView()`, hence an OpenGL context.)

### Options

| Option | Default | Description |
|---|---|---|
| `--input <path>` | -- | Input scene file (`.qsc`). Required with `--render`. |
| `-r`, `--render <path>` | -- | Output PNG path. Supplying it selects render mode: the image is written and cuetty exits. |
| `--width <px>` | scene settings | Image width override. Must be positive. |
| `--height <px>` | scene settings | Image height override. Must be positive. |
| `--camera <name>` | `__current` | Camera to render from. Must exist in the scene. |
| `-c`, `--config <path>` | build-time default | `sysconfig.xml` to initialise from. |
| `-h`, `--help` | -- | Print the option list. |

The default camera name is `__current`, which is where the GUI stores the
current view when it writes a `.qsc`, so a GUI-authored scene always has it.
Any other camera saved in the scene can be named instead.

### Exit status

| Status | Meaning |
|---|---|
| `0` | Image written. |
| `1` | Scene could not be loaded, the named camera does not exist, an argument was invalid, or umbreon is not built in. |

The reason is printed to the log in every failure case, so a script can
branch on the status alone.

### Examples

```sh
CUETTY=.build_out/cuemol2/bin/cuetty

# Defaults (640x480, "__current" camera)
$CUETTY --input scene.qsc --render out.png

# Explicit size
$CUETTY --input scene.qsc --render out.png --width 1920 --height 1080

# A named camera saved in the scene
$CUETTY --input scene.qsc --render side.png --camera side_view

# In a shell script
if ! $CUETTY --input scene.qsc --render out.png --width 1200 --height 900; then
    echo "render failed" >&2
    exit 1
fi
```

### Render settings come from the scene

The exporter is configured from the render settings the scene file stores:
the `<appdata id="render" type="RenderSettings">` element the tritium
Rendering window writes per scene (see
`docs/architecture/scene-app-data.md`). A `.qsc` therefore renders the way
the GUI would render it -- ambient occlusion, shadows, global illumination
and its denoiser, the lighting balance, edge lines, the transparent
background, the image size in its unit at its DPI and, for the umbreon NPR
backend, the hatch look. The mapping onto the exporter is the C++
`UmbreonSceneExporter::applyRenderSettings`, shared with the GUI and the
Python module; cuetty has no settings logic of its own.

Which block of the settings is used follows the scene's `backend` choice:
`umbreon_npr` renders with hatching; anything else (`umbreon`, the unchosen
`""`, and `povray`, which cuetty cannot run) renders with plain umbreon.

A scene that stores no settings (never touched in the Rendering window)
renders with the `RenderSettings` class defaults -- the window's own starting
point: GI lighting with the OIDN denoiser, supersampling 3, 1200x1200 px --
and, as the window does for such a scene, with the projection of the camera
it was saved with (`View::setCameraAnim` copies the whole `Camera`, `perspec`
included, into the view's current camera, so the saved camera records what
the GL view was showing; the class default would render an orthographic
scene in perspective). A scene with stored settings keeps its own
`projection`.

Only the image size and the camera can be overridden from the command line:
`--width` / `--height` replace the stored (or default) size. The log says
which settings were used and what they resolved to:

```
render> scene render settings, backend 'umbreon_npr', 160x120, camera '__current'
```

### Text labels are not rendered

Labels (atom names, distance measurements, and other `drawString` output) do
**not** appear in the image. The file `DisplayContext` inherits the no-op
`gfx::DisplayContext::drawString`, so labels are silently skipped -- this is
not an error and does not stop the render. Everything else in a
label-bearing scene, including the measurement lines themselves, renders
normally.

---

## Interactive shell

```sh
cuetty --interactive [--input scene.qsc]
```

Starts the embedded Python interpreter with the CueMol API available. When
`--input` is given, the scene is loaded first, so the shell starts with it
already in the scene manager.

Requires libcuemol2 built with `ENABLE_PYTHON_EMBED=ON`; otherwise cuetty
prints `interactive shell is not available in this build` and exits normally.

---

## Rendering from Python instead

The same render is available from the `cuemol` Python module, driving the
identical C++ path (`load_scene` command, then the umbreon exporter
configured by `applyRenderSettings`) and producing byte-identical images:

```sh
python -m cuemol.umbreon_render scene.qsc out.png [-W 1920 -H 1080] [-c CAMERA]
```

```python
from cuemol import umbreon_render

# render_file returns the loaded scene, so further images (e.g. other
# cameras) can be rendered without reloading it. The size comes from the
# scene's settings unless given.
scene = umbreon_render.render_file("scene.qsc", "front.png")
umbreon_render.render(scene, "side.png", 1920, 1080, camera="side_view")

# To tweak a setting for one render, configure an exporter yourself
exporter = cuemol.strMgr().createHandler("umbreon", 2)
umbreon_render.apply_scene_settings(scene, exporter)
exporter.supersample = 1
```

Prefer the Python entry point for batch work -- several cameras, a sweep over
scenes, or anything that would otherwise be a shell loop. Use `cuetty` when a
self-contained binary with no Python environment is what you want.

Building the module: `task build_pytest`.

---

## Troubleshooting

**`umbreon exporter is not available`** -- libcuemol2 was built with
`ENABLE_UMBREON=OFF` (the default). See [Build](#build).

**`scene has no camera named '__current'`** -- the scene was not written by
the GUI, or was written without saving the view. Pass an existing camera with
`--camera`; `Scene::getCameraInfoJSON()` lists what a scene has.

**`cannot load scene file`** -- the path is wrong, or the file is not a
format any registered scene reader recognises. The format is guessed from the
file name, so the extension must be `.qsc`.

**The Python module fails to import with `Library not loaded:
libpython3.12.dylib`** -- libcuemol2 is built against a bundled Python that
differs from the interpreter running the module. Point the loader at the
bundled runtime, and use the interpreter's real path (a pyenv shim is a shell
script, and macOS SIP strips `DYLD_*` across it):

```sh
DYLD_LIBRARY_PATH=$HOME/tmp/proj64_deplibs/python/lib \
    .venv/bin/python -m cuemol.umbreon_render scene.qsc out.png
```

---

## See also

- `cli/render_scene.{hpp,cpp}` -- the render implementation, kept in its own
  translation unit so it can be reused from another entry point.
- `src/modules/rendering/UmbreonSceneExporter.qif` -- the full exporter
  property set and `applyRenderSettings`, the settings-to-exporter mapping;
  `RenderSettings.qif` (+ `Umbreon*RenderSettings.qif`) is the schema of the
  stored settings.
- `docs/architecture/scene-app-data.md` -- how the settings are stored in the
  scene and applied at render time by the GUI, cuetty and Python alike.
- `docs/architecture/umbreon-process-isolation.md` -- why umbreon renders
  in-process, and the Electron-specific memory limits that do **not** apply to
  a plain CLI process.
