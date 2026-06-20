echo on

REM Dependency versions are defined in build_scripts/deplibs.env
call %~dp0deplibs_env.bat
REM GLEW differs per-OS; use the Windows value from deplibs.env.
SET GLEW_VER=%GLEW_VER_WINDOWS%

REM Common Setup
if "%1"=="" (
   echo "arg1 (deplibs_dir) not specified"
   exit /b 1
)

SET BASEDIR=%1
REM SET RUNNER_OS=Windows
REM SET RUNNER_ARCH=X64
SET CONFIG=%2

REM oneTBB is on by default (override by setting ENABLE_TBB=OFF). When ON, build
REM oneTBB with the dynamic CRT (/MD) to match the rest of the build.
if "%ENABLE_TBB%"=="" SET ENABLE_TBB=ON
if /I "%ENABLE_TBB%"=="ON" (
  SET TBB_OPT=-DENABLE_TBB=ON -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreadedDLL
) ELSE (
  SET TBB_OPT=-DENABLE_TBB=OFF
)

SET SCRIPT_DIR=%~dp0
echo SCRIPT_DIR: %SCRIPT_DIR%
if "%GITHUB_WORKSPACE%"=="" (
   pushd %SCRIPT_DIR%\..
   for /f %%i in ('cd') do set TOP_DIR=%%i
   popd
) ELSE (
   SET TOP_DIR=%GITHUB_WORKSPACE%
)
echo TOP_DIR: %TOP_DIR%

SET TMPDIR=%BASEDIR%\tmp
mkdir %TMPDIR%
%~d1
pushd %TMPDIR%

echo "BASEDIR:" %BASEDIR%
dir %BASEDIR%

REM Remove CGAL install location file
REM del %BASEDIR%\CGAL-4.14.3\lib\cmake\CGAL\CGALConfig-installation-dirs.cmake

REM Build libcuemol2
SET INSTPATH=%BASEDIR%\cuemol2
SET BUILDDIR=build_libcuemol2
rd /s /q %BUILDDIR%

if %CONFIG%=="Debug" (
  SET SCCACHE=
) ELSE (
  SET SCCACHE=-DCMAKE_C_COMPILER_LAUNCHER=sccache -DCMAKE_CXX_COMPILER_LAUNCHER=sccache
)

cmake -G Ninja -S %TOP_DIR% -B %BUILDDIR% ^
 -DCMAKE_C_COMPILER=cl ^
 -DCMAKE_CXX_COMPILER=cl ^
 -DPERL_EXECUTABLE=C:\Strawberry\perl\bin\perl.exe ^
 -DCMAKE_INSTALL_PREFIX=%INSTPATH% ^
 -DBoost_ROOT=%BASEDIR%\boost_%BOOST_VER% ^
 -DCGAL_ROOT=%BASEDIR%\CGAL-%CGAL_VER%\lib\cmake\CGAL ^
 -DFFTW_ROOT=%BASEDIR%\fftw-%FFTW_VER% ^
 -DLCMS2_ROOT=%BASEDIR%\lcms2-%LCMS2_VER% ^
 -DGLEW_ROOT=%BASEDIR%\glew-%GLEW_VER% ^
 -DLibLZMA_ROOT=%BASEDIR%\xz-%LZMA_VER% ^
 -DBUILD_PYTHON_BINDINGS=OFF ^
 -DBUILD_PYTHON_MODULE=OFF ^
 -DBUILD_XPCJS_BINDINGS=ON ^
 -DBUILD_NODEJS_BINDINGS=ON ^
 -DENABLE_TYPESCRIPT=ON ^
 %TBB_OPT% ^
 -DCGAL_DO_NOT_WARN_ABOUT_CMAKE_BUILD_TYPE=TRUE ^
 -DCGAL_DISABLE_GMP=TRUE ^
 -DCGAL_HEADER_ONLY=TRUE ^
 -DCMAKE_BUILD_TYPE=%CONFIG% ^
 %SCCACHE%
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

cmake --build %BUILDDIR% --target clean --config %CONFIG%
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

cmake --build %BUILDDIR% --parallel --config %CONFIG%
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

cmake --install %BUILDDIR% --config %CONFIG%
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

sccache -s

popd
