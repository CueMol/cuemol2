#!/usr/bin/python

import cuemol
import sys

confpath = ""

if len(sys.argv)>=2:
    confpath = sys.argv[1]

cuemol.initCueMol(confpath)

evtmgr = cuemol.getService("ScrEventManager")

def listener(aSlotID, aCatStr, aTgtTypeID, aEvtTypeID, aSrcID, aInfoStr):
    print "Event listener called!!"
    print "  slot ID="+str(aSlotID)
    print "  cat str="+aCatStr
    print "  target ID="+str(aTgtTypeID)
    print "  event ID="+str(aEvtTypeID)
    print "  src ID="+str(aSrcID)
    print "  info : "+aInfoStr
#    print "  conf path="+confpath

evtmgr.addListener(listener)
evtmgr.append("log", -1, -1, -1)

logMgr = cuemol.getService("MsgLog")
accumMsg = logMgr.getAccumMsg()
logMgr.removeAccumMsg()

from PyQt5.QtWidgets import QApplication, QWidget

app = QApplication(sys.argv)
w = QWidget()
w.resize(250, 150)
w.move(300, 300)
w.setWindowTitle('Simple')
w.show()

sys.exit(app.exec_())

