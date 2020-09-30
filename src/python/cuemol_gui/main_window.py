import json

from cuemol_gui.event_manager import EventManager
from cuemol_gui.gui_command_manager import GUICommandManager
from PySide2 import QtCore, QtWidgets
from PySide2.QtCore import QSettings, Qt
# from PySide2.QtWidgets import QFileDialog
from PySide2.QtGui import QFont, QIcon
# from PySide2.QtOpenGL import QGLFormat
from PySide2.QtWidgets import QAction, QApplication, QMainWindow, QMdiArea, QTabBar
from qt5gui import QtMolWidget

import cuemol

# import main


# from main import event, CmdPrompt


class MainWindow(QMainWindow):
    def __init__(self, parent=None):
        # qt5gui.qt5gui_init()
        super().__init__(parent)
        self.init_ui()
        self.show()
        self.on_new_scene()

    def closeEvent(self, event):
        print("MainWindow.closeEvent called!!")
        self.save_settings()

    def on_exit_app(self):
        print("MainWindow.on_exit_app called!!")
        self.save_settings()
        QApplication.instance().quit()

    def on_log_event(self, aSlotID, aCatStr, aTgtTypeID, aEvtTypeID, aSrcID, aInfoStr):
        info = json.loads(str(aInfoStr))
        self.append_log(info["content"])

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
        evm.add_listener(
            "log",
            evm.impl.SEM_ANY,  # source type
            evm.impl.SEM_LOG,  # event type
            evm.impl.SEM_ANY,  # source uid
            self.on_log_event,
        )

    def create_menu(self):
        menubar = self.menuBar()

        # File menu

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

        fileMenu = menubar.addMenu("&File")
        fileMenu.addAction(scene_open_act)
        fileMenu.addAction(new_scene_act)
        fileMenu.addAction(obj_open_act)
        fileMenu.addAction(exit_act)

        # Edit menu

        undo_act = QAction("&Undo", self)
        undo_act.setShortcut("Ctrl+Z")
        undo_act.setStatusTip("Undo")
        undo_act.triggered.connect(self.on_undo)
        self._undo_act = undo_act

        redo_act = QAction("&Redo", self)
        redo_act.setShortcut("Ctrl+Shift+Z")
        redo_act.setStatusTip("Redo")
        redo_act.triggered.connect(self.on_redo)
        self._redo_act = redo_act

        editMenu = menubar.addMenu("&Edit")
        editMenu.addAction(undo_act)
        editMenu.addAction(redo_act)

        editMenu.aboutToShow.connect(self.on_edit_menu_showing)

    def get_undo_size(self):
        scene, _ = self.active_scene_view()
        print(f"undo scene: {scene}")
        if scene is None:
            return 0
        nundo = scene.getUndoSize()
        print(f"undo size: {nundo}")
        return nundo

    def get_top_undo_description(self):
        scene, _ = self.active_scene_view()
        print(f"undo scene: {scene}")
        if scene is None:
            return None
        undo_desc = scene.getUndoDesc(0)
        print(f"undo desc: {undo_desc}")
        return undo_desc

    def get_redo_size(self):
        scene, _ = self.active_scene_view()
        if scene is None:
            return 0
        nredo = scene.getRedoSize()
        return nredo

    def get_top_redo_description(self):
        scene, _ = self.active_scene_view()
        print(f"redo scene: {scene}")
        if scene is None:
            return None
        redo_desc = scene.getRedoDesc(0)
        print(f"redo desc: {redo_desc}")
        return redo_desc

    def on_edit_menu_showing(self):
        print("on_edit_menu_showing triggered")
        # Update undo menu
        n_undo = self.get_undo_size()
        if n_undo > 0:
            self._undo_act.setEnabled(True)
            desc = self.get_top_undo_description()
            if desc is not None:
                self._undo_act.setText(f"&Undo: {desc}")
            else:
                self._undo_act.setText("&Undo")
        else:
            self._undo_act.setEnabled(False)
            self._undo_act.setText("&Undo")

        # Update redo menu
        n_redo = self.get_redo_size()
        if n_redo > 0:
            self._redo_act.setEnabled(True)
            desc = self.get_top_redo_description()
            if desc is not None:
                self._redo_act.setText(f"&Redo: {desc}")
            else:
                self._redo_act.setText("&Redo")
        else:
            self._redo_act.setEnabled(False)
            self._redo_act.setText("&Redo")

    def active_mol_widget(self):
        active_wnd = self._mdi_area.activeSubWindow()
        print(f"active_wnd: {active_wnd}")
        if active_wnd is None:
            return None
        mol_widget = active_wnd.findChild(QtMolWidget)
        print(f"active mol_widget: {mol_widget}")
        return mol_widget

    def active_scene_view_ids(self):
        mol_widget = self.active_mol_widget()
        if mol_widget is None:
            return None, None
        scid = mol_widget.getSceneID()
        vwid = mol_widget.getViewID()
        print(f"active : {scid}, {vwid}")
        return scid, vwid

    def active_scene_view(self):
        scid, vwid = self.active_scene_view_ids()
        if scid is None:
            return None, None
        mgr = cuemol.svc("SceneManager")
        return mgr.getScene(scid), mgr.getScene(vwid)

    def on_active_moltab_changed(self):
        print("onActiveMolTabChanged called!!")
        scid, vwid = self.active_scene_view_ids()
        if scid is None:
            print("XXXX MainWindow::onActivateMolTabChanged(): deactivated")
            return

        print(f"MainWindow::onActivateMolTabChanged(sc:{scid} vw:{vwid})")
        sc_mgr = cuemol.svc("SceneManager")
        active_scene = sc_mgr.getScene(scid)
        active_scene.setActiveViewID(vwid)

        evm = EventManager.get_instance()
        evm.add_listener(
            "mouseClicked",
            evm.impl.SEM_INDEV,  # target type
            evm.impl.SEM_ANY,  # event type
            vwid,  # source uid
            self.on_molview_clicked,
        )

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
        self._mdi_area.addSubWindow(mol_widget)
        print(f"create_mol_widget mol widget: {mol_widget}")
        print(f"create_mol_widget mdi area: {self._mdi_area}")
        # self.active_mol_widget()
        return mol_widget

    def on_molview_clicked(self, aSlotID, aCatStr, aTgtTypeID, aEvtTypeID, aSrcID, aInfoStr):
        print("on_molview_clicked")

    def on_new_scene(self):
        mgr = GUICommandManager.get_instance()
        mgr.run_command("qt_new_scene", self)

    def on_open_scene(self):
        mgr = GUICommandManager.get_instance()
        mgr.run_command("qt_load_scene", self)

    def on_open_object(self):
        mgr = GUICommandManager.get_instance()
        mgr.run_command("qt_load_object", self)

    def on_undo(self):
        scene, _ = self.active_scene_view()
        print(f"undo scene: {scene}")
        if scene is None:
            return
        print(f"undo size: {scene.getUndoSize()}")
        scene.undo(0)

    def on_redo(self):
        scene, _ = self.active_scene_view()
        print(f"redo scene: {scene}")
        if scene is None:
            return
        print(f"redo size: {scene.getRedoSize()}")
        scene.redo(0)

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
