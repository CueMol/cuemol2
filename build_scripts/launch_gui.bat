SET TOP_DIR=d:\proj64_cmake\cuemol2
SET CONFIG_NAME=RelWithDebInfo
SET PYTHON=python3

SET CUEMOL_SYSCONFIG_PATH=%TOP_DIR%\src\xul_gui
SET CUEMOL_DLL_DIR=D:\proj64_cmake\bin;D:\proj64_cmake\boost\boost_1_72_0\lib64-msvc-14.2
SET PYTHONPATH=%TOP_DIR%\src\python;%TOP_DIR%\build\%CONFIG_NAME%;%TOP_DIR%\build\python

%PYTHON% %TOP_DIR%\src\python\cuemol_gui\startup.py

