import sys

from PyQt5 import QtWidgets
from PyQt5 import QtGui
from PyQt5 import QtCore

class CmdPrompt(QtWidgets.QLineEdit):
    def __init__(self, parent=None):
        super(CmdPrompt, self).__init__(parent)

        completer = QtWidgets.QCompleter(["alpha", "aloha", "foo", "bar", "omega", "omicron", "zeta"], self)
        completer.setCaseSensitivity(QtCore.Qt.CaseInsensitive)
        #completer.setCompletionMode(QtWidgets.QCompleter.UnfilteredPopupCompletion)
#        self.setFocusPolicy(QtCore.Qt.StrongFocus)
#
#        self.completer = QtGui.QCompleter(self)
#        self.completer.setCompletionMode(QtGui.QCompleter.UnfilteredPopupCompletion)
#        self.pFilterModel = QtGui.QSortFilterProxyModel(self)
#        self.pFilterModel.setFilterCaseSensitivity(QtCore.Qt.CaseInsensitive)
#        self.completer.setPopup(self.view())
        self.setCompleter(completer)
#        self.textEdited[unicode].connect(self.pFilterModel.setFilterFixedString)

    def setModel(self, model):
        self.pFilterModel.setSourceModel(model)
        self.completer.setModel(self.pFilterModel)

    def setModelColumn( self, column ):
        self.completer.setCompletionColumn(column)
        self.pFilterModel.setFilterKeyColumn(column)

    def view(self):
        return self.completer.popup()

    def index( self ):
        return self.currentIndex()

    
