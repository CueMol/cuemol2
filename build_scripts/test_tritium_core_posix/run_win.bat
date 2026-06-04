echo on

REM Common Setup
if "%1"=="" (
   echo "arg1 not specified"
   exit /b 1
)
SET BASEDIR=%1

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

REM Install location
SET INSTPATH=%BASEDIR%\cuemol2

pushd %TOP_DIR%\tritium\core

set PATH=%PATH%;%INSTPATH%\bin\

call pnpm run test
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

popd
