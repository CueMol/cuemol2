import cuemol

# Create new scene
scm = cuemol.getService("SceneManager");
scene = scm.createScene();

mol = cuemol.createObj("MolCoord");

# Register to the scene
scene.addObject(mol);

#####

fname = '/net3/ishitani/PLP.pdb';

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
        print("PDB: ", line)
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
