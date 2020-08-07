import sys
import json
from PySide2 import QtWidgets
from PySide2 import QtGui
from PySide2 import QtCore

from PySide2.QtWidgets import (QApplication, QWidget, QMainWindow,
                               QGridLayout, QVBoxLayout, QHBoxLayout,
                               QLabel, QLineEdit, QPushButton)
# from PySide2.QtOpenGL import QGLFormat
from PySide2.QtWidgets import QAction
# from PySide2.QtWidgets import QFileDialog
from PySide2.QtGui import QIcon
from PySide2.QtCore import QSettings

# import cuemol
# import main

# from qmqtgui import QtMolWidget

# from main import event, CmdPrompt

class MainWindow(QMainWindow):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.init_ui()

    def closeEvent(self, event):
        print("MainWindow.closeEvent called!!")
        self.save_settings()

    def on_exit_app(self):
        QApplication.instance().quit()

    def init_ui(self):

        # fopenAction = QAction('&Open file', self)
        # fopenAction.setShortcut('Ctrl+O')
        # fopenAction.setStatusTip('Open file')
        # fopenAction.triggered.connect(self.onOpenFile)

        exitAction = QAction(QIcon('exit.png'), '&Exit', self)
        exitAction.setShortcut('Ctrl+Q')
        exitAction.setStatusTip('Exit application')
        exitAction.triggered.connect(self.on_exit_app)

        self.statusBar()
        
        menubar = self.menuBar()
        fileMenu = menubar.addMenu('&File')
        # fileMenu.addAction(fopenAction)
        fileMenu.addAction(exitAction)
        
        self.resize(800, 600)
        self.load_settings()
        self.setWindowTitle('CueMol')
        self.show()

    def save_settings(self):
        qset = QSettings("BKR-LAB", "CueMol")
        qset.beginGroup("mainwindow")

        qset.setValue("geometry", self.saveGeometry())
        qset.setValue("savestate", self.saveState())
        qset.setValue("maximized", self.isMaximized())
        print(f"is_maximized: {self.isMaximized()}")
        if not self.isMaximized():
            qset.setValue("pos", self.pos())
            qset.setValue("size", self.size())


        qset.endGroup()

    def load_settings(self):
        qset = QSettings("BKR-LAB", "CueMol")

        qset.beginGroup("mainwindow")

        self.restoreGeometry(qset.value("geometry", self.saveGeometry()))
        self.restoreState(qset.value("savestate", self.saveState()))
        self.move(qset.value("pos", self.pos()))
        self.resize(qset.value("size", self.size()))

        str_maximized = qset.value("maximized")
        if str_maximized == "true":
            self.showMaximized()

        qset.endGroup()
