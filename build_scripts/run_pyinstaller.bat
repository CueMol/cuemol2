SET TOP_DIR=d:\proj64_cmake\cuemol2
SET CONFIG_NAME=RelWithDebInfo

SET CUEMOL_SYSCONFIG_PATH=%TOP_DIR%\src\xul_gui
SET CUEMOL_DLL_DIR=D:\proj64_cmake\bin;D:\proj64_cmake\boost\boost_1_72_0\lib64-msvc-14.2
SET PYTHONPATH=%TOP_DIR%\src\python;%TOP_DIR%\build\%CONFIG_NAME%;%TOP_DIR%\build\python

pyinstaller ^
%TOP_DIR%\src\python\cuemol_gui\startup.py ^
-n cuemol ^
-d all ^
--paths %TOP_DIR%\src\python ^
--paths %TOP_DIR%\build\%CONFIG_NAME% ^
--paths %TOP_DIR%\build\python ^
--paths d:\proj64_cmake\bin ^
--paths D:\proj64_cmake\boost\boost_1_72_0\lib64-msvc-14.2 ^
--hidden-import "_cuemol_internal" ^
--hidden-import "wrappers"
