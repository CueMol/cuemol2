import cuemol

from PySide2.QtCore import Qt
from PySide2.QtWidgets import QDialog, QLineEdit, QPushButton, QFormLayout, QDialogButtonBox, QCheckBox, QComboBox, QVBoxLayout


class MolSelectBox(QComboBox):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setEditable(True)
