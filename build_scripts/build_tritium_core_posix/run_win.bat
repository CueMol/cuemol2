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
   pushd %SCRIPT_DIR%\..\..
   for /f %%i in ('cd') do set TOP_DIR=%%i
   popd
) ELSE (
   SET TOP_DIR=%GITHUB_WORKSPACE%
)
echo TOP_DIR: %TOP_DIR%

REM Dependency versions are defined in build_scripts/deplibs.env
call %~dp0..\deplibs_env.bat
SET BOOST_DIR=%BASEDIR%\boost_%BOOST_VER%

REM Install location
SET INSTPATH=%BASEDIR%\cuemol2

REM Install workspace deps without lifecycle scripts (core's "install" hook runs
REM cmake-js build; we run it explicitly below).
pushd %TOP_DIR%\tritium
call pnpm install --ignore-scripts
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
popd

pushd %TOP_DIR%\tritium\core
call npx cmake-js build --CDLIBCUEMOL2_ROOT=%INSTPATH% --CDBoost_ROOT=%BOOST_DIR% --config Release
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

echo on
REM Windows build_libcuemol2 does not stage boost dlls, so copy them here.
copy %BASEDIR%\boost_%BOOST_VER%\lib\*mt-x64*.dll %INSTPATH%\bin\
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

REM Tests are run separately via test_tritium_core_posix\run_win.bat

popd
