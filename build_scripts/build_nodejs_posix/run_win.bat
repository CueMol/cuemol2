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

SET BOOST_VER=1_84_0
SET BOOST_DIR=%BASEDIR%\boost_%BOOST_VER%

REM Install location
SET INSTPATH=%BASEDIR%\cuemol2

pushd %TOP_DIR%\tritium\core
REM Use --ignore-scripts to skip the cmake-js lifecycle hook (run it manually below with explicit flags)
call npm install --ignore-scripts
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

call npx cmake-js compile --CDLIBCUEMOL2_ROOT=%INSTPATH% --CDBoost_ROOT=%BOOST_DIR%
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

echo on
copy %BASEDIR%\boost_%BOOST_VER%\lib\*mt-x64*.dll %INSTPATH%\bin\
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

set PATH=%PATH%;%INSTPATH%\bin\

call npm test
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

popd
