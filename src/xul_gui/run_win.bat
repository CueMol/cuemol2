
IF DEFINED PROJ_DIR (
ECHO "DEFINED." %PROJ_DIR% ) ELSE (
ECHO "PROJ_DIR NOT DEFINED!!"
EXIT)

REM =================================================

SET BUILD_DIR=%PROJ_DIR%\cuemol2\winbuild\xul_Debug
REM SET BUILD_DIR=%PROJ_DIR%\cuemol2\winbuild\xul_Release

REM SET XUL_DIR=%PROJ_DIR%\xulrunner\xulrunner-1.9.2-src\obj-xr\dist\bin
REM SET XUL_DIR=%PROJ_DIR%\xulrunner\xulrunner-1.9.2.10-obj\dist\bin
SET XUL_DIR=%PROJ_DIR%\xulrunner\xulrunner2-sdk\bin

SET CUEMOL2_DIR=%PROJ_DIR%\cuemol2\src\xul_gui
SET CHROME_DIR=%CUEMOL2_DIR%\chrome

SET JARMAKER_DIR=%CUEMOL2_DIR%\jarmaker
SET JARMAKER=%JARMAKER_DIR%\make-jars.pl
SET PREPROC=%JARMAKER_DIR%\preprocessor.pl

REM =================================================

COPY %BUILD_DIR%\*.exe %CUEMOL2_DIR%\
REM COPY %BUILD_DIR%\js.dll %CUEMOL2_DIR%\
REM COPY %BUILD_DIR%\qlib.dll %CUEMOL2_DIR%\
REM COPY %BUILD_DIR%\qsys.dll %CUEMOL2_DIR%\
COPY %BUILD_DIR%\*.dll %CUEMOL2_DIR%\

mkdir %CUEMOL2_DIR%\components\
COPY %BUILD_DIR%\components\xpcqm2.dll %CUEMOL2_DIR%\components\
COPY %BUILD_DIR%\components\*.xpt %CUEMOL2_DIR%\components\

REM mkdir %CUEMOL2_DIR%\plugins\
REM COPY %BUILD_DIR%\plugins\npcuemol2.dll %CUEMOL2_DIR%\plugins\

DEL /Q %CHROME_DIR%\cuemol2\
DEL %CHROME_DIR%\cuemol2.jar
DEL %CHROME_DIR%\cuemol2.manifest

PUSHD %JARMAKER_DIR%
PERL %PREPROC% < %CHROME_DIR%\jar.mn > %CHROME_DIR%\jar.mn_processed
PERL %JARMAKER% -d %CHROME_DIR% -s %CHROME_DIR% -p %PREPROC% -z zip.exe < %CHROME_DIR%\jar.mn_processed
POPD

DEL /Q %CHROME_DIR%\cuemol2\

REM =================================================

%CUEMOL2_DIR%\cuemol2.exe -greapp %XUL_DIR% %CUEMOL2_DIR%
REM %CUEMOL2_DIR%\cuemol2.exe -ProfileManager -greapp %XUL_DIR% %CUEMOL2_DIR%

