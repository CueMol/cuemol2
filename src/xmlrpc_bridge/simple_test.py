import xmlrpclib


class CueMol:

    def __init__(self, portno, path, cred):
        url = "http://localhost:"+str(portno)+"/"+path;
        self.proxy = xmlrpclib.ServerProxy(url)
        self.credential = cred;

    def createObj(self, name):
        id = self.proxy.createObj(self.credential, name);
        obj = Wrapper(id);
        return obj;

    def getService(self, name):
        id = self.proxy.getService(self.credential, name);
        obj = Wrapper(id);
        return obj;

cuemol = CueMol(8080, "RPC2", "XXX")

##############

class MethodObj:

    def __init__(self, obj, name):
        self.obj = obj;
        self.name = name;

    def __call__(self, *args):
        nargs = len(args)
        print "MethodObj ["+ str(self.obj.UID)+ "]."+ self.name+"("+str(nargs)+") called"

        arg2 = []
        for item in args:
            if (isinstance(item, Wrapper)):
                arg2.append({"UID":item.UID});
            else:
                arg2.append(item);

        rval = cuemol.proxy.callMethod(cuemol.credential,
                                       self.obj.UID, self.name, arg2);

        if (isinstance(rval, dict)):
            return Wrapper(rval["UID"])
        else:
            return rval

class Wrapper:

    def __init__(self, uid):
        self.__dict__["UID"] = uid
        
    def __del__(self):
        #print "destructing obj: ", self.UID
        cuemol.proxy.destroyObj(cuemol.credential, self.UID);

    def __getattr__(self, name):
        #print "getattr (", name, ") called for obj: ", self.UID
        res = cuemol.proxy.tryGetProp(cuemol.credential, self.UID, name);
        rcode = res["rcode"];
        if (rcode==1 or rcode==2):
            rval = res["rval"];
            if (isinstance(rval, dict)):
                return Wrapper(rval["UID"])
            else:
                return rval;
        elif (rcode==3):
            # get method called --> return method obj
            return MethodObj(self, name)
        else:
            # Report ERROR
            print "getattr tryGetProp() NG"

#        res = cuemol.proxy.hasProp(cuemol.credential, self.UID, name);
#        if (res==1 or res==2):
#            #print "getattr hasProp() OK"
#            rval = cuemol.proxy.getProp(cuemol.credential, self.UID, name);
#            if (isinstance(rval, dict)):
#                return Wrapper(rval["UID"])
#            else:
#                return rval;
#        elif (res==3):
#            #print "getattr hasMethod() OK"
#            return MethodObj(self, name)
#        else:
#            # Report ERROR
#            print "getattr hasProp() NG"

    def __setattr__(self, name, value):
        #print "setattr (", name, ") called for obj: ", self.UID
        #res = cuemol.proxy.hasProp(self.UID, name);
        #if (res!=1):
        #    # Report ERROR
        #    print "setattr hasProp() NG"
        #print "setattr hasWrProp() OK"

        cuemol.proxy.setProp(cuemol.credential, self.UID, name, value);
        return;


##############

if __name__ == "__main__":

    def test1():
        obj = cuemol.createObj("Vector");
        obj2 = cuemol.createObj("Vector");
        print "Result: ", obj.UID;
        print "v.x =  ", obj.x;
        obj.x = 123.456
        print "v.x =  ", obj.x;
        obj.set4(1,2,3,4);
        print "toString() =  ", obj.toString();
        
        return

    test1()
        
##############

