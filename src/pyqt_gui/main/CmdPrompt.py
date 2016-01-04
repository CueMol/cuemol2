import sys, traceback

from PyQt5 import QtWidgets
from PyQt5 import QtGui
from PyQt5 import QtCore
from main import cmd

class CmdPrompt(QtWidgets.QLineEdit):
    def __init__(self, parent=None):
        super(CmdPrompt, self).__init__(parent)

        completer = QtWidgets.QCompleter(["alpha", "aloha", "foo", "bar", "load", "omega", "omicron", "zeta"], self)
        completer.setCaseSensitivity(QtCore.Qt.CaseInsensitive)
        self.setCompleter(completer)

        self._cmdglobal = {}

    def keyPressEvent(self, event):
        # print("key pressed")
        if event.key() == QtCore.Qt.Key_Return:
            cmd = self.text()
            self.setText("")
            self.execCmd(cmd)
        else:
            super().keyPressEvent(event)


    def execCmd(self, cmdstr):
        #print("Exec cmd:"+cmd)
        try:
            #eval(cmd, self._cmdglobal)
            eval(cmdstr)
        except:
            print("Error: "+cmdstr)
            msg = traceback.format_exc()
            print(msg)
