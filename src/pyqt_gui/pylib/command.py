import sys, traceback, re

AT_BOOLEAN = 1
AT_INTEGER = 2
AT_REAL    = 3
AT_STRING  = 4
AT_OBJECT  = 5
AT_ENUM  = 7
AT_ARRAY = 8
AT_LIST = 9
AT_DICT = 10

AT_PATH  = 11
AT_SCENENAME  = 12
AT_OBJNAME  = 13
AT_RENDNAME  = 14

AT_COLSTR  = 15
AT_SELSTR  = 16

class _CmdEntry(object):
    def __init__(self):
        self._name = ""
        self._fnobj = None
        self._arg_types = []
        self._helpstr = ""

class CommandSet(object):

    """ Command database class (singleton)
    """

    def __init__(self):
        self._cmdict = {}
        
    def defineCmd(self, name, fnobj, atypes, helpstr):
        self._cmdict[name] = _CmdEntry()
        self._cmdict[name]._name = name
        self._cmdict[name]._arg_types = atypes
        self._cmdict[name]._helpstr = helpstr

        #def tmpfn(arglist):
        #    return fnobj(*arglist)

        self._cmdict[name]._fnobj = fnobj

    def invokeCmd(self, name, arglist):
        if name not in self._cmdict:
            print("unknown cmd: "+name)
            return

        fnobj = self._cmdict[name]._fnobj
        return fnobj(*arglist)
    
    def hasCommand(self, name):
        if name in self._cmdict:
            return True
        else:
            return False

    _gCmdSetObj = None

    @staticmethod
    def getInstance():
        return CommandSet._gCmdSetObj

def register(name, fnobj, atypes, helpstr):
    if CommandSet._gCmdSetObj is None:
        CommandSet._gCmdSetObj = CommandSet()
    CommandSet._gCmdSetObj.defineCmd(name, fnobj, atypes, helpstr)


class Parser(object):

    """ Command line parser class
    """

    def __init__(self, instr):
        self._tgtstr = instr.strip()

    def parse(self):
        # find main command
        p = re.compile(r"[a-zA-Z_]+")
        m = p.match(self._tgtstr)
        #print("cmd="+str(m))
        if m is None:
            return False
        self._cmd = m.group()
        self._tgtstr = self._tgtstr[m.end():]

        print("cmd="+self._cmd)

        
        # find arguments
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
        

    def getCmdName(self):
        return self._cmd

    def getArgs(self):
        return self._args

