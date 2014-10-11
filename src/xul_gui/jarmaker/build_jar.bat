
SET XULDEPLOY_DIR=..\..\..\winbuild\xul_Debug\chrome
SET SRCDIR=..\chrome

DEL %XULDEPLOY_DIR%\cuemol2.jar
DEL %XULDEPLOY_DIR%\cuemol2.manifest

perl make-jars.pl -d %XULDEPLOY_DIR% -s %SRCDIR% -p preprocessor.pl -z zip.exe < %SRCDIR%\jar.mn

