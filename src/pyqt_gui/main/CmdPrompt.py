import sys, traceback, re

from PyQt5 import QtWidgets
from PyQt5 import QtGui
from PyQt5 import QtCore
from pylib import fileio
from pylib import command
# from pylib import cmdparser

class CmdPrompt(QtWidgets.QLineEdit):
    def __init__(self, parent=None):
        super(CmdPrompt, self).__init__(parent)
        self._parent = parent
        self._cmdset = command.CommandSet.getInstance()

        completer = QtWidgets.QCompleter(["alpha", "aloha", "foo", "bar", "load", "omega", "omicron", "zeta"], self)
        completer.setCaseSensitivity(QtCore.Qt.CaseInsensitive)
        self.setCompleter(completer)

        # self._cmdglobal = {}

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
        p = command.Parser(cmdstr)
        p.parse()
        cmdname = p.getCmdName()
        
        try:
            if self._cmdset.hasCommand(cmdname):
                self._cmdset.invokeCmd(cmdname, p.getArgs())
            else:
                msg = "ERROR; command "+cmdname+" not found"
                print(msg)
                self._parent.appendLog(msg)
            #eval(cmd, self._cmdglobal)
            #eval(cmdstr)
            #if p._cmd=="load":
            #    fileio.load(p._args[0])

        except:
            print("Error: "+cmdstr)
            msg = traceback.format_exc()
            print(msg)
            self._parent.appendLog(msg)
