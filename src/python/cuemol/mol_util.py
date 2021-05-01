#
#  Molecule utility functions
#

import cuemol

# def forEachAtom(aMol, aSel, aFn):
#     uid = aMolObj.uid
#     aSelObj = cuemol.sel(aSel, uid)
#
#     iter = cuemol.createObj("AtomIterator")
#
#     iter.target = aMolObj;
#     iter.sel = aSelObj;
#
#     for (iter.first(); iter.hasMore(); iter.next()) {
# 	let atom = iter.get();
# 	if (aFn(atom))
# 	    break;
#     }
# }


class AtomIter:
    def __init__(self, aMol, aSel="*"):
        molObj = cuemol.obj(aMol)
        # uid = molObj.uid
        selObj = cuemol.sel(aSel, molObj.scene_uid)

        self.mIter = cuemol.createObj("AtomIterator")
        self.mIter.target = molObj
        self.mIter.sel = selObj

        self.mIter.first()

    def __iter__(self):
        return self

    def __next__(self):
        if not self.mIter.hasMore():
            raise StopIteration()
        rval = self.mIter.get()
        self.mIter.next()  # NOQA
        return rval


def forEachResid(aMol, aSel, aFn):
    molObj = cuemol.obj(aMol)

    selObj = cuemol.sel(aSel, molObj.scene_uid)

    iter = cuemol.createObj("ResidIterator")

    iter.target = molObj
    iter.sel = selObj

    iter.first()
    while True:
        if not iter.hasMore():
            break
        resid = iter.get()
        if aFn(resid):
            break
        iter.next()  # NOQA


class ResidIter:
    def __init__(self, aMol, aSel="*"):
        molObj = cuemol.obj(aMol)
        selObj = cuemol.sel(aSel, molObj.scene_uid)

        self.mIter = cuemol.createObj("ResidIterator")
        self.mIter.target = molObj
        self.mIter.sel = selObj

        self.mIter.first()

    def __iter__(self):
        return self

    def __next__(self):
        if not self.mIter.hasMore():
            raise StopIteration()
        rval = self.mIter.get()
        self.mIter.next()  # NOQA
        return rval


def sameAtom(aMol, aAtom):
    chname = aAtom.chainName
    resid = aAtom.residIndex
    aname = aAtom.name
    return aMol.getAtom(chname, resid, aname)


def sameResid(aMol, aResid):
    chname = aResid.chainName
    resid = aResid.sindex
    return aMol.getResidue(chname, resid)


def rotate(aMol, aCen, aAxis, aDeg, aSel=None, aNotify=True):
    sel = aSel
    if sel is None:
        sel = cuemol.sel("*")
    else:
        sel = cuemol.sel(aSel)

    mat = cuemol.createObj("Matrix")
    mat.setRotate(aCen, aAxis, aDeg)
    aMol.xformByMat(mat, sel)
    if aNotify:
        aMol.fireAtomsMoved()


def rotateZ(aMol, aCen, aDeg, aSel=None, aNotify=True):
    rotate(aMol, aCen, cuemol.vec(0, 0, 1), aDeg, aSel, aNotify)


def shift(aMol, aShift, aSel=None, aNotify=True):
    sel = aSel
    if sel is None:
        sel = cuemol.sel("*")
    else:
        sel = cuemol.sel(aSel)

    mat = cuemol.createObj("Matrix")
    mat.setTranslate(aShift)
    aMol.xformByMat(mat, sel)
    if aNotify:
        aMol.fireAtomsMoved()


def showArrow(aMol, aRendName, aPos1, aPos2, aMol2=None):
    rend = aMol.getRendererByName(aRendName)

    if rend:
        if not rend.type_name == "atomintr":
            rend = aMol.createRenderer("atomintr")
    else:
        rend = aMol.createRenderer("atomintr")
        rend.name = aRendName

    if not rend:
        return

    rend.mode = "fancy"
    rend.captype_end = "arrow"
    rend.captype_start = "arrow"
    rend.width = 0.2
    rend.stipple0 = 0
    rend.stipple1 = 0

    if cuemol.isimpl(aPos1, "Vector") and cuemol.isimpl(aPos2, "Vector"):
        #        pass
        rend.appendBy2Vecs(aPos1, aPos2)
    elif cuemol.isimpl(aPos1, "MolAtom") and cuemol.isimpl(aPos2, "MolAtom"):
        mol2 = None
        if aMol2 is None:
            mol2 = aMol
        else:
            mol2 = aMol2
        #        pass
        rend.appendById(aPos1.id, mol2.uid, aPos2.id, False)
    else:
        raise RuntimeError("showArrow() unknown aPos1/aPos2 type")


def del_atoms(aMol, aSel):
    mgr = cuemol.getService("MolAnlManager")
    mol = cuemol.obj(aMol)
    sel = cuemol.sel(aSel, mol.getScene())
    mgr.deleteAtoms(mol, sel)


def ssm_fit(aRefMol, aRefSel, aMovMol, aMovSel):
    mgr = cuemol.getService("MolAnlManager")
    refMol = cuemol.obj(aRefMol)
    refSel = cuemol.sel(aRefSel, refMol.getScene())
    movMol = cuemol.obj(aMovMol)
    movSel = cuemol.sel(aMovSel, movMol.getScene())
    xfmat = mgr.superposeSSM1(refMol, refSel, movMol, movSel, False)
    return xfmat


def calc_rmsd(aRefMol, aRefSel, aMovMol, aMovSel):
    mgr = cuemol.getService("MolAnlManager")
    refMol = cuemol.obj(aRefMol)
    refSel = cuemol.sel(aRefSel, refMol.getScene())
    movMol = cuemol.obj(aMovMol)
    movSel = cuemol.sel(aMovSel, movMol.getScene())
    rmsd = mgr.calcRMSD(refMol, refSel, movMol, movSel, "")
    return rmsd


def merge(aToMol, aFromMol, aFromSel, aCopy=False):
    mgr = cuemol.getService("MolAnlManager")
    toMol = cuemol.obj(aToMol)
    fromMol = cuemol.obj(aFromMol)
    fromSel = cuemol.sel(aFromSel, fromMol.getScene())
    mgr.copyAtoms(toMol, fromMol, fromSel)
    if not aCopy:
        mgr.deleteAtoms(fromMol, fromSel)


def chg_chain(aFromMol, aFromSel, aNewChName):
    mgr = cuemol.getService("MolAnlManager")
    fromMol = cuemol.obj(aFromMol)
    fromSel = cuemol.sel(aFromSel, fromMol.getScene())
    mgr.changeChainName(fromMol, fromSel, aNewChName)
