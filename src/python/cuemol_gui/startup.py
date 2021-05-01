import os
import sys

from PySide2 import QtOpenGL  # NOQA
from PySide2.QtWidgets import QApplication

import cuemol  # NOQA

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


def _run_qt5gui_init():
    import qt5gui  # NOQA

    qt5gui.qt5gui_init()


def _load_gui_commands():
    from cuemol_gui.commands import load_commands  # NOQA

    load_commands()


def _launch_main_window():
    from cuemol_gui.main_window import MainWindow  # NOQA

    _ = MainWindow()
    sys.exit(app.exec_())


_run_qt5gui_init()
_load_gui_commands()
_launch_main_window()
