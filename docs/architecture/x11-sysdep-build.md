# Linux (X11) sysdep and the CLI build configuration

## Context

`src/sysdep/` holds the per-platform OpenGL view / display-context backends
(`Wgl*` for Win32, `Cgl*` for macOS, `Xgl*` for X11) plus the shared
`ogl_core/` (`Oc*`) implementation that carries the actual GL 3.2 core-profile
rendering.

The X11 backend was never ported to the `Oc*` classes and no longer compiles:

- `XglView::XglView()` initializes members of the base class in its member
  initializer list (`m_bInitOK`, ...), which is not valid C++.
- `XglView.hpp` does not declare `super_t`, yet `XglView.cpp` uses it.
- `XglView.cpp` calls `OglView::setup()` and `XglDisplayContext` derives from
  `OglDisplayContext`; both classes were removed when `ogl_core` replaced the
  legacy OpenGL layer.

`src/CMakeLists.txt` selected the GL sysdep purely from
`find_package(OpenGL)` + `find_package(GLEW)`, and `src/sysdep/CMakeLists.txt`
added the `Xgl*` sources for every platform that is neither Win32 nor Apple.
A Linux machine with OpenGL and GLEW available (which the deplibs bundle
provides) therefore stopped in `sysdep` compilation, with no way to get a
usable build short of removing the dependency.

## Decision

Linux builds the **CLI configuration** instead of the (unbuildable) X11 GL
configuration:

```cmake
option(ENABLE_X11_SYSDEP "Build the unported X11 OpenGL sysdep backend" OFF)

if (OPENGL_FOUND AND GLEW_FOUND)
  if (WIN32 OR APPLE OR ENABLE_X11_SYSDEP)
    SET(BUILD_OPENGL_SYSDEP "TRUE")
    SET(USE_OPENGL "1")
  else ()
    SET(BUILD_OPENGL_SYSDEP "FALSE")   # -> GUI_ARCH = MB_GUI_ARCH_CLI
  endif ()
else ()
  SET(BUILD_OPENGL_SYSDEP "FALSE")
endif ()
```

`BUILD_OPENGL_SYSDEP=FALSE` is an existing, supported configuration: the
`sysdep` subdirectory is skipped, `libcuemol2` does not link it, `GUI_ARCH`
becomes `MB_GUI_ARCH_CLI` and `cuemol2::registerViewFactory()` installs the
`qsys::TTYView` factory (`src/libcuemol2_api/gui.cpp`). It is what a machine
without OpenGL/GLEW already built.

`ENABLE_X11_SYSDEP=ON` restores the old behaviour for anyone doing the port;
`src/sysdep/CMakeLists.txt` emits a warning in that case so the failure is not
a surprise.

## Why this does not affect tritium

The tritium Electron app does not use the sysdep backends. Its native addon
(`tritium/core/cxx_src/`) brings its own `ElecView` / `ElecDisplayContext` /
`ElecViewCap` and registers them with `node_jsbr::registerViewFactory()`; the
GL context lives on the JS (WebGL2) side. Nothing in the addon links or
references `sysdep`, so a Linux build of `libcuemol2` without the GL sysdep
still supports the full tritium rendering path. The desktop UXP GUI is the
only consumer of `Xgl*`, and it is not built on Linux either.

## Consequences

- Linux `task build_libcuemol2` succeeds and produces a `libcuemol2` with the
  CLI view factory; the C++ tests (which use `TTYView`) run unchanged.
- Nothing changes on Windows or macOS: `WIN32` / `APPLE` keep taking the GL
  path.
- Porting `Xgl*` to the `Oc*` API remains open. When it is done, the port
  should flip the default of `ENABLE_X11_SYSDEP` (or drop the option and the
  platform condition again).
