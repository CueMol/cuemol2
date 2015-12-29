import sys

from PyQt5.QtWidgets import QApplication
import cuemol
from main import MainWindow, event
from qmqtgui import QtMolWidget

confpath = ""

if len(sys.argv)>=2:
    confpath = sys.argv[1]

cuemol.initCueMol(confpath)
evm = event.getEventManager()
def logEvent(aSlotID, aCatStr, aTgtTypeID, aEvtTypeID, aSrcID, aInfoStr):
#     print("  slot ID="+str(aSlotID))
#     print("  cat str="+str(aCatStr))
#     print("  target ID="+str(aTgtTypeID))
#     print("  event ID="+str(aEvtTypeID))
#     print("  src ID="+str(aSrcID))
    print("LogEvent info : "+str(aInfoStr))

evm.addListener("log", -1, -1, -1, logEvent)

logMgr = cuemol.getService("MsgLog")
accumMsg = logMgr.getAccumMsg()
logMgr.removeAccumMsg()

evm = event.getEventManager()

app = QApplication(sys.argv)
main_window = MainWindow()

QtMolWidget.setupEventTimer()

#main_window.show()
sys.exit(app.exec_())
