import sys

from PySide2 import QtOpenGL  # NOQA
from PySide2.QtWidgets import QApplication

# app = Application(sys.argv)
app = QApplication(sys.argv)

import cuemol  # NOQA
# from cuemol_gui.application import Application

# Load commands
# TODO: move to other file
from cuemol_gui.gui_command_manager import GUICommandManager
from cuemol_gui.qt_new_scene_command import QtNewSceneCommand
from cuemol_gui.qt_load_scene_command import QtLoadSceneCommand
from cuemol_gui.qt_load_object_command import QtLoadObjectCommand

from cuemol_gui.main_window import MainWindow

# log_mgr = cuemol.getService("MsgLog")
# accum_msg = log_mgr.getAccumMsg()
# log_mgr.removeAccumMsg()
# print(f"accum_msg: {accum_msg}")

import qt5gui
qt5gui.qt5gui_init()

# Load commands
# TODO: move to other file
mgr = GUICommandManager.get_instance()
mgr.register(QtNewSceneCommand())
mgr.register(QtLoadSceneCommand())
mgr.register(QtLoadObjectCommand())

main_window = MainWindow()
sys.exit(app.exec_())
