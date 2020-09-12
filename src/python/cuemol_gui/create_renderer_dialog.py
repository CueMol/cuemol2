import cuemol

from PySide2.QtCore import Qt
from PySide2.QtWidgets import QDialog, QLineEdit, QPushButton, QFormLayout, QDialogButtonBox, QCheckBox, QComboBox, QVBoxLayout


class CreateRendererDialog(QDialog):

    def __init__(self, n_scene_id, parent=None):
        super().__init__(parent)
        self.n_scene_id = n_scene_id
        
        self.setWindowTitle(self.tr("Create renderer"))

        self.obj_name_edit = QLineEdit()
        self.rend_type_box = QComboBox()
        self.rend_name_edit = QLineEdit()
        
        # TODO: impl
        self.mol_sel_box = QLineEdit()
        self.recen_view_cbx = QCheckBox(self.tr("&Recenter view:"))

        form_layout = QFormLayout()
        form_layout.addRow(self.tr("&Object:"), self.obj_name_edit)
        form_layout.addRow(self.tr("&Renderer type:"), self.rend_type_box)
        form_layout.addRow(self.tr("&Renderer name:"), self.rend_name_edit)
        form_layout.addRow(self.tr("&Selection:"), self.mol_sel_box)
        form_layout.addRow(self.recen_view_cbx)

        self.button_box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel, Qt.Horizontal)
        
        vbox = QVBoxLayout()
        vbox.addLayout(form_layout);
        vbox.addWidget(self.button_box);
        vbox.setContentsMargins(20, 20, 20, 20);

        self.setLayout(vbox)

        self.button_box.accepted.connect(self.accept)
        self.button_box.rejected.connect(self.reject)

        self.rend_type_box.currentIndexChanged.connect(self.rend_typebox_changed)

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
        return self.recen_view_cbx.isChecked()

    @property
    def mol_select_str(self):
        return self.mol_sel_box.text()

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
        print(f"rend_typebox_changed {isel}")
        self.set_default_rend_name()

    def set_default_rend_name(self):
        selvalue = self.rend_type_name
        if selvalue == "":
            return
        print(f"setDefaultRendName> selected item={selvalue}")
        if selvalue.startswith("*"):
            selvalue = selvalue[1:]
        default_name = self.create_default_rend_name(selvalue)
        self.rend_name_edit.setText(default_name)

    def create_default_rend_name(self, rend_type_name):
        print(f"setDefaultRendName> scene ID={self.n_scene_id}")
            
        mgr = cuemol.svc("SceneManager")
        sce = mgr.getScene(self.n_scene_id)
        idx = 0
        while True:
            s = f"{rend_type_name}{idx}"
            if sce.getRendByName(s) is None:
                return s
            idx += 1
