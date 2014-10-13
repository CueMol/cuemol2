import xmlrpclib


class CueMol:

    def __init__(self):
        self.proxy = xmlrpclib.ServerProxy("http://localhost:8080/RPC2")

    def createObj(self, name):
        id = self.proxy.createObj(name);
        obj = Wrapper(id);
        return obj;

cuemol = CueMol()

##############

class MethodObj:

    def __init__(self, obj, name):
        self.obj = obj;
        self.name = name;

    def __call__(self, *args):
        print "MethodObj ["+ str(self.obj.UID)+ "]."+ self.name+"() called"
        cuemol.proxy.callMethod(self.obj.UID, self.name);


class Wrapper:

    def __init__(self, uid):
        self.__dict__["UID"] = uid
        
    def __del__(self):
        #print "destructing obj: ", self.UID
        cuemol.proxy.destroyObj(self.UID);

    def __getattr__(self, name):
        #print "getattr (", name, ") called for obj: ", self.UID
        res = cuemol.proxy.hasProp(self.UID, name);
        if (res==1 or res==2):
            #print "getattr hasProp() OK"
            res = cuemol.proxy.getProp(self.UID, name);
            return res;
        elif (res==3):
            #print "getattr hasMethod() OK"
            return MethodObj(self, name)
        else:
            # Report ERROR
            print "getattr hasProp() NG"

    def __setattr__(self, name, value):
        #print "setattr (", name, ") called for obj: ", self.UID
        res = cuemol.proxy.hasProp(self.UID, name);
        if (res!=1):
            # Report ERROR
            print "setattr hasProp() NG"

        #print "setattr hasWrProp() OK"
        cuemol.proxy.setProp(self.UID, name, value);
        return;


##############

if __name__ == "__main__":

    obj = cuemol.createObj("MolCoord");
    print "Result: ", obj.UID;
    print "Name =  ", obj.name;
    print "UID =  ", obj.uid;
    obj.name = "hoge"
    print "Name =  ", obj.name;
#    print "toString() =  ", obj.toString();

#print "3 is even: %s" % str(proxy.sample.add(1000,100))
#print "3 is even: %s" % str(proxy.is_even(3))
#print "100 is even: %s" % str(proxy.is_even(100))
