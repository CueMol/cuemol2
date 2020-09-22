import json

from cuemol_gui.event_manager import EventManager
from cuemol_gui.gui_command_manager import GUICommandManager
from PySide2 import QtCore, QtWidgets
from PySide2.QtCore import QSettings, Qt
# from PySide2.QtWidgets import QFileDialog
from PySide2.QtGui import QFont, QIcon
# from PySide2.QtOpenGL import QGLFormat
from PySide2.QtWidgets import (
    QAction,
    QApplication,
    QMainWindow,
    QMdiArea,
    QTabBar,
)
from qt5gui import QtMolWidget

import cuemol

# import main


# from main import event, CmdPrompt


class MainWindow(QMainWindow):
    def __init__(self, parent=None):
        # qt5gui.qt5gui_init()
        super().__init__(parent)
        self.init_ui()
        self.on_new_scene()
        self.show()

    def closeEvent(self, event):
        print("MainWindow.closeEvent called!!")
        self.save_settings()

    def on_exit_app(self):
        print("MainWindow.on_exit_app called!!")
        self.save_settings()
        QApplication.instance().quit()

    def on_log_event(self, aSlotID, aCatStr, aTgtTypeID, aEvtTypeID, aSrcID, aInfoStr):
        #     print("  slot ID="+str(aSlotID))
        #     print("  cat str="+str(aCatStr))
        #     print("  target ID="+str(aTgtTypeID))
        #     print("  event ID="+str(aEvtTypeID))
        #     print("  src ID="+str(aSrcID))
        # print("LogEvent info : "+aInfoStr)
        info = json.loads(str(aInfoStr))
        # print("info : "+str(info))
        # print("info.content : "+str(info["content"]))
        self.append_log(info["content"])
        #        if info["newline"]:
        #            self.appendLog("\n")

    def append_log(self, msg):
        self._logwnd.appendPlainText(msg)
        self._logwnd.verticalScrollBar().setValue(
            self._logwnd.verticalScrollBar().maximum()
        )

    def init_ui(self):

        self.create_widgets()
        self.create_menu()

        self.statusBar()

        self.resize(800, 600)
        self.load_settings()
        self.setWindowTitle("CueMol")

        # Setup log event handler
        log_mgr = cuemol.getService("MsgLog")
        accum_msg = log_mgr.getAccumMsg()
        log_mgr.removeAccumMsg()
        self.append_log(accum_msg)
        evm = EventManager.get_instance()
        evm.add_listener("log", -1, -1, -1, self.on_log_event)

    def create_menu(self):
        scene_open_act = QAction("&Open scene", self)
        scene_open_act.setShortcut("Ctrl+Shift+O")
        scene_open_act.setStatusTip("Open scene")
        scene_open_act.triggered.connect(self.on_open_scene)

        obj_open_act = QAction("&Open file", self)
        obj_open_act.setShortcut("Ctrl+O")
        obj_open_act.setStatusTip("Open file")
        obj_open_act.triggered.connect(self.on_open_object)

        new_scene_act = QAction("&New scene", self)
        new_scene_act.setShortcut("Ctrl+N")
        new_scene_act.setStatusTip("New scene")
        new_scene_act.triggered.connect(self.on_new_scene)

        exit_act = QAction(QIcon("exit.png"), "&Exit", self)
        exit_act.setShortcut("Ctrl+Q")
        exit_act.setStatusTip("Exit application")
        exit_act.triggered.connect(self.on_exit_app)

        menubar = self.menuBar()
        fileMenu = menubar.addMenu("&File")
        fileMenu.addAction(scene_open_act)
        fileMenu.addAction(new_scene_act)
        fileMenu.addAction(obj_open_act)
        fileMenu.addAction(exit_act)

    def active_mol_widget(self):
        active_wnd = self._mdi_area.activeSubWindow()
        if not active_wnd:
            return None
        mol_widget = active_wnd.findChild(QtMolWidget)
        return mol_widget

    def on_active_moltab_changed(self):
        print("onActiveMolTabChanged called!!")
        sc_mgr = cuemol.svc("SceneManager")

        mol_widget = self.active_mol_widget()
        if not mol_widget:
            print("XXXX MainWindow::onActivateMolTabChanged(): deactivated")
            return
        scid = mol_widget.getSceneID()
        vwid = mol_widget.getViewID()
        # title = active_wnd.windowTitle()
        print(f"XXXX MainWindow::onActivateMolTabChanged(sc:{scid} vw:{vwid})")

        active_scene = sc_mgr.getScene(scid)
        active_scene.setActiveViewID(vwid)

    def create_widgets(self):
        # Create tabbed mol view container
        mdi_area = QMdiArea()
        mdi_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        mdi_area.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        mdi_area.setViewMode(QMdiArea.TabbedView)
        mdi_area.setTabsClosable(True)
        mdi_area.setTabsMovable(True)
        # Change tabbar style
        tabbar = mdi_area.findChild(QTabBar)
        tabbar.setExpanding(False)
        # Listen tab events
        mdi_area.subWindowActivated.connect(self.on_active_moltab_changed)
        # self.connect(mdi_area, SIGNAL(subWindowActivated(QMdiSubWindow *)), this,
        #              SLOT(onActivateMolTabChanged()))
        self._mdi_area = mdi_area

        # Create log widget
        logwnd = QtWidgets.QPlainTextEdit(self)
        logwnd.setReadOnly(True)
        f = QFont("Monospace")
        f.setStyleHint(QFont.TypeWriter)
        logwnd.setFont(f)
        # print("Logwnd minimumSizeHint=" + str( self._logwnd.minimumSizeHint() ))
        logwnd.setMinimumSize(1, 1)
        self._logwnd = logwnd

        # Create molview/logwnd splitter
        splitter = QtWidgets.QSplitter(QtCore.Qt.Vertical)
        splitter.addWidget(mdi_area)
        splitter.addWidget(logwnd)
        # splitter.addWidget(loggrp)
        # splitter.setStretchFactor(0, 20)
        # splitter.setStretchFactor(1, 1)
        self._splitter = splitter

        # Set central widget
        self.setCentralWidget(splitter)

    def create_mol_widget(self):
        mol_widget = QtMolWidget()
        # print(f"mol widget: {mol_widget}")
        # print(f"mdi area: {self._mdi_area}")
        self._mdi_area.addSubWindow(mol_widget)
        return mol_widget

    def on_new_scene(self):
        mgr = GUICommandManager.get_instance()
        mgr.run_command("qt_new_scene", self)

    def on_open_scene(self):
        mgr = GUICommandManager.get_instance()
        mgr.run_command("qt_load_scene", self)

    def on_open_object(self):
        mgr = GUICommandManager.get_instance()
        mgr.run_command("qt_load_object", self)

    def save_settings(self):
        # qset = QSettings("BKR-LAB", "CueMol")
        qset = QSettings()
        qset.beginGroup("mainwindow")

        qset.setValue("geometry", self.saveGeometry())
        qset.setValue("savestate", self.saveState())
        qset.setValue("maximized", self.isMaximized())
        print(f"is_maximized: {self.isMaximized()}")
        if not self.isMaximized():
            qset.setValue("pos", self.pos())
            qset.setValue("size", self.size())

        # splitter state
        qset.setValue("splitterSize", self._splitter.saveState())

        qset.endGroup()

    def load_settings(self):
        # qset = QSettings("BKR-LAB", "CueMol")
        qset = QSettings()
        qset.beginGroup("mainwindow")

        self.restoreGeometry(qset.value("geometry", self.saveGeometry()))
        self.restoreState(qset.value("savestate", self.saveState()))
        self.move(qset.value("pos", self.pos()))
        self.resize(qset.value("size", self.size()))

        str_maximized = qset.value("maximized")
        print(f"str_maximized: {str_maximized}")
        if str_maximized == "true":
            self.showMaximized()

        # splitter state
        val = qset.value("splitterSize")
        if val is not None:
            self._splitter.restoreState(val)

        qset.endGroup()
