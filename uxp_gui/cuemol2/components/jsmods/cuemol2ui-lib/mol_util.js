//
// molecule object utility routines
//

const {Cc,Ci,Cr} = require("chrome");
const debug_util = require("debug_util");
const dd = debug_util.dd;
const cuemol = require("cuemol");
const scr = require("scr_util");

exports.forEachAtom = function (aMol, aSelObj, aFn)
{
    let iter = cuemol.createObj("AtomIterator");
    //let sel = cuemol.createObj("SelCommand");
    //sel.compile(aSelStr, 0);

    iter.target = aMol;
    iter.sel = aSelObj;

    for (iter.first(); iter.hasMore(); iter.next()) {
	let atom = iter.get();
	if (aFn(atom))
	    break;
    }
} 

exports.forEachResid = function (aMol, aSelObj, aFn)
{
    let iter = cuemol.createObj("ResidIterator");
    //let sel = cuemol.createObj("SelCommand");
    //sel.compile(aSelStr, 0);

    iter.target = aMol;
    iter.sel = aSelObj;

    for (iter.first(); iter.hasMore(); iter.next()) {
	let resid = iter.get();
	if (aFn(resid))
	    break;
    }
};

exports.helixVecCO = function (aMol, aSelStr)
{
    let sum = scr.vec();
    let nsum = 0;

    exports.forEachResid(aMol, scr.sel(aSelStr), function (aResid) {
	let atom_C = aResid.getAtom("C");
	let atom_O = aResid.getAtom("O");

	let vec = atom_C.pos.sub( atom_O.pos ).normalize();

	sum = sum.add(vec);
	nsum++;
    });

    let aver = sum.divide(nsum);
    return aver.normalize();
};

exports.helixVecPC = function (aMol, aSelStr)
{
    const scr = require("scr_util");
    const molu = require("mol_util");

    let sum = scr.vec();
    let nsum = 0;

    molu.forEachResid(aMol, scr.sel(aSelStr), function (aResid) {
	let atom_CA = aResid.getAtom("CA");

	let vec = atom_CA.pos;

	sum = sum.add(vec);
	nsum++;
    });

    let aver = sum.divide(nsum);

    let covmat = cuemol.createObj("Matrix");

    molu.forEachResid(aMol, scr.sel(aSelStr), function (aResid) {
	let atom_CA = aResid.getAtom("CA");

	let vec = atom_CA.pos;

	let dx = (vec.x - aver.x); 
	let dy = (vec.y - aver.y); 
	let dz = (vec.z - aver.z); 

	covmat.addAt(1, 1, dx*dx);
	covmat.addAt(1, 2, dx*dy);
	covmat.addAt(1, 3, dx*dz);

	covmat.addAt(2, 1, dy*dx);
	covmat.addAt(2, 2, dy*dy);
	covmat.addAt(2, 3, dy*dz);

	covmat.addAt(3, 1, dz*dx);
	covmat.addAt(3, 2, dz*dy);
	covmat.addAt(3, 3, dz*dz);
	});

    let rmat = covmat.diag3();

    let rvec = rmat.col(3);
    rvec.w = 0;

    return rvec;
};


exports.showArrow = function (aMol, aRendName, aPos1, aPos2, aMol2)
{
    var rend = aMol.getRendererByName(aRendName);

    if (rend) {
	if (rend.type_name!="atomintr")
	    rend = aMol.createRenderer("atomintr");
    }
    else {
	rend = aMol.createRenderer("atomintr");
	rend.name = aRendName;
    }

    if (!rend)
	return;
    
    rend.mode = "fancy";
    rend.endtype = "arrow";
    rend.width = 0.2;
    rend.stipple0 = 0;
    rend.stipple1 = 0;

  if (cuemol.implIface2(aPos1, 'Vector') &&
      cuemol.implIface2(aPos2, 'Vector')) {
    rend.appendBy2Vecs(aPos1, aPos2);
  }
  else if (cuemol.implIface2(aPos1, 'MolAtom') &&
	   cuemol.implIface2(aPos2, 'MolAtom')) {
    let mol2;
    if (typeof(aMol2)==='undefined')
      mol2 = aMol;
    else
      mol2 = aMol2;
    rend.appendById(aPos1.id, mol2.uid, aPos2.id, false);
  }
  else {
    throw "showArrow() unknown aPos1/aPos2 type";
  }
};

exports.cen = function (aMol, aSelStr) {
    const scr = require("scr_util");
    let origsel = aMol.sel;

    aMol.sel = scr.sel(aSelStr);
    let com1 = aMol.getCenterPos(true);

    aMol.sel = origsel;
    return com1;
};

exports.sameAtom = function (aMol, aAtom) {
  let chname = aAtom.chainName;
  let resid = aAtom.residIndex;
  let aname = aAtom.name;
  return aMol.getAtom(chname, resid, aname);
}

exports.atomSelStr = function (aAtom) {
  let chname = aAtom.chainName;
  let resid = aAtom.residIndex;
  let aname = aAtom.name;
  return chname+"."+String(resid)+"."+aname;
}



