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
        if (classdb.get(key)):
            res = classdb[key]
            print "reuse hasProp result: "+str(res)
        else:
            res = proxy.hasProp(credential, uid, name);
            classdb[key] = res

        if (res==1 or res==2):
            print "getattr hasProp(",res,") OK"
            # rval = proxy.getProp(credential, self.UID, name);
            # if (isinstance(rval, dict)):
            #     return Wrapper(rval["UID"])
            # else:
            #     return rval;
        elif (res==3):
            print "getattr hasMethod() OK"
#            return MethodObj(self, name)
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
