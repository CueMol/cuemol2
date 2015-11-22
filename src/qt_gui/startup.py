import sys

import PyQt5
print PyQt5

from PyQt5.QtWidgets import (QApplication, QWidget, QMainWindow,
                             QGridLayout, QVBoxLayout, QHBoxLayout,
                             QLabel, QLineEdit, QPushButton)
from PyQt5.QtOpenGL import QGLFormat
from PyQt5.QtWidgets import QAction
from PyQt5.QtWidgets import QFileDialog
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import QSettings

import cuemol
print cuemol

confpath = ""

if len(sys.argv)>=2:
    confpath = sys.argv[1]

cuemol.initCueMol(confpath)

from qmqtgui import QtMolWidget
print QtMolWidget


class MainWindow(QMainWindow):
    def __init__(self, parent=None):
        super(MainWindow, self).__init__(parent)

        self.initUI()

        self.setupScene()

        # fmt = QGLFormat::defaultFormat()
        # fmt = QGLFormat()
        # oglver = QGLFormat.openGLVersionFlags()
        # print("xxx "+str(dir(oglver)))
        # print("OpenGL version flag="+str(int(oglver)))
        #print("OpenGL version flag="+int(oglver.testFlag(QGLFormat.OpenGLVersionFlag.OpenGL_Version_None)))
        # print("OpenGL version flag="+qenum_key(fmt, oglver))
        
        # fmt.setProfile(QGLFormat.CompatibilityProfile)
        # oglpro = fmt.profile()
        # print("OpenGL version profile="+str(oglpro))
        # fmt.setDoubleBuffer(True)

        #self.myw = QtMolWidget(fmt, self)
        cw = QWidget()

        self.myw = QtMolWidget(None)
        self.myw.bind(self._scid, self._vwid)
        # buttonLayout.addWidget(self.myw)
        self.setCentralWidget(self.myw)


    def onOpenFile(self):
        qset = QSettings("BKR-LAB", "CueMol")
        
        qfdlg = QFileDialog(self)
        qset.beginGroup( "fileopendlg" );
        qfdlg.restoreState(qset.value( "savestate", qfdlg.saveState() ));
        qset.endGroup()

        qfdlg.setNameFilter(self.tr("CueMol Scene (*.qsc)"));

        res = qfdlg.exec_()

        qset.beginGroup( "fileopendlg" );
        qset.setValue( "savestate", qfdlg.saveState() );
        qset.endGroup()

        if not res:
            return
        fname = qfdlg.selectedFiles()
        
        #fname = QFileDialog.getOpenFileName(self, 'Open file')
        print("get OFN: "+str(fname[0]))

        #self.loadPDBFile(fname[0])
        self.loadQSCFile(fname[0])

    def onExitApp(self):
        self.saveSettings()
        QApplication.instance().quit()

    def saveSettings(self):
        qset = QSettings("BKR-LAB", "CueMol")
        qset.beginGroup( "mainwindow" )

        qset.setValue( "geometry", self.saveGeometry() )
        qset.setValue( "savestate", self.saveState() )
        qset.setValue( "maximized", self.isMaximized() )
        if not self.isMaximized():
            qset.setValue( "pos", self.pos() )
            qset.setValue( "size", self.size() )


        qset.endGroup()

    def loadSettings(self):
        qset = QSettings("BKR-LAB", "CueMol")

        qset.beginGroup( "mainwindow" )

        self.restoreGeometry(qset.value( "geometry", self.saveGeometry() ));
        self.restoreState(qset.value( "savestate", self.saveState() ));
        self.move(qset.value( "pos", self.pos() ));
        self.resize(qset.value( "size", self.size() ));
        if qset.value( "maximized", self.isMaximized() ):
            self.showMaximized();

        qset.endGroup();

    def initUI(self):

        #fopenAction = QAction(QIcon('exit.png'), '&Exit', self)
        fopenAction = QAction('&Open file', self)
        fopenAction.setShortcut('Ctrl+O')
        fopenAction.setStatusTip('Open file')
        fopenAction.triggered.connect(self.onOpenFile)

        exitAction = QAction(QIcon('exit.png'), '&Exit', self)
        exitAction.setShortcut('Ctrl+Q')
        exitAction.setStatusTip('Exit application')
        exitAction.triggered.connect(self.onExitApp)

        self.statusBar()
        
        menubar = self.menuBar()
        fileMenu = menubar.addMenu('&File')
        fileMenu.addAction(fopenAction)
        fileMenu.addAction(exitAction)
        
        self.setGeometry(300, 300, 300, 200)
        self.loadSettings()
        self.setWindowTitle('CueMol')
        self.show()
        

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


    def loadQSCFile(self, fname):
        scMgr = cuemol.getService("SceneManager")
        scene = scMgr.getScene(self._scid);

        scene.clearAllData()
        
        strMgr = cuemol.getService("StreamManager")
	reader = strMgr.createHandler("qsc_xml", 3);
        reader.setPath(fname);
        
        reader.attach(scene);
        reader.read();
        reader.detach();

        scene.loadViewFromCam(self._vwid, "__current");

        self.myw.update()

    def loadPDBFile(self, fname):
        #n = int(self.inputLine.text())

        scMgr = cuemol.getService("SceneManager")
        scene = scMgr.getScene(self._scid);

        strMgr = cuemol.getService("StreamManager")
        reader = strMgr.createHandler("pdb", 0);
        reader.setPath(fname);
        
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

#main_window.show()
sys.exit(app.exec_())

