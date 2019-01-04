// -*-Mode: C++;-*-
//
// SYBYL Mol2 format molecule structure reader class
//

#include <common.h>

#include "MOL2MolReader.hpp"

#include <qlib/LineStream.hpp>

#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/TopparManager.hpp>

using namespace molstr;
using namespace importers;

MOL2MolReader::MOL2MolReader()
{
  m_nReadBonds = 0;
  m_nReadAtoms = 0;
  m_nReadCmpds = 0;

  m_iLoadCmpd = -1;
  m_bLoadAsChain = true;
  m_chainName = "A";
  m_nResInd = 1;
}

MOL2MolReader::~MOL2MolReader()
{
  MB_DPRINTLN("MOL2MolReader destructed (%p)", this);
}

/////////////

const char *MOL2MolReader::getName() const
{
  return "mol2";
}

const char *MOL2MolReader::getTypeDescr() const
{
  return "SYBYL Mol2 Coordinates (*.mol2)";
}

const char *MOL2MolReader::getFileExt() const
{
  return "*.mol2";
}

qsys::ObjectPtr MOL2MolReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW MolCoord());
}

/////////

/// read SDF from stream
bool MOL2MolReader::read(qlib::InStream &ins)
{
  m_pMol = MolCoordPtr(getTarget<MolCoord>());

  m_nReadAtoms = 0;
  m_nReadBonds = 0;
  m_nReadCmpds = 0;

  qlib::LineStream lin(ins);
  LString str;
  
  int cmpd_id;
  for (cmpd_id=0;; cmpd_id++) {

    if (m_bLoadAsChain) {
      m_sCurrChName = MolCoord::encodeModelInChain(m_chainName, cmpd_id);
      m_nCurrResid = m_nResInd;
    }
    else {
      m_sCurrChName = m_chainName;
      m_nCurrResid = cmpd_id + m_nResInd;
    }
    
    bool bskip = false;
    if (m_iLoadCmpd>= 0 && cmpd_id != m_iLoadCmpd)
      bskip = true;

    if (!readMol(lin, bskip)) {
      LOG_DPRINTLN("MOL2MolReader> read %d cmpds/%d atoms/%d bonds",
		   m_nReadCmpds, m_nReadAtoms, m_nReadBonds);
      return true;
    }

    if (!bskip)
      m_nReadCmpds ++;

  }
  
  // NOT REACHED
  return true;
}

namespace {
  template <class OutputIt>
  int split(const LString &str, char sep, OutputIt out_iter) {
    std::list<LString> slist;
    int nres = str.split(sep, slist);
    std::copy(slist.begin(), slist.end(), out_iter);
    return nres;
  }
}

/// read one MOL entry from stream
bool MOL2MolReader::readMol(qlib::LineStream &lin, bool bskip)
{
  LString sline;
  std::vector<LString> slist;
  
  for (;;) {
    sline = lin.readLine().chomp();
    if (sline.isEmpty() && !lin.ready())
      return false; // EOF
  
    if (sline.equals("@<TRIPOS>MOLECULE")) {
      break;
    }
  }

  // mol_name
  LString cmpd_name = lin.readLine().trim(" \t\r\n");
  if (cmpd_name.isEmpty())
    cmpd_name = "_"; // XXX

  // molecule info
  sline = lin.readLine().chomp();
  split(sline, ' ', std::back_inserter(slist));
  if (slist.size()<1) {
    MB_THROW(MOL2FormatException, "Invalid atom info record");
  }
  int natoms;
  if (!slist[0].toInt(&natoms)) {
    MB_THROW(MOL2FormatException, "Invalid atom info record");
  }
  int nbonds=0;
  if (slist.size()>1) {
    if (!slist[1].toInt(&nbonds)) {
      MB_THROW(MOL2FormatException, "Invalid atom info record");
    }
  }

  // mol_type
  LString mol_type = lin.readLine().chomp();
  bool bApplyTopo = false;
  if (mol_type.equals("PROTEIN") ||
      mol_type.equals("NUCLEIC_ACID"))
    bApplyTopo = true;    

  // Ignore charge_type
  // Ignore mol_comment

  // Search ATOM record
  for (;;) {
    sline = lin.readLine().chomp();
    if (sline.isEmpty() && !lin.ready())
      return false; // EOF
  
    if (sline.equals("@<TRIPOS>ATOM")) {
      break;
    }
  }

  int i, idot, iresid, naid, ind, prev_resid;
  ElemID eleid;
  double xx, yy, zz;
  LString aname, atype, satom, res_name;
  std::map<int,int> atommap;
  std::map<LString, int> aname_counts;
  std::map<LString, int>::iterator an_iter;

  // XXXX
  prev_resid = -999999;
  
  for (i=0; i<natoms; ++i) {
    //LOG_DPRINTLN("i=%d, natoms=%d", i, natoms);

    sline = lin.readLine().chomp();
    slist.clear();
    split(sline, ' ', std::back_inserter(slist));
    if (slist.size()<8) {
      MB_THROW(MOL2FormatException, "Invalid atom record");
    }

    if (!slist[0].toInt(&ind)) {
      MB_THROW(MOL2FormatException, "Invalid atom ID record");
    }

    aname = slist[1];
    an_iter = aname_counts.find(aname);
    if (an_iter==aname_counts.end()) {
      aname_counts.insert(std::pair<LString, int>(aname, 1));
    }
    else {
      an_iter->second = an_iter->second + 1;
      aname = LString::format("%d%s", an_iter->second, aname.c_str());
    }

    if (!slist[2].toRealNum(&xx)) {
      MB_THROW(MOL2FormatException, "Invalid atom coord record");
    }
    if (!slist[3].toRealNum(&yy)) {
      MB_THROW(MOL2FormatException, "Invalid atom coord record");
    }
    if (!slist[4].toRealNum(&zz)) {
      MB_THROW(MOL2FormatException, "Invalid atom coord record");
    }

    atype = slist[5];

    satom = "";
    idot = atype.indexOf('.');
    if (idot<0) {
      satom = atype;
    }
    else if (idot>0) {
      satom = atype.substr(0, idot);
    }
    else {
      MB_THROW(MOL2FormatException, "Invalid SYBYL atom type");
    }

    iresid = 0;
    if (!slist[6].toInt(&iresid)) {
      MB_THROW(MOL2FormatException, "Invalid atom resid record");
    }

    res_name = slist[7];
    if (res_name.equals("<0>"))
      res_name = cmpd_name;

    if (bApplyTopo) {
      // protein or nucleic acid
      // strip residue number from res_name
      int ntmp;
      if (res_name.substr(3).toInt(&ntmp)) {
	res_name = res_name.substr(0, 3);
	iresid = ntmp;
      }

      if (iresid!=prev_resid)
	// residue is changed --> clear atom name count
	aname_counts.clear();
    }

    eleid = ElemSym::str2SymID(satom);

    // LOG_DPRINTLN("Atom: %f, %f, %f, <%s> %d", xx, yy, zz, aname.c_str(), eleid);

    if (!bskip) {
      MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
      pAtom->setParentUID(m_pMol->getUID());
      pAtom->setName(aname);
      pAtom->setElement(eleid);

      pAtom->setChainName(m_sCurrChName);
      pAtom->setResIndex(iresid);
      pAtom->setResName(res_name);
    
      pAtom->setPos(Vector4D(xx,yy,zz));
      pAtom->setBfac(0.0);
      pAtom->setOcc(1.0);
    
      naid = m_pMol->appendAtom(pAtom);
      if (naid<0)
	MB_THROW(MOL2FormatException, "appendAtom() failed");

      atommap.insert(std::pair<int,int>(ind, naid));
      m_nReadAtoms++;
    }

    prev_resid = iresid;

  }
  
  // Search BOND record
  for (;;) {
    sline = lin.readLine().chomp();
    if (sline.isEmpty() && !lin.ready())
      return false; // EOF
  
    if (sline.equals("@<TRIPOS>BOND")) {
      break;
    }
  }

  int natm1, natm2;
  int natm_id1, natm_id2;
  std::map<int,int>::const_iterator iter;
  
  for (i=0; i<nbonds; ++i) {

    sline = lin.readLine().chomp();
    slist.clear();
    split(sline, ' ', std::back_inserter(slist));
    if (slist.size()<4) {
      MB_THROW(MOL2FormatException, "Invalid bond record");
    }

    if (!slist[1].toInt(&natm1)) {
      MB_THROW(MOL2FormatException, "Invalid bond line (atom1)");
    }
    if (!slist[2].toInt(&natm2)) {
      MB_THROW(MOL2FormatException, "Invalid bond line (atom2)");
    }
    LString sbont = slist[3];

    if (!bskip) {
      iter = atommap.find(natm1);
      if (iter==atommap.end())
	MB_THROW(MOL2FormatException, "Invalid bond line (bond atom1 not found)");
      natm_id1 = iter->second;

      iter = atommap.find(natm2);
      if (iter==atommap.end())
	MB_THROW(MOL2FormatException, "Invalid bond line (bond atom2 not found)");
      natm_id2 = iter->second;

      MolBond *pB = m_pMol->makeBond(natm_id1, natm_id2, true);
      if (pB==NULL)
	MB_THROW(MOL2FormatException, "makeBond failed");

      if (sbont.equals("1"))
	pB->setType(MolBond::SINGLE);
      else if (sbont.equals("2"))
	pB->setType(MolBond::DOUBLE);
      else if (sbont.equals("3"))
	pB->setType(MolBond::TRIPLE);
      else if (sbont.equals("ar")||sbont.equals("am"))
	pB->setType(MolBond::DELOC);

      m_nReadBonds++;
    }

    //LOG_DPRINTLN("bond %d<-->%d: %d", natm_id1, natm_id2, nbont);
  }
  
  if (bApplyTopo) {
    m_pMol->applyTopology();
    if (mol_type.equals("PROTEIN"))
      m_pMol->calcProt2ndry(-500.0);
    if (mol_type.equals("NUCLEIC_ACID"))
      m_pMol->calcBasePair(3.7, 30);
  }
  else {
    // Set noautogen prop to this residue,
    // to avoid topology autogen, when saved to and loaded from the qdf stream.
    if (!bskip) {
      iter = atommap.begin();
      if (iter!=atommap.end()) {
	int aid0 = iter->second;
	MolAtomPtr pA = m_pMol->getAtom(aid0);
	if (!pA.isnull()) {
	  MolResiduePtr pRes = pA->getParentResidue();
	  if (!pRes.isnull()) {
	    pRes->setPropStr("noautogen", "true");
	  }
	}
      }      
    }
  }
  /*
  */

  return true;
}
