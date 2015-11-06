import sys

import PyQt5
print PyQt5

from PyQt5.QtWidgets import (QApplication, QWidget,
                             QGridLayout, QVBoxLayout, QHBoxLayout,
                             QLabel, QLineEdit, QPushButton)
from PyQt5.QtOpenGL import QGLFormat

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

        # fmt = QGLFormat::defaultFormat()
        fmt = QGLFormat()
        oglver = QGLFormat.openGLVersionFlags()
        print("xxx "+str(dir(oglver)))
        print("OpenGL version flag="+str(int(oglver)))
        #print("OpenGL version flag="+int(oglver.testFlag(QGLFormat.OpenGLVersionFlag.OpenGL_Version_None)))
        # print("OpenGL version flag="+qenum_key(fmt, oglver))
        
        fmt.setProfile(QGLFormat.CompatibilityProfile)
        oglpro = fmt.profile()
        print("OpenGL version profile="+str(oglpro))
        fmt.setDoubleBuffer(True)

        #self.myw = QtMolWidget(fmt, self)
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

    def makeSel(self, selstr, uid):
        sel = cuemol.createObj("SelCommand");
        if uid :
            if not sel.compile(selstr, uid):
                return null;
            
        else:
            if not sel.compile(selstr, 0):
                return null;

        return sel;


    def calc(self):
        #n = int(self.inputLine.text())

        scMgr = cuemol.getService("SceneManager")
        scene = scMgr.getScene(self._scid);

        strMgr = cuemol.getService("StreamManager")
        reader = strMgr.createHandler("pdb", 0);
        reader.setPath("D:/works_drop/Dropbox/works/test_data/1AB0.pdb");
        
        newobj = reader.createDefaultObj();
        reader.attach(newobj);
        reader.read();
        reader.detach();

        newobj.name = "test";
        scene.addObject(newobj);

        rend = newobj.createRenderer("simple");
        rend.applyStyles("DefaultCPKColoring");
        rend.name = "rend1";
        rend.sel = self.makeSel("*", 0);

        view = scMgr.getView(self._vwid);
        pos = rend.getCenter();
        view.setViewCenter(pos);

        self.myw.update()
#        r = factorial(n)
#        self.outputLine.setText(str(r))


app = QApplication(sys.argv)
main_window = MainWindow()

main_window.show()
sys.exit(app.exec_())

