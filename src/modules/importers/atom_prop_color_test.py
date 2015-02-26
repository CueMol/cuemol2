import cuemol

fname = '/Users/user/Dropbox/works/test_data/1CRN.pdb'

#import xmlrpclib
# cuemol.init(8080, "RPC2", "XXX")

if __name__ == "__main__":

    def readPDB(fname):

        # Create Mol & Register to the scene
        mol = cuemol.createObj("MolCoord");

        for line in open(fname):
            #    print "PDB: ", line;
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

        return mol

    def makeSel(mol, selstr):
        selobj = cuemol.createObj("SelCommand");
        uid = mol.scene_uid
        if (not selobj.compile(selstr, uid)):
            return null
        return selobj

    def createRend(mol, typenm, sel):
        rend = mol.createRenderer(typenm)
        rend.sel = makeSel(mol, sel)
        return rend
        
    def atomPropCol(mol):
        iter = cuemol.createObj("AtomIterator")
        iter.target = mol
        
        iter.first()
        i = 0;
        col = cuemol.createObj("Color")
        while iter.hasMore():
            atom = iter.get()
            col.setHSB(i/360.0, 1.0, 1.0)
            ccode = col.getCode()
            atom.setAtomPropInt("col", ccode)
            iter.next()
            i = i+131

    ##############################

    scm = cuemol.getService("SceneManager")
#    scid = scm.activeSceneID;
#    scene = scm.getScene(scid);
    scene = scm.getScene(scene_id);

    # view = scm.getView(scene.activeViewID);
    view = scm.getView(view_id);

    mol = readPDB(fname)
    mol.name = "PLP"
    scene.addObject(mol)
    mol.applyTopology()

    rend = createRend(mol, "simple", "*");
    # rend.applyStyles("DefaultCPK,DefaultCPKColoring");
    rend.name = "simple1"
    rend.coloring = cuemol.createObj("AtomPropColoring");

    atomPropCol(mol)

    pos = rend.getCenter();
    view.setViewCenter(pos);
    
