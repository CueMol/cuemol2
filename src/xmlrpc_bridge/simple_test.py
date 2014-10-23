import cuemol

#import xmlrpclib

cuemol.init(8080, "RPC2", "XXX")

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
        scm = cuemol.getService("SceneManager")
        scid = scm.activeSceneID;
        print "Active scene ID=", scid;
        sc = scm.getScene(scid);
        vwid = sc.activeViewID;
        print "Active view ID=", vwid;

        color = cuemol.createObj("Color");
        color.setCode(0xFFFFFF);
        sc.bgcolor = color;
        
#    test2()

