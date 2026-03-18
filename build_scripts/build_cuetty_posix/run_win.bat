echo on

REM Common Setup
if "%1"=="" (
   echo "arg1 not specified"
   exit /b 1
)
SET BASEDIR=%1
SET RUNNER_OS=Windows
SET RUNNER_ARCH=X64

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

SET BOOST_VER=1_84_0

REM Install location
SET INSTPATH=%BASEDIR%\cuemol2

REM Build
SET BUILD_DIR=%BASEDIR%/build_cuetty
mkdir %BUILD_DIR%
cd %BUILD_DIR%

REM SET BUILD_TYPE=Debug
SET BUILD_TYPE=Release

dir %BASEDIR%

REM Build cuetty
REM SET SCCACHE=-DCMAKE_C_COMPILER_LAUNCHER=sccache -DCMAKE_CXX_COMPILER_LAUNCHER=sccache
SET SCCACHE=

cmake -G Ninja -S %TOP_DIR%\cli -B %BUILD_DIR% ^
 -DCMAKE_INSTALL_PREFIX=%INSTPATH% ^
 -DCMAKE_PREFIX_PATH=%BASEDIR% ^
 -DBoost_ROOT=%BASEDIR%\boost_%BOOST_VER% ^
 -DLIBCUEMOL2_ROOT=%BASEDIR%\cuemol2 ^
 -DCMAKE_BUILD_TYPE=%BUILD_TYPE% ^
 %SCCACHE%
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

cmake --build %BUILD_DIR% --target clean --config %BUILD_TYPE%
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

cmake --build %BUILD_DIR% --parallel --config %BUILD_TYPE%
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

cmake --install %BUILD_DIR% --config %BUILD_TYPE%
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

copy %BASEDIR%\boost_%BOOST_VER%\lib\*mt-x64*.dll %INSTPATH%\bin\
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

