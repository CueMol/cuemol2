REM
REM Usage: xullink.bat <version number>
REM Make win symlink between
REM    $PROJ_DIR\xulrunner\xulrunner-<version number>-sdk and
REM    $PROJ_DIR\xulrunner\xulrunner-sdk2
REM

SET XUL_DIR=%PROJ_DIR%\xulrunner
SET XUL_VER=%1

IF NOT DEFINED PROJ_DIR (
  echo "PROJ_DIR not defined"
  GOTO :END
)

IF NOT EXIST %XUL_DIR%\xulrunner-%XUL_VER%-sdk (
  echo "%XUL_DIR%\xulrunner-%XUL_VER%-sdk not exist"
  GOTO :END
)



rd %XUL_DIR%\xulrunner2-sdk

mklink /d %XUL_DIR%\xulrunner2-sdk %XUL_DIR%\xulrunner-%XUL_VER%-sdk

:END
