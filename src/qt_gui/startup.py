import sys

import PyQt5
print PyQt5

from PyQt5.QtWidgets import (QApplication, QWidget,
                             QGridLayout, QVBoxLayout, QHBoxLayout,
                             QLabel, QLineEdit, QPushButton)
import cuemol
print cuemol

confpath = ""

if len(sys.argv)>=2:
    confpath = sys.argv[1]

cuemol.initCueMol(confpath)

from qmqtgui import QtMolWidget
print QtMolWidget


class MainWindow(QWidget):
    def __init__(self, parent=None):
        super(MainWindow, self).__init__(parent)

        self.setupScene()

        self.inputLine = QLineEdit()
        self.outputLine = QLineEdit()
        self.outputLine.setReadOnly(True)

        self.calcButton = QPushButton("&Calc")
        self.calcButton.clicked.connect(self.calc)

        self.myw = QtMolWidget(self)
        self.myw.bind(self._scid, self._vwid)
        #buttonLayout.addWidget(self.myw)

        lineLayout = QGridLayout()
        lineLayout.addWidget(QLabel("num"), 0, 0)
        lineLayout.addWidget(self.inputLine, 0, 1)
        lineLayout.addWidget(QLabel("result"), 1, 0)
        #lineLayout.addWidget(self.outputLine, 1, 1)
        lineLayout.addWidget(self.myw, 1, 1)

        buttonLayout = QVBoxLayout()
        buttonLayout.addWidget(self.calcButton)

        mainLayout = QVBoxLayout()
        mainLayout.addLayout(lineLayout)
        mainLayout.addLayout(buttonLayout)
        #mainLayout.addWidget(QLabel("xxx"))

        self.setLayout(mainLayout)
        self.setWindowTitle("Factorial")

    def setupScene(self):
        scMgr = cuemol.getService("SceneManager")

        sc = scMgr.createScene();
        sc.setName("Untitled")
        self._scid = sc.uid;

        vw = sc.createView()
        vw.name = "1"
        self._vwid = vw.uid;

        print "setupScene new scene ID="+str(self._scid)
        print "setupScene new view ID="+str(self._vwid)

    def calc(self):
        #n = int(self.inputLine.text())
        self.myw.update()
#        r = factorial(n)
#        self.outputLine.setText(str(r))


app = QApplication(sys.argv)
main_window = MainWindow()

main_window.show()
sys.exit(app.exec_())
