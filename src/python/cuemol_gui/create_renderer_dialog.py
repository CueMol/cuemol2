from cuemol_gui.mol_select_box import MolSelectBox
from PySide2.QtCore import Qt
from PySide2.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QLineEdit,
    QVBoxLayout,
)

import cuemol
from cuemol import logging

logger = logging.get_logger(__name__)


class CreateRendererDialog(QDialog):
    def __init__(self, scene_id, parent=None):
        super().__init__(parent)
        self.scene_id = scene_id

        self.setWindowTitle(self.tr("Create renderer"))

        self.obj_name_edit = QLineEdit()
        self.rend_type_box = QComboBox()
        self.rend_name_edit = QLineEdit()

        self.mol_sel_box = MolSelectBox(scene_id=scene_id)
        self.sel_chk = QCheckBox(self.tr("&Selection:"))
        self.recen_view_chk = QCheckBox(self.tr("&Recenter view:"))

        form_layout = QFormLayout()
        form_layout.addRow(self.tr("&Object:"), self.obj_name_edit)
        form_layout.addRow(self.tr("&Renderer type:"), self.rend_type_box)
        form_layout.addRow(self.tr("&Renderer name:"), self.rend_name_edit)
        form_layout.addRow(self.sel_chk, self.mol_sel_box)
        form_layout.addRow(self.recen_view_chk)

        self.button_box = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel, Qt.Horizontal
        )

        vbox = QVBoxLayout()
        vbox.addLayout(form_layout)
        vbox.addWidget(self.button_box)
        vbox.setContentsMargins(20, 20, 20, 20)

        self.setLayout(vbox)

        self.update_widgets()

        # Events
        self.button_box.accepted.connect(self.accept)
        self.button_box.rejected.connect(self.reject)

        self.rend_type_box.currentIndexChanged.connect(self.rend_typebox_changed)
        self.sel_chk.stateChanged.connect(self.sel_chk_changed)

    @property
    def object_name(self):
        return self.obj_name_edit.text()

    @object_name.setter
    def object_name(self, name):
        self.obj_name_edit.setText(name)

    @property
    def rend_type_name(self):
        isel = self.rend_type_box.currentIndex()
        if isel < 0:
            return ""
        return self.rend_type_box.itemText(isel)

    @property
    def renderer_name(self):
        return self.rend_name_edit.text()

    @property
    def recenter_view(self):
        return self.recen_view_chk.isChecked()

    @property
    def mol_select_str(self):
        return self.mol_sel_box.text()

    @property
    def mol_select(self):
        return self.mol_sel_box.selection

    def init_rend_type_box(self, rend_types):
        for rend_type in rend_types:
            if rend_type.startswith("*"):
                continue
            self.rend_type_box.addItem(rend_type)

        # TODO: composite renderer

        # reset init state
        self.rend_type_box.setCurrentIndex(0)
        self.rend_typebox_changed(0)

    def rend_typebox_changed(self, isel):
        logger.info(f"rend_typebox_changed {isel}")
        self.set_default_rend_name()

    def sel_chk_changed(self, i):
        logger.info(f"sel_chk_changed {i}")
        self.update_widgets()

    def update_widgets(self):
        if self.sel_chk.isChecked():
            self.mol_sel_box.setEnabled(True)
        else:
            self.mol_sel_box.setEnabled(False)

    def set_default_rend_name(self):
        selvalue = self.rend_type_name
        if selvalue == "":
            return
        logger.info(f"setDefaultRendName> selected item={selvalue}")
        if selvalue.startswith("*"):
            selvalue = selvalue[1:]
        default_name = self.create_default_rend_name(selvalue)
        self.rend_name_edit.setText(default_name)

    def create_default_rend_name(self, rend_type_name):
        logger.info(f"setDefaultRendName> scene ID={self.scene_id}")

        mgr = cuemol.svc("SceneManager")
        sce = mgr.getScene(self.scene_id)
        idx = 0
        while True:
            s = f"{rend_type_name}{idx}"
            if sce.getRendByName(s) is None:
                return s
            idx += 1

    def setup_by_file_format(self, file_fmt):
        mgr = cuemol.svc("StreamManager")
        reader = mgr.createHandler(file_fmt, mgr.OBJECT_READER)
        tmp_obj = reader.createDefaultObj()
        names = tmp_obj.searchCompatibleRendererNames()
        rend_types = names.split(",")
        self.init_rend_type_box(rend_types)

        if hasattr(tmp_obj, "sel"):
            self.sel_chk.setEnabled(True)
        else:
            self.sel_chk.setEnabled(False)
            self.sel_chk.setChecked(False)
            self.mol_sel_box.setEnabled(False)

        self.update_widgets()
