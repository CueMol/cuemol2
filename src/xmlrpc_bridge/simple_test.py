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
        
##############

    def test3():
        scm = cuemol.getService("SceneManager")
        scid = scm.activeSceneID;
        print "Active scene ID=", scid;
        scene = scm.getScene(scid);
        
        #print "scene = "+str(scene)

        mol = cuemol.createObj("MolCoord")
        
        fname = '/Users/user/Dropbox/works/test_data/1CRN.pdb';

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
        
        # apply topology
        mol.applyTopology()
        mol.name="Mol"

        # calc 2nry str
        mgr = cuemol.getService("MolAnlManager")
	mgr.calcProt2ndry2(mol, True, 0.0);

        # Register to the scene
        scene.addObject(mol)
        
        # Create simple renderer
        rend = mol.createRenderer("simple")
        rend.name = "simple1"
        rend.applyStyles("DefaultCPKColoring")

        vwid = scene.activeViewID;
        print "Active view ID=", vwid;
        view = scm.getView(vwid);
        view.setViewCenter( rend.getCenter() )

        return

    test3()

