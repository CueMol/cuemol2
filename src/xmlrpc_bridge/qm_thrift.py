#!/usr/bin/env python

import sys, glob
sys.path.append('gen-py')
sys.path.insert(0, glob.glob('/net3/ishitani/src/thrift-0.9.1/lib/py/build/lib.*')[0])

from cuemol2 import CueMol
from cuemol2.ttypes import *

from thrift import Thrift
from thrift.transport import TSocket
from thrift.transport import TTransport
from thrift.protocol import TBinaryProtocol

def init(portno, cred):
    global proxy, credential, classdb

    # Make socket
    transport = TSocket.TSocket('localhost', portno)
    # Buffering is critical. Raw sockets are very slow
    transport = TTransport.TBufferedTransport(transport)
    # Wrap in a protocol
    protocol = TBinaryProtocol.TBinaryProtocol(transport)
    # Create a client to use the protocol encoder
    proxy = CueMol.Client(protocol)
    # Connect!
    transport.open()

    credential = cred;
    classdb = {}
    

def createObj(name):
    global proxy, credential
    id = proxy.createObj(credential, name);
    obj = Wrapper(id, name);
    return obj;

##########################

class Wrapper:

    def __init__(self, uid, name):
        print "Wrapper.__init__ uid=", uid;
        self.__dict__["__UID__"] = uid
        self.__dict__["__clsnm__"] = name
        
    def __del__(self):
        global proxy, credential
        uid = self.__dict__["__UID__"];
        print "destructing obj: ", uid
        proxy.destroyObj(credential, uid);

    def __getattr__(self, name):
        global proxy, credential, classdb
        #print "getattr (", name, ") called for obj: ", self.UID

        uid = self.__dict__["__UID__"]
        clsnm = self.__dict__["__clsnm__"]

        key = clsnm+"."+name
        print "classdb key=", key
        if classdb.get(key):
            res = classdb[key]
            print "reuse hasProp result: "+str(res)
        else:
            res = proxy.hasProp(credential, uid, name);
            if res==1 or res==2 or res==3:
                classdb[key] = res

        if res==1 or res==2:
            print "getattr hasProp(",res,") OK"
            rval = proxy.getProp(credential, uid, name);
            return self.convTVarToPyval(rval);
        elif res==3:
            print "getattr hasMethod() OK"
            return MethodObj(self, name)
        else:
            # Report ERROR
            print "getattr hasProp() NG"

        # res = proxy.tryGetProp(credential, self.UID, name);
        # rcode = res["rcode"];
        # if (rcode==1 or rcode==2):
        #     rval = res["rval"];
        #     if (isinstance(rval, dict)):
        #         return Wrapper(rval["UID"])
        #     else:
        #         return rval;
        # elif (rcode==3):
        #     # get method called --> return method obj
        #     return MethodObj(self, name)
        # else:
        #     # Report ERROR
        #     print "getattr tryGetProp() NG"

    def __setattr__(self, name, value):
        global proxy, credential

        uid = self.__dict__["__UID__"]
        clsnm = self.__dict__["__clsnm__"]

        tvar = self.convPyvalToTVar(value)

        proxy.setProp(credential, uid, name, tvar)
        return;


    def convTVarToPyval(self, tvar):
        typ = tvar.type
        if typ == Type.LT_NULL:
            return None
        elif typ == Type.LT_BOOLEAN:
            return tvar.boolValue
        elif typ == Type.LT_INTEGER:
            return tvar.intValue
        elif typ == Type.LT_REAL:
            return tvar.realValue
        elif typ == Type.LT_REAL:
            return tvar.realValue
        elif typ == Type.LT_STRING:
            return tvar.strValue
        elif typ == Type.LT_OBJECT:
            uid = tvar.objidValue
            clsnm = tvar.className
            return Wrapper(uid, clsnm)

        # throw exception!!
        return None

    def convPyvalToTVar(self, value):
        if isinstance(value, type(None)):
            tvar = Variant(Type.LT_NULL)
            return tvar
        elif isinstance(value, bool):
            tvar = Variant(Type.LT_BOOL)
            tvar.boolValue = value
            return tvar
        elif isinstance(value, int):
            tvar = Variant(Type.LT_INTEGER)
            tvar.intValue = value
            return tvar
        elif isinstance(value, long):
            tvar = Variant(Type.LT_INTEGER)
            tvar.intValue = value
            return tvar
        elif isinstance(value, float):
            tvar = Variant(Type.LT_REAL)
            tvar.realValue = value
            return tvar
        elif isinstance(value, str):
            tvar = Variant(Type.LT_STRING)
            tvar.strValue = value
            return tvar
        elif isinstance(value, unicode):
            tvar = Variant(Type.LT_STRING)
            tvar.strValue = value
            return tvar
        elif isinstance(value, Wrapper):
            tvar = Variant(Type.LT_OBJECT)
            tvar.objidValue = value.__dict__["__UID__"]
            tvar.className = value.__dict__["__clsnm__"]
            return tvar
        
        raise Exception, "convPyval to TVar: unsupported python object"

#################################

class MethodObj:

    def __init__(self, obj, name):
        self.obj = obj;
        self.name = name;

    def __call__(self, *args):
        global proxy, credential

        uid = self.obj.__dict__["__UID__"]
        nargs = len(args)
        print "MethodObj ["+ str(uid)+ "]."+ self.name+"("+str(nargs)+") called"

        arg2 = []
        for item in args:
            arg2.append(self.obj.convPyvalToTVar(item));

        rval = proxy.callMethod(credential,
                                uid, self.name, arg2);

        return self.obj.convTVarToPyval(rval)

