echo on

REM Common Setup
if "%1"=="" (
   echo "arg1 (deplibs_dir) not specified"
   exit /b   
)

SET DEPLIBS_DIR=%1
REM SET RUNNER_OS=Windows
REM SET RUNNER_ARCH=X64
SET CONFIG=Release

SET SCRIPT_DIR=%~dp0
echo SCRIPT_DIR: %SCRIPT_DIR%
if "%GITHUB_WORKSPACE%"=="" (
   cd %SCRIPT_DIR%\..
   for /f %%i in ('cd') do set TOP_DIR=%%i
) ELSE (
   SET TOP_DIR=%GITHUB_WORKSPACE%
)
echo TOP_DIR: %TOP_DIR%

SET TMPDIR=%DEPLIBS_DIR%\tmp
mkdir %TMPDIR%
%~d1
cd %TMPDIR%

echo "DEPLIBS_DIR:" %DEPLIBS_DIR%
dir %DEPLIBS_DIR%

REM Remove CGAL install location file
del %DEPLIBS_DIR%\CGAL-4.14.3\lib\cmake\CGAL\CGALConfig-installation-dirs.cmake

REM Build libcuemol2
SET INSTPATH=%DEPLIBS_DIR%\cuemol2
rd /s /q build

cmake -G Ninja -S %TOP_DIR% -B build ^
 -DCMAKE_INSTALL_PREFIX=%INSTPATH% ^
 -DBoost_ROOT=%DEPLIBS_DIR%\boost_1_84_0 ^
 -DCGAL_ROOT=%DEPLIBS_DIR%\CGAL-4.14.3 ^
 -DFFTW_ROOT=%DEPLIBS_DIR%\fftw-3.3.10 ^
 -DLCMS2_ROOT=%DEPLIBS_DIR%\lcms2-2.16 ^
 -DGLEW_ROOT=%DEPLIBS_DIR%\glew-2.2.0 ^
 -DLibLZMA_ROOT=%DEPLIBS_DIR%\xz-5.2.12 ^
 -DBUILD_PYTHON_BINDINGS=OFF ^
 -DBUILD_PYTHON_MODULE=OFF ^
 -DBUILD_XPCJS_BINDINGS=ON ^
 -DCGAL_DO_NOT_WARN_ABOUT_CMAKE_BUILD_TYPE=TRUE ^
 -DCGAL_DISABLE_GMP=TRUE ^
 -DCGAL_HEADER_ONLY=TRUE ^
 -DCMAKE_BUILD_TYPE=%CONFIG%

cmake --build build --config %CONFIG%
cmake --install build --config %CONFIG%
