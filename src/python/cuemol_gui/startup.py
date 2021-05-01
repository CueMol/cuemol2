import os
import sys

from PySide2 import QtOpenGL  # NOQA
from PySide2.QtWidgets import QApplication

# Set DLL directory for windows
if hasattr(os, "add_dll_directory") and "CUEMOL_DLL_DIR" in os.environ:
    dir_str = os.environ["CUEMOL_DLL_DIR"]
    dir_list = dir_str.split(";")
    for d in dir_list:
        print(f"add_dll_directory: {d}")
        os.add_dll_directory(d)

app = QApplication(sys.argv)

# Set application settings
app.setOrganizationName("BKR-LAB")
app.setApplicationName("CueMol")

import qt5gui  # NOQA

# Load commands
# TODO: move to other file
from cuemol_gui.gui_command_manager import GUICommandManager  # NOQA
from cuemol_gui.main_window import MainWindow  # NOQA
from cuemol_gui.qt_load_object_command import QtLoadObjectCommand  # NOQA
from cuemol_gui.qt_load_scene_command import QtLoadSceneCommand  # NOQA
from cuemol_gui.qt_new_scene_command import QtNewSceneCommand  # NOQA

import cuemol  # NOQA

qt5gui.qt5gui_init()

# Load commands
# TODO: move to other file
mgr = GUICommandManager.get_instance()
mgr.register(QtNewSceneCommand())
mgr.register(QtLoadSceneCommand())
mgr.register(QtLoadObjectCommand())

main_window = MainWindow()
sys.exit(app.exec_())
