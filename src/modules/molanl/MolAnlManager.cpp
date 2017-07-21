//
// Biomolecule analysis manager singleton class
//
// $Id: MolAnlManager.cpp,v 1.6 2011/03/05 17:09:02 rishitani Exp $
//

#include <common.h>
#include "MolAnlManager.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Matrix4D.hpp>

#include <qsys/EditInfo.hpp>
#include <qsys/UndoManager.hpp>
#include <qsys/Scene.hpp>
#include <qsys/style/AutoStyleCtxt.hpp>

#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/SelCommand.hpp>

#include <modules/molstr/Prot2ndry.hpp>
#include <modules/molstr/ResidIterator.hpp>

#include "mmdb/mmdb_manager.h"
#include "ssmlib/ssm_align.h"

SINGLETON_BASE_IMPL(molanl::MolAnlManager);

///////////////

using namespace molanl;
using namespace molstr;
using qlib::Vector4D;
using qlib::Matrix4D;

MolAnlManager::MolAnlManager()
{
  MB_DPRINTLN("MolAnlManager(%p) created", this);
}

MolAnlManager::~MolAnlManager()
{
  MB_DPRINTLN("MolAnlManager(%p) destructed", this);
}

///////////////

namespace {

  typedef std::pair<int, char> ResnTuple;
  typedef std::deque<ResnTuple> ResnList;

  char seq3to1(const LString &resn) {
    if (resn.equalsIgnoreCase("ALA"))
      return 'A';
    else if (resn.equalsIgnoreCase("ARG"))
      return 'R';
    else if (resn.equalsIgnoreCase("ARG"))
      return 'R';
    else if (resn.equalsIgnoreCase("ASN"))
      return 'N';
    else if (resn.equalsIgnoreCase("ASP"))
      return 'D';
    else if (resn.equalsIgnoreCase("CYS"))
      return 'C';
    else if (resn.equalsIgnoreCase("GLN"))
      return 'Q';
    else if (resn.equalsIgnoreCase("GLU"))
      return 'E';
    else if (resn.equalsIgnoreCase("GLY"))
      return 'G';
    else if (resn.equalsIgnoreCase("HIS"))
      return 'H';
    else if (resn.equalsIgnoreCase("ILE"))
      return 'I';
    else if (resn.equalsIgnoreCase("LEU"))
      return 'L';
    else if (resn.equalsIgnoreCase("LYS"))
      return 'K';
    else if (resn.equalsIgnoreCase("MET"))
      return 'M';
    else if (resn.equalsIgnoreCase("MSE"))
      return 'M';
    else if (resn.equalsIgnoreCase("PHE"))
      return 'F';
    else if (resn.equalsIgnoreCase("PRO"))
      return 'P';
    else if (resn.equalsIgnoreCase("SER"))
      return 'S';
    else if (resn.equalsIgnoreCase("THR"))
      return 'T';
    else if (resn.equalsIgnoreCase("TRP"))
      return 'W';
    else if (resn.equalsIgnoreCase("TYR"))
      return 'Y';
    else if (resn.equalsIgnoreCase("VAL"))
      return 'V';
    else
      return 'X';
  }

  void copySelected(CMMDBManager *pMol1, MolCoordPtr pmol, SelectionPtr psel, ResnList &rlist)
  {
    int index;
    int serNum;
    LString atomName;
    LString resName;
    LString chainID;
    int seqNum;
    InsCode insCode;
    LString altLoc = "";
    const char *segID = "";
    LString element;
    Vector4D pos;

    index = 1;
    serNum = 0;
    seqNum = 0;

    AtomIterator iter(pmol, psel);
    for (iter.first(); iter.hasMore(); iter.next()) {
      MolAtomPtr pAtom = iter.get();

      chainID = pAtom->getChainName();
      //segID;

      resName = pAtom->getResName();
      ResidIndex rind = pAtom->getResIndex();
      insCode[0] = rind.second;
      insCode[1] = '\0';
      seqNum = rind.first;

      atomName = pAtom->getName();
      if (atomName.equals("CA")) atomName = " CA ";
      if (atomName.equals("N")) atomName = " N  ";
      if (atomName.equals("C")) atomName = " C  ";
      if (atomName.equals("O")) atomName = " O  ";
      //altLoc
      element = pAtom->getElementName();

      pos = pAtom->getPos();

      int rc = pMol1->PutAtom(index, serNum, atomName, resName, chainID, seqNum, insCode, altLoc, segID, element);
      PCAtom pMMDBAtom = pMol1->GetAtomI(index);
      if (pMMDBAtom==NULL) {
        LOG_DPRINTLN("MMDB: copySelected failed!!");
        MB_THROW(qlib::RuntimeException, "Coordinate conversion for MMDB is failed!!");
        return;
      }
      pMMDBAtom->SetCoordinates(pos.x(), pos.y(), pos.z(), pAtom->getOcc(), pAtom->getBfac());
      ++index;

      if (atomName.equals(" CA "))
        rlist.push_back(ResnTuple(seqNum, seq3to1(resName)));
    }

    pMol1->FinishStructEdit();

    if (index==1) {
      // ERROR: no atom is copied!!
      LString msg = LString::format("No atoms are  selected by sel[%s] in mol[%s]",
                                    psel->toString().c_str(), pmol->getName().c_str());
      MB_THROW(qlib::IllegalArgumentException, msg);
    }

  }
}

void MolAnlManager::superposeSSM1(MolCoordPtr pmol_ref, SelectionPtr psel_ref,
                                  MolCoordPtr pmol_mov, SelectionPtr psel_mov, bool bUseProp/*=false*/)
{
  qsys::AutoStyleCtxt asc(pmol_ref->getSceneID());

  // mol1: reference molecule
  CMMDBManager *pMol1 = new CMMDBManager;
  ResnList rlist1;
  copySelected(pMol1, pmol_ref, psel_ref, rlist1);

  // mol2: moving molecule
  CMMDBManager *pMol2 = new CMMDBManager;
  ResnList rlist2;
  copySelected(pMol2, pmol_mov, psel_mov, rlist2);

  int precision = SSMP_Normal;
  int connectivity = CSSC_Flexible;

  CSSMAlign *pAln = new CSSMAlign();
  int rc = pAln->Align(pMol2, pMol1, precision, connectivity);
  if (rc!=0) {
    LString msg = LString::format("SSM-superpose is failed (error code=%d)", rc);
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }

  Matrix4D xfmat;
  int i,j;
  for (i=0;i<4;i++)
    for (j=0;j<4;j++)
      xfmat.aij(i+1,j+1) = pAln->TMatrix[i][j];
  
  LOG_DPRINTLN("===== SSM superpose result =====");
  LOG_DPRINTLN(" Ref: %s, Mov: %s", pmol_ref->getName().c_str(), pmol_mov->getName().c_str());
  LOG_DPRINTLN(" RMSD: %f angstrom", pAln->rmsd);
  LOG_DPRINTLN(" Nalgn: %d", pAln->nalgn);
  LOG_DPRINTLN(" Ngaps: %d", pAln->ngaps);
  //LOG_DPRINTLN(" Nres 1: %d 2: %d", pAln->nres1, pAln->nres2);
  //LOG_DPRINTLN(" Nsel 1: %d 2: %d", pAln->nsel1, pAln->nsel2);

  {
    const double e3 =  xfmat.aij(1,1) + xfmat.aij(2,2) + xfmat.aij(3,3) + 1.0;
    if (e3>0.0) {
      const double phih = ::acos( sqrt(e3) * 0.5 );
      LOG_DPRINTLN(" Rotation: %f degree", qlib::toDegree(phih*2.0));
    }
    else {
      LOG_DPRINTLN(" Mat2Quat failed");
    }
  }

  try {
    const double rmsd = pAln->rmsd;
    LString aln1, match, aln2;
    std::deque<int> ialn1, ialn2;
    int ind1=-1, ind2=-1;
    if (pAln->Ca1 && (pAln->nsel1>0)) {
      const int nsel1 = pAln->nsel1;
      bool bGap = false;
      for (i=0;i<nsel1;i++)  {
        const int ca1 = pAln->Ca1[i];
        const double dca1 = pAln->dist1[i];
        if (ca1>=0) {
          if (bGap || ca1-ind1>1) {
            int ng2 = i - ind2 -1;
            // int ng2c = gap2.length();
            int ng1 = ca1 - ind1 -1;
            int ngmin = qlib::min(ng1, ng2);
            for (int j=0; j<ngmin; j++) {
              aln1 += rlist1.at(ind1+1+j).second;
              aln2 += rlist2.at(ind2+1+j).second;
              ialn1.push_back(rlist1.at(ind1+1+j).first);
              ialn2.push_back(rlist2.at(ind2+1+j).first);
              match += ' ';
            }
            if (ng1>ng2) {
              // aln1 gap is longer
              for (int j=ngmin; j<ng1; j++) {
                aln1 += rlist1.at(ind1+1+j).second;
                aln2 += '-';
                ialn1.push_back(rlist1.at(ind1+1+j).first);
                ialn2.push_back(0);
                match += ' ';
              }
            }
            else {
              // aln2 gap is longer
              for (int j=ngmin; j<ng2; j++) {
                aln1 += '-';
                aln2 += rlist2.at(ind2+1+j).second;
                ialn1.push_back(0);
                ialn2.push_back(rlist2.at(ind2+1+j).first);
                match += ' ';
              }
            }
          }
          aln1 += rlist1.at(ca1).second;
          aln2 += rlist2.at(i).second;
          ialn1.push_back(rlist1.at(ca1).first);
          ialn2.push_back(rlist2.at(i).first);
          if (dca1<rmsd)
            match += '*';
          else
            match += '.';
          ind1 = ca1;
          ind2 = i;
          bGap = false;
        }
        else {
          bGap = true;
          //gap1 += "X";
          //gap2 += rlist2.at(i).second;
        }
        // LOG_DPRINTLN("i=%d, Ca1=%d dist1=%f", i, ca1, pAln->dist1[i] );
      }
    }

    LOG_DPRINTLN(" Alignment:");

    const int row_size = 60;
    const int naln_len = aln1.length();
    const int nrows = naln_len/row_size+1;
    for (int i=0; i<nrows; ++i) {
      const int nst = i*row_size;
      int ist1=0, ist2=0, ien1=0, ien2=0;
      if (nst<ialn1.size())
        ist1 = ialn1[nst];
      if (nst<ialn2.size())
        ist2 = ialn2[nst];
      const int nen = nst+row_size-1;
      if (nen<ialn1.size())
        ien1 = ialn1[nen];
      else
        ien1 = ialn1.back();
      if (nen<ialn2.size())
        ien2 = ialn2.back();
      if (i>0)
        LOG_DPRINTLN("");
      LOG_DPRINTLN(" Ref% 4d %s", ist1, aln1.substr(nst, row_size).c_str());
      LOG_DPRINTLN("         %s", match.substr(nst, row_size).c_str());
      LOG_DPRINTLN(" Mov% 4d %s", ist2, aln2.substr(nst, row_size).c_str());
    }

    /*
    LOG_DPRINTLN("1: %s", aln1.c_str());
    LOG_DPRINTLN("   %s", match.c_str());
    LOG_DPRINTLN("2: %s", aln2.c_str());
     */
  }
  catch (...) {
    LOG_DPRINTLN("   *** FATAL ERROR: Alignment calculation failed. ***");
  }

  LOG_DPRINTLN("========================");
  LOG_DPRINTLN("");

  delete pAln;
  delete pMol1;
  delete pMol2;

  Matrix4D origmat = pmol_mov->getXformMatrix();
  if (!origmat.isIdent()) {
    // apply xform matrix prop and reset to it identity
    pmol_mov->resetProperty("xformMat");
    pmol_mov->xformByMat(origmat);
  }

  if (bUseProp) {
    qlib::LScrMatrix4D *pscr = MB_NEW qlib::LScrMatrix4D(xfmat);
    qlib::LVariant var(pscr);
    pmol_mov->setProperty("xformMat", var);
    //pmol_mov->setXformMatrix(xfmat);
  }
  else {
    pmol_mov->xformByMat(xfmat);
    pmol_mov->fireAtomsMoved();
  }
  
}

void MolAnlManager::superposeSSM2(qlib::uid_t mol_ref, const LString &sel_ref,
                                  qlib::uid_t mol_mov, const LString &sel_mov)
{
  MolCoordPtr pMolRef = MolCoord::getMolByID(mol_ref);
  MolCoordPtr pMolMov = MolCoord::getMolByID(mol_mov);

  SelectionPtr pSelRef = SelectionPtr(new SelCommand(sel_ref));
  SelectionPtr pSelMov = SelectionPtr(new SelCommand(sel_mov));

  superposeSSM1(pMolRef, pSelRef, pMolMov, pSelMov);
}

//////////

LString getAtomJSON(MolAtomPtr pAtom1)
{
  LString rval;
  LString sbuf;
  
  // atom ID
  rval += LString::format("\"aid\":%d", pAtom1->getID());

  // chain name
  LString chname = pAtom1->getChainName();
  rval += ",\"chain\":\""+chname.escapeQuots()+"\"";

  // residue index (number/inscode)
  sbuf = pAtom1->getResIndex().toString();
  rval += ",\"resid\":\""+sbuf.escapeQuots()+"\"";

  // residue name
  LString resn1 = pAtom1->getResName();
  rval += ",\"resn\":\""+resn1.escapeQuots()+"\"";
  
  // atom name
  LString aname1 = pAtom1->getName();
  rval += ",\"aname\":\""+aname1.escapeQuots()+"\"";
  
  // altconf ID
  char alt1 = pAtom1->getConfID();
  
  if (alt1) {
    rval += ",\"altc\":\""+LString(alt1).escapeQuots()+"\"";
  }

  return rval;
}

LString MolAnlManager::getNostdBondsJSON(MolCoordPtr pmol)
{
  LString rval;

  MolCoord::BondIter iter = pmol->beginBond();
  MolCoord::BondIter iend = pmol->endBond();

  rval += "[";

  int ind = 0;
  for (; iter!=iend; ++iter) {
    MolBond *pBond = iter->second;
    if (!pBond->isPersist())
      continue;

    MolAtomPtr pAtom1 = pmol->getAtom(pBond->getAtom1());
    MolAtomPtr pAtom2 = pmol->getAtom(pBond->getAtom2());
    MB_ASSERT(!pAtom1.isnull());
    MB_ASSERT(!pAtom2.isnull());

    LString json1 = getAtomJSON(pAtom1);
    LString json2 = getAtomJSON(pAtom2);

    if (ind>0)
      rval += ",";
      
    rval += "[{"+json1+"},\n{"+json2+"}]\n";

    ++ind;
  }

  rval += "]";
  return rval;
}

class MolBondEditInfo : public qsys::EditInfo
{
private:
  /// Target Mol ID
  qlib::uid_t m_nTgtUID;

  /// undo/redo data
  bool m_bMake;
  int m_aid1, m_aid2;

public:
  MolBondEditInfo() {}
  virtual ~MolBondEditInfo() {}

  /////////////////////////////////////////////////////

  void setup(MolCoordPtr pmol, bool bMake, int aid1, int aid2)
  {
    m_nTgtUID = pmol->getUID();
    m_bMake = bMake;
    m_aid1 = aid1;
    m_aid2 = aid2;
  }
  
  bool bondImpl(bool bMake)
  {
    MolCoord *pmol =
      qlib::ObjectManager::sGetObj<MolCoord>(m_nTgtUID);
    
    if (pmol==NULL)
      return false;
    
    if (bMake) {
      pmol->makeBond(m_aid1, m_aid2, true);
    }
    else {
      pmol->removeBond(m_aid1, m_aid2);
    }
    
    pmol->fireTopologyChanged();
    return true;
  }

  /////////////////////////////////////////////////////

  /// perform undo
  virtual bool undo()
  {
    if (m_bMake) {
      // undo of make --> remove
      return bondImpl(false);
    }
    else {
      // undo of remove --> make
      return bondImpl(true);
    }
  }

  /// perform redo
  virtual bool redo()
  {
    if (m_bMake) {
      // redo of make --> make
      return bondImpl(true);
    }
    else {
      // redo of remove --> remove
      return bondImpl(false);
    }
  }

  virtual bool isUndoable() const
  {
    return true;
  }
  
  virtual bool isRedoable() const
  {
    return true;
  }
  
};

void MolAnlManager::removeBond(MolCoordPtr pmol, int aid1, int aid2)
{
  MolAtomPtr pA1 = pmol->getAtom(aid1);
  if (pA1.isnull()) {
    MB_THROW(qlib::IllegalArgumentException, "removeBond: invalid AID1");
    return;
  }

  MolAtomPtr pA2 = pmol->getAtom(aid2);
  if (pA2.isnull()) {
    MB_THROW(qlib::IllegalArgumentException, "removeBond: invalid AID2");
    return;
  }

  if (!pmol->removeBond(aid1, aid2)) {
    MB_THROW(qlib::RuntimeException, "removeBond: failed");
    return;
  }

  // Record undo info
  qsys::UndoManager *pUM = NULL;
  qsys::ScenePtr cursc = pmol->getScene();
  if (!cursc.isnull()) {
    pUM = cursc->getUndoMgr();
    if (pUM->isOK()) {
      // record property changed undo/redo info
      MolBondEditInfo *pPEI = MB_NEW MolBondEditInfo();
      pPEI->setup(pmol, false, aid1, aid2);
      pUM->addEditInfo(pPEI);
    }
  }

  pmol->setModifiedFlag(true);

  pmol->fireTopologyChanged();
}

void MolAnlManager::makeBond(MolCoordPtr pmol, int aid1, int aid2)
{
  MolAtomPtr pA1 = pmol->getAtom(aid1);
  if (pA1.isnull()) {
    MB_THROW(qlib::IllegalArgumentException, "removeBond: invalid AID1");
    return;
  }

  MolAtomPtr pA2 = pmol->getAtom(aid2);
  if (pA2.isnull()) {
    MB_THROW(qlib::IllegalArgumentException, "removeBond: invalid AID2");
    return;
  }

  if (pmol->makeBond(aid1, aid2, true)==NULL) {
    MB_THROW(qlib::RuntimeException, "removeBond: failed");
    return;
  }

  // Record undo info
  qsys::UndoManager *pUM = NULL;
  qsys::ScenePtr cursc = pmol->getScene();
  if (!cursc.isnull()) {
    pUM = cursc->getUndoMgr();
    if (pUM->isOK()) {
      // record property changed undo/redo info
      MolBondEditInfo *pPEI = MB_NEW MolBondEditInfo();
      pPEI->setup(pmol, true, aid1, aid2);
      pUM->addEditInfo(pPEI);
    }
  }

  pmol->setModifiedFlag(true);

  pmol->fireTopologyChanged();
}

////////////////////////////////////////////////////////////////

namespace {
  void fire2ndryChg(MolCoordPtr pmol)
  {
    qsys::ObjectEvent obe;
    obe.setType(qsys::ObjectEvent::OBE_CHANGED);
    obe.setTarget(pmol->getUID());
    obe.setDescr("secondary");
    pmol->fireObjectEvent(obe);
  }
}

void MolAnlManager::calcProt2ndry2(MolCoordPtr pMol, bool bignb, double dhangl1)
{
  // Record undo info
  Prot2ndryEditInfo *pPEI = NULL;
  qsys::UndoUtil uu(pMol->getScene());
  if (uu.isOK()) {
    // record property changed undo/redo info
    pPEI = MB_NEW Prot2ndryEditInfo();
    pPEI->saveBefore(pMol);
  }

  //pMol->calcProt2ndry(hbmax, bignb);
  pMol->calcProt2ndry2(bignb, dhangl1);

  // Record redo info
  if (pPEI!=NULL && uu.isOK()) {
    // record property changed undo/redo info
    pPEI->saveAfter(pMol);
    uu.add(pPEI);
    }
  
  // notify update of structure
  fire2ndryChg(pMol);
  
  pMol->setModifiedFlag(true);
}
    
void MolAnlManager::setProt2ndry(MolCoordPtr pMol, SelectionPtr pSel, int nSecType)
{
  // Record undo info
  Prot2ndryEditInfo *pPEI = NULL;
  qsys::UndoUtil uu(pMol->getScene());
  if (uu.isOK()) {
    // record property changed undo/redo info
    pPEI = MB_NEW Prot2ndryEditInfo();
    pPEI->saveBefore(pMol);
  }

  // conv pSel to selset
  ResidIterator riter(pMol, pSel);
  ResidSet selset;

  for (riter.first(); riter.hasMore(); riter.next()) {
    MolResiduePtr pRes = riter.get();
    int ind = pRes->getIndex().first;
    selset.append(pRes->getChainName(), ind, ind+1);
  }
  
  // make new secset
  Prot2ndrySet secset;
  secset.create(pMol);

  BOOST_FOREACH (const ResidSet::value_type &elem, selset) {
    const LString &chain = elem.first;
    const ResidSet::mapped_type &rng = elem.second;
    
    MolChainPtr pCh = pMol->getChain(chain);
    if (pCh.isnull())
      continue;

    ResidSet::mapped_type::const_iterator irn = rng.begin();
    ResidSet::mapped_type::const_iterator irnen = rng.end();
    
    for (; irn!=irnen; ++irn) {
      int nst = irn->nstart;
      int nen = irn->nend-1;
      switch (nSecType) {
      default:
        // coil
        MB_DPRINTLN("Coil %s: %d - %d", chain.c_str(), nst, nen);
        secset.m_helix.remove(chain, nst-1, nen+1);
        secset.m_sheet.remove(chain, nst-1, nen+1);
        secset.m_helix310.remove(chain, nst-1, nen+1);
        secset.m_helixpi.remove(chain, nst-1, nen+1);
        break;

      case 1:
        // sheet
        MB_DPRINTLN("Append sheet %s: %d - %d", chain.c_str(), nst, nen);
        secset.m_sheet.append(chain, nst, nen);
        secset.m_helix.remove(chain, nst-1, nen+1);
        secset.m_helix310.remove(chain, nst-1, nen+1);
        secset.m_helixpi.remove(chain, nst-1, nen+1);
        break;

      case 2:
        // alpha helix
        MB_DPRINTLN("Append alpha helix %s: %d - %d", chain.c_str(), nst, nen);
        secset.m_helix.append(chain, nst, nen);
        secset.m_sheet.remove(chain, nst-1, nen+1);
        secset.m_helix310.remove(chain, nst-1, nen+1);
        secset.m_helixpi.remove(chain, nst-1, nen+1);
        break;

      case 3:
        // 3-10 helix
        MB_DPRINTLN("Append 3-10 helix %s: %d - %d", chain.c_str(), nst, nen);
        secset.m_helix310.append(chain, nst, nen);
        secset.m_sheet.remove(chain, nst-1, nen+1);
        secset.m_helix.remove(chain, nst-1, nen+1);
        secset.m_helixpi.remove(chain, nst-1, nen+1);
        break;

      case 4:
        // pi helix
        MB_DPRINTLN("Append pi helix %s: %d - %d", chain.c_str(), nst, nen);
        secset.m_helixpi.append(chain, nst, nen);
        secset.m_sheet.remove(chain, nst-1, nen+1);
        secset.m_helix310.remove(chain, nst-1, nen+1);
        secset.m_helix.remove(chain, nst-1, nen+1);
        break;
      }
    }
  }

  // rewrite secondary info
  secset.applyTo(pMol);

  // Record redo info
  if (pPEI!=NULL && uu.isOK()) {
    // record property changed undo/redo info
    pPEI->saveAfter(pMol);
    uu.add(pPEI);
  }
  
  // notify update of structure
  fire2ndryChg(pMol);
  
  pMol->setModifiedFlag(true);
}

