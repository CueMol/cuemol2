# Failed cells: idle self-check before the deplibs refresh (Apple M4, 2026-10-17)

`run.js --specs=1crn-cpk-idle,4v6x-cpk-idle` (09:51) and `--specs=1crn-cpk-idle` (09:52) on
this branch at `bb4b507a`, Release, built against a deplibs directory older than
`DEPLIBS_VERSION=v0.1.0` (glew-2.1.0, no OIDN). The worker crashed at start-up: the addon
`cuemol_internal.node` failed to load because 13 symbols of `gfx::ShaderObject` and
`qsys::GUIDisplayContext` were missing from `libcuemol2.dylib`, so every cell reported
`no canvas was bound`. run.js wrote no result file; these are the per-cell files it left
in the temp directory. After `task download_deplibs` and a clean Release build the same
cells passed (`bench-2026-10-17T01-01-04-505Z`). Details: CueMol/cuemol3_paper_data
`notes/2026-10-17.md`, 09:45-10:00.
