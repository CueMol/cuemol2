echo on

REM Common Setup
if "%1"=="" (
   echo "arg1 not specified"
   exit /b   
)
SET BASEDIR=%1
SET RUNNER_OS=Windows
SET RUNNER_ARCH=X64
SET TMPDIR=%BASEDIR%\tmp

SET SCRIPT_DIR=%~dp0
echo SCRIPT_DIR: %SCRIPT_DIR%
if "%GITHUB_WORKSPACE%"=="" (
   cd %SCRIPT_DIR%\..
   for /f %%i in ('cd') do set TOP_DIR=%%i
) ELSE (
   SET TOP_DIR=%GITHUB_WORKSPACE%
)
echo TOP_DIR: %TOP_DIR%

mkdir %TMPDIR%
%~d1
cd %TMPDIR%

SET DEPLIBS_DIR=%BASEDIR%\proj64_deplibs
echo "DEPLIBS_DIR:" %DEPLIBS_DIR%
dir %DEPLIBS_DIR%

REM Remove CGAL install location file
del %DEPLIBS_DIR%\CGAL-4.14.3\lib\cmake\CGAL\CGALConfig-installation-dirs.cmake

REM Build libcuemol2
SET INSTPATH=%DEPLIBS_DIR%\cuemol2
rd /s /q build

cmake -S %TOP_DIR% -B build ^
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
 -DCMAKE_BUILD_TYPE=Release

cmake --build build --config Release
cmake --install build --config Release
