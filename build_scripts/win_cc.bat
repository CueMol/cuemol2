REM Windows compiler selection shared by the CMake build batch files.
REM Keep in sync with win_cc.sh.
REM
REM   CUEMOL_WIN_CC=clang-cl (default) -- clang-cl + lld-link
REM   CUEMOL_WIN_CC=cl                 -- MSVC cl (the pre-clang toolchain)
REM
REM Both need an x64 MSVC dev environment (vcvars). clang-cl shares the MSVC
REM ABI, so the vc143-tagged Boost libs are selected explicitly.
REM WIN_CC_COMPILER_OPT holds the compiler choice alone (for cmake-js, which
REM sets its own CRT); WIN_CC_OPT adds the /MD CRT.

if "%CUEMOL_WIN_CC%"=="" SET CUEMOL_WIN_CC=clang-cl
if /I "%CUEMOL_WIN_CC%"=="cl" (
  SET WIN_CC_COMPILER_OPT=-DCMAKE_C_COMPILER=cl -DCMAKE_CXX_COMPILER=cl
) ELSE if /I "%CUEMOL_WIN_CC%"=="clang-cl" (
  SET WIN_CC_COMPILER_OPT=-DCMAKE_C_COMPILER=clang-cl -DCMAKE_CXX_COMPILER=clang-cl -DCMAKE_LINKER=lld-link -DBoost_COMPILER=vc143
) ELSE (
  echo Unknown CUEMOL_WIN_CC: %CUEMOL_WIN_CC% ^(expected clang-cl or cl^)
  exit /b 1
)
SET WIN_CC_OPT=%WIN_CC_COMPILER_OPT% -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL
