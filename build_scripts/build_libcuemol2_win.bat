echo on

REM Dependency versions
SET BOOST_VER=1_84_0
SET FFTW_VER=3.3.10
SET LCMS2_VER=2.17
SET GLEW_VER=2.2.0
SET CGAL_VER=6.1
REM SET CGAL_VER=4.14.3
SET LZMA_VER=5.2.12


REM Common Setup
if "%1"=="" (
   echo "arg1 (deplibs_dir) not specified"
   exit /b   
)

SET BASEDIR=%1
REM SET RUNNER_OS=Windows
REM SET RUNNER_ARCH=X64
SET CONFIG=%2

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
 -DCGAL_DO_NOT_WARN_ABOUT_CMAKE_BUILD_TYPE=TRUE ^
 -DCGAL_DISABLE_GMP=TRUE ^
 -DCGAL_HEADER_ONLY=TRUE ^
 -DCMAKE_BUILD_TYPE=%CONFIG% ^
 %SCCACHE%

cmake --build %BUILDDIR% --target clean --config %CONFIG%
cmake --build %BUILDDIR% --parallel --config %CONFIG%
cmake --install %BUILDDIR% --config %CONFIG%

sccache -s

popd
