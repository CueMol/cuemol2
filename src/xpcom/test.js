
const CueMol = new Components.Constructor("@cuemol.org/XPCCueMol", "qICueMol");

var qm = new CueMol;

qm.init();

var smg = qm.getService("SceneManager");
//var smg = qm.getService("SceneManagerXX");

// Property getter test
var vec = qm.createObj("ClassA");
var x = vec.getProp("prop0");
print("boolean prop: "+x);
qm.fini();

// const Variant = new Components.Constructor("@mozilla.org/variant;1", "nsIVariant");
// var v = new Variant;
// print(v);
