//
//
//

/*
var cuemol = {};

var json = getAllClassNamesJSON();
var obj, clsname;
eval("obj = "+json);

function xxx(anm) {
    var nm = anm;
    return function() {
	print("call ctor "+nm);
	return newObj(nm);
    }
}

for (var i in obj) {
    clsname = obj[i];
    print("def class="+clsname);
    cuemol[clsname] = xxx(clsname);
}
*/

////////////////////////////////////

var v = cuemol.Vector();
var m = cuemol.Matrix();

v.x = 1;
v.y = 1.2;
v.z = -0.5;

print("Vector: "+v+", length="+v.length());
print("Matrix: "+m);

var scm = getService("SceneManager");
var sc = scm.createScene();

sc.name = "My Scene";
print("UID: "+ sc.getUID()+ ", name: "+ sc.name+ "\n");

var vw = sc.createView();
vw.name = "Primary View";

//var mol = cuemol.MolCoord();
//var mol = util.openPDBFile("/net3/ishitani/data/PSTK/molrep/molrep.pdb", "");
var mol = util.openPDBFile(sc,
	   "/Users/user/Desktop/work_synch/works_sync/test_data/1AB0.pdb",
			   "my molecule");

var rend = util.createRend(mol, "cartoon", "cartoon1", "*");
rend.name = "my renderer";
rend.helix_smooth = 2.0;

vw.redraw();

rend.curvature();

print("********** TEST END **********\n");

