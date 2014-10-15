import xmlrpclib


class CueMol:

    def __init__(self):
        self.proxy = xmlrpclib.ServerProxy("http://localhost:8080/RPC2")

    def createObj(self, name):
        id = self.proxy.createObj(name);
        obj = Wrapper(id);
        return obj;

    def getService(self, name):
        id = self.proxy.getService(name);
        obj = Wrapper(id);
        return obj;

cuemol = CueMol()

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

        rval = cuemol.proxy.callMethod(self.obj.UID, self.name, arg2);

        if (isinstance(rval, dict)):
            return Wrapper(rval["UID"])
        else:
            return rval

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
            rval = cuemol.proxy.getProp(self.UID, name);
            if (isinstance(rval, dict)):
                return Wrapper(rval["UID"])
            else:
                return rval;
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
        
    def test2():
        # Create new scene
        scm = cuemol.getService("SceneManager")
        scene = scm.createScene()
        
        #print "scene = "+str(scene)

        mol = cuemol.createObj("MolCoord")
        
        # Register to the scene
        scene.addObject(mol)
        
        fname = '/net3/ishitani/PLP.pdb';

        for line in open(fname):
            #print "PDB: ", line;
            if line[0:6] in ["ATOM  ", "HETATM"]:
                aname = line[12:16].strip(  )
                altloc = line[16:17]
                resn = line[17:20].strip(  )
                chn = line[21:22]
                resid = int( line[22:26] )
                ins = line[26:27]
                posx = float( line[30:38] )
                posy = float( line[38:46] )
                posz = float( line[46:54] )
                occ = float( line[54:60] )
                bfac = float( line[60:66] )
                elem = line[76:78].strip()
            else:        
                print "PDB: ", line
                continue

            # print "name=", aname
            atom = cuemol.createObj("MolAtom");
            atom.name = aname;
            atom.element = elem;
            atom.bfac = bfac;
            atom.occ = occ;
        
            vpos = cuemol.createObj("Vector");
            vpos.set3(posx, posy, posz);
            atom.pos = vpos;
        
            mol.appendAtom1(atom, chn, resid, resn);
        
        # Create PDB file writer
        stm = cuemol.getService("StreamManager");
        # Handler type : 1 (Object writer)
        writer = stm.createHandler("pdb", 1);
        
        # Set source path name
        writer.setPath("test1.pdb");

        # Write PDB file
        writer.attach(mol);
        writer.write();
        writer.detach();
        return

    test2()

