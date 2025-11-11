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

mkdir %TMPDIR%
%~d1
cd %TMPDIR%

SET DEPLIBS_DIR=%BASEDIR%\proj64_deplibs
echo "DEPLIBS_DIR:" %DEPLIBS_DIR%

REM Build cuetty
SET INSTPATH=%DEPLIBS_DIR%\cuemol2
rd /s /q build

SET CONFIG=Release
SET SCCACHE=-DCMAKE_C_COMPILER_LAUNCHER=sccache -DCMAKE_CXX_COMPILER_LAUNCHER=sccache
SET BUILDDIR=build_cli

cmake -G Ninja -S %GITHUB_WORKSPACE%\cli -B %BUILDDIR% ^
 -DCMAKE_INSTALL_PREFIX=%INSTPATH% ^
 -DCMAKE_PREFIX_PATH=%DEPLIBS_DIR% ^
 -DBoost_ROOT=%DEPLIBS_DIR%\boost_1_84_0 ^
 -DLIBCUEMOL2_ROOT=%DEPLIBS_DIR%\cuemol2 ^
 -DCMAKE_BUILD_TYPE=%CONFIG% ^
 %SCCACHE%

cmake --build %BUILDDIR% --target clean --config %CONFIG%
cmake --build %BUILDDIR% --parallel --config %CONFIG%
cmake --install %BUILDDIR% --config %CONFIG%

copy %DEPLIBS_DIR%\boost_1_84_0\lib\*mt-x64*.dll %INSTPATH%\bin\

REM check run
%INSTPATH%\bin\cuetty.exe

