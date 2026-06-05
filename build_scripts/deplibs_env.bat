@echo off
REM Load build_scripts/deplibs.env into the caller's environment (cmd loader).
REM Invoke with `call` so the SET assignments persist in the caller.
for /f "usebackq eol=# tokens=1,2 delims==" %%a in ("%~dp0deplibs.env") do set "%%a=%%b"
