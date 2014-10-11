// -*-Mode: C++;-*-

print("========== !! START !!");

var sm = getService("SceneManager");
var sc = sm.createScene();
var mol = sc.loadObject("/net3/ishitani/data/GkTilSCom/deposit/deposit_orig.pdb", "pdb");

var iter = createObject("ResidIterator");
iter.target = mol;

for (iter.first(); iter.hasMore(); iter.next()) {
  var res = iter.get();
  print("resid:"+res);
}

// var mol2 = sc.loadObject("/net3/ishitani/PLP.pdb", "pdb");
/*
var iter = createObject("AtomIterator");

var vzero = createObject("Vector");
iter.target = mol;
for (iter.first(); iter.hasMore(); iter.next()) {
  var atom = iter.get();
  print("atom:"+atom.pos);
  atom.pos = vzero;
  atom = null;
}
*/
  /*
for (iter.first(); iter.hasMore(); iter.next()) {
  var atom = iter.get();
  print("atom 2:"+atom.pos);
  atom = null;

  var iter2 = createObject("AtomIterator");
  iter2.target = mol2;
  for (iter2.first(); iter2.hasMore(); iter2.next()) {
    var atom = iter2.get();
    print("atom 3:"+atom.pos);
  }
}
  */

print("========== !! END OK !!");
