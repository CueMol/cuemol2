echo on

REM Common Setup
if "%1"=="" (
   echo "arg1 not specified"
   exit /b   
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

pushd %TOP_DIR%\nodejs
call npm install

call npx cmake-js compile --CDLIBCUEMOL2_ROOT=%INSTPATH% --CDBoost_ROOT=%BOOST_DIR%

echo on
copy %BASEDIR%\boost_%BOOST_VER%\lib\*mt-x64*.dll %INSTPATH%\bin\
set PATH=%PATH%;%INSTPATH%\bin\

call npm test


popd
