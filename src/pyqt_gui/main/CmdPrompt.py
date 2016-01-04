import sys, traceback, re

from PyQt5 import QtWidgets
from PyQt5 import QtGui
from PyQt5 import QtCore
from main import cmd

class Parser:
    def __init__(self, instr):
        self._tgtstr = instr.strip()

    def parse(self):
        # find main command
        p = re.compile(r"[a-zA-Z]+")
        m = p.match(self._tgtstr)
        #print("cmd="+str(m))
        if m is None:
            return False
        self._cmd = m.group()
        self._tgtstr = self._tgtstr[m.end():]

        print("cmd="+self._cmd)
        print("rem="+self._tgtstr)
        self._args = []

        p = re.compile(r",")
        while len(self._tgtstr)>0:
            self._tgtstr = self._tgtstr.strip()
            m = p.search(self._tgtstr)
            if m is None:
                break;
            arg = self._tgtstr[:m.start()]
            print("arg="+arg)
            self._tgtstr = self._tgtstr[m.end():]
            self._args.append(arg)

        if len(self._tgtstr)>0:
            self._args.append(self._tgtstr)

        print("args: "+str(self._args))
        

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
        p = Parser(cmdstr)
        p.parse()
        
        try:
            #eval(cmd, self._cmdglobal)
            #eval(cmdstr)
            if p._cmd=="load":
                cmd.load(p._args[0])
        except:
            print("Error: "+cmdstr)
            msg = traceback.format_exc()
            print(msg)
