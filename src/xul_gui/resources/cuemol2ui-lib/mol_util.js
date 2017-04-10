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

exports.showArrow = function (aMol, aRendName, aPos, aVec)
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
    rend.appendBy2Vecs(aPos, aPos.add(aVec));
};

exports.cen = function (aMol, aSelStr) {
    const scr = require("scr_util");
    let origsel = aMol.sel;

    aMol.sel = scr.sel(aSelStr);
    let com1 = aMol.getCenterPos(true);

    aMol.sel = origsel;
    return com1;
};

