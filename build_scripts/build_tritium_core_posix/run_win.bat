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

REM cmake-js defaults to the Visual Studio generator with cl. For clang-cl
REM (win_cc.bat) use Ninja instead, which needs no VS ClangCL toolset;
REM CUEMOL_WIN_CC=cl keeps the cmake-js default.
call %SCRIPT_DIR%..\win_cc.bat
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
SET CMAKEJS_WIN_OPT=
if /I not "%CUEMOL_WIN_CC%"=="cl" SET CMAKEJS_WIN_OPT=--generator Ninja %WIN_CC_COMPILER_OPT:-D=--CD%

pushd %TOP_DIR%\tritium\core
call npx cmake-js build %CMAKEJS_WIN_OPT% --CDLIBCUEMOL2_ROOT=%INSTPATH% --CDBoost_ROOT=%BOOST_DIR% --config Release
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

echo on
REM Windows build_libcuemol2 does not stage boost dlls, so copy them here.
copy %BASEDIR%\boost_%BOOST_VER%\lib\*mt-x64*.dll %INSTPATH%\bin\
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

REM Tests are run separately via test_tritium_core_posix\run_win.bat

popd
