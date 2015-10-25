#!/usr/bin/python

import cuemol
import sys

confpath = ""

if len(sys.argv)>=2:
    confpath = sys.argv[1]

cuemol.initCueMol(confpath)

evtmgr = cuemol.getService("ScrEventManager")

def listener(arg0, arg1, arg2, arg3, arg4, arg5):
    print "event listener called!!"

evtmgr.addListener(listener)
evtmgr.append("log", -1, -1, -1)

logMgr = cuemol.getService("MsgLog")
accumMsg = logMgr.getAccumMsg()
logMgr.removeAccumMsg()

