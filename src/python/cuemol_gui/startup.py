import sys
import os

import cuemol
from cuemol_gui.gui_command_manager import GUICommandManager
from cuemol_gui.qt_new_scene_command import QtNewSceneCommand

from PySide2.QtWidgets import QApplication
from PySide2 import QtOpenGL
from cuemol_gui.main_window import MainWindow

# log_mgr = cuemol.getService("MsgLog")
# accum_msg = log_mgr.getAccumMsg()
# log_mgr.removeAccumMsg()
# print(f"accum_msg: {accum_msg}")

import qt5gui

mgr = GUICommandManager.get_instance()
mgr.register(QtNewSceneCommand())

app = QApplication(sys.argv)
main_window = MainWindow()

# QtMolWidget.setupTextRender()
# QtMolWidget.setupEventTimer()

sys.exit(app.exec_())
