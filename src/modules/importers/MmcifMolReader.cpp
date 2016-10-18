// -*-Mode: C++;-*-
//
// PDB coordinate reader
//

#include <common.h>

#include "MmcifMolReader.hpp"

#include <qlib/LineStream.hpp>

#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/TopparManager.hpp>

using namespace molstr;
using namespace importers;

MmcifMolReader::MmcifMolReader()
{
  m_bLoadAltConf = true;
  m_bLoadAnisoU = true;
  m_bLoadSecstr = true;
  m_nReadAtoms = 0;
}

MmcifMolReader::~MmcifMolReader()
{
  MB_DPRINTLN("MmcifMolReader destructed (%p)", this);
}

/////////////

const char *MmcifMolReader::getName() const
{
  return "mmcif";
}

const char *MmcifMolReader::getTypeDescr() const
{
  return "mmCIF Coordinates (*.cif;*.cif.gz)";
}

const char *MmcifMolReader::getFileExt() const
{
  return "*.cif; *.cif.gz";
}

qsys::ObjectPtr MmcifMolReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW MolCoord());
}

/////////

// read PDB file from stream
bool MmcifMolReader::read(qlib::InStream &ins)
{
  m_nReadAtoms = 0;
  m_pMol = MolCoordPtr(getTarget<MolCoord>());

  qlib::LineStream lin(ins);

  m_nState = MMCIFMOL_INIT;

  for ( ;; ) {
    if (!readRecord(lin))
      break;

    // Skip empty lines
    if (m_recbuf.isEmpty())
      continue;

    if (m_recbuf.startsWith("#"))
      continue;

    switch (m_nState) {
    case MMCIFMOL_INIT:
      if (m_recbuf.startsWith("data_")) {
        m_nState = MMCIFMOL_DATA;
      }
      break;

    case MMCIFMOL_DATA:
      if (m_recbuf.startsWith("_")) {
        readDataLine();
      }
      else if (m_recbuf.startsWith("loop_")) {
        m_nState = MMCIFMOL_LOOPDEF;
        resetLoopDef();
      }
      break;

    case MMCIFMOL_LOOPDEF:
      if (m_recbuf.startsWith("_")) {
        appendDataItem();
      }
      else {
        m_nState = MMCIFMOL_LOOPDATA;
        readLoopDataItem();
      }
      break;

    case MMCIFMOL_LOOPDATA:
      if (m_recbuf.startsWith("_")) {
        m_nState = MMCIFMOL_DATA;
        readDataLine();
      }
      else if (m_recbuf.startsWith("loop_")) {
        m_nState = MMCIFMOL_LOOPDEF;
        resetLoopDef();
      }
      else {
        readLoopDataItem();
      }
      break;
    }

  }
  
  if (m_nReadAtoms<=0) {
    MB_THROW (MmcifFormatException, "invalid mmCIF coordinates format");
    return false;
  }

  LOG_DPRINTLN("mmCIF> read %d atoms", m_nReadAtoms);

  m_pMol->applyTopology();
  m_pMol->calcBasePair(3.7, 30);
  if (m_bLoadSecstr) {
    applySecstr("helix", "H", m_rngHelix);
    applySecstr("helix", "G", m_rng310Helix);
    applySecstr("helix", "I", m_rngPiHelix);
    applySecstr("sheet", "E", m_rngSheet);
  }
  else
    m_pMol->calcProt2ndry(-500.0);

  return true;
}

bool MmcifMolReader::readRecord(qlib::LineStream &ins)
{
  LString str = ins.readLine();
  if (str.isEmpty())
    return false;

  m_recbuf = str.chomp();

  // m_recbuf = m_recbuf.toUpperCase();
  m_lineno = ins.getLineNo();
  return true;
}

void MmcifMolReader::readDataLine()
{
  MB_DPRINTLN("mmCIF> data line : %s", m_recbuf.c_str());
}

void MmcifMolReader::resetLoopDef()
{
  m_strCatName = "";
  m_loopDefs.clear();
  m_recStPos.clear();
  m_recEnPos.clear();
  m_bLoopDefsOK = false;
}

void MmcifMolReader::appendDataItem()
{
  MB_DPRINTLN("mmCIF> loop def : %s", m_recbuf.c_str());

  int dotpos = m_recbuf.indexOf('.');
  LString catname = m_recbuf.substr(0, dotpos);
  if (m_strCatName.isEmpty()) {
    m_strCatName = catname;
  }
  else if (!m_strCatName.equals(catname)) {
    // ERROR!!
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  
  LString item = m_recbuf.substr(dotpos+1);
  // remove white spaces
  m_loopDefs.push_back( item.trim() );
}

void MmcifMolReader::tokenizeLine()
{
  bool bStart = true;
  const int nsize = m_recbuf.length();
  int i, j;

  for (i=0, j=0; i<nsize; ++i) {
    char c = m_recbuf.getAt(i);
    if (bStart) {
      if (c!=' ') {
        m_recStPos[j] = i;
        bStart = false;
      }
    }
    else {
      if (c==' ') {
        m_recEnPos[j] = i;
        bStart = true;
        ++j;
      }
    }
  }
}

void MmcifMolReader::readLoopDataItem()
{
  // MB_DPRINTLN("mmCIF> loop line : %s", m_recbuf.c_str());

  if (m_strCatName.equals("_atom_site"))
    readAtomLine();
  else if (m_bLoadAnisoU && m_strCatName.equals("_atom_site_anisotrop"))
    readAnisoULine();
  else if (m_bLoadSecstr && m_strCatName.equals("_struct_conf"))
    readHelixLine();
  else if (m_bLoadSecstr && m_strCatName.equals("_struct_sheet_range"))
    readSheetLine();
  
}

void MmcifMolReader::readAtomLine()
{
  if (!m_bLoopDefsOK) {
    m_recStPos.resize( m_loopDefs.size() );
    m_recEnPos.resize( m_loopDefs.size() );
    m_nID = findDataItem("id");
    m_nTypeSymbol = findDataItem("type_symbol");
    m_nLabelAtomID = findDataItem("label_atom_id");
    m_nLabelAltID = findDataItem("label_alt_id");
    m_nLabelCompID = findDataItem("label_comp_id");
    m_nLabelSeqID = findDataItem("label_seq_id");
    m_nLabelAsymID = findDataItem("label_asym_id");
    m_nInsCode = findDataItem("pdbx_PDB_ins_code");
    m_nCartX = findDataItem("Cartn_x");
    m_nCartY = findDataItem("Cartn_y");
    m_nCartZ = findDataItem("Cartn_z");
    m_nOcc = findDataItem("occupancy");
    m_nBfac = findDataItem("B_iso_or_equiv");

    m_nAuthAtomID = findDataItem("auth_atom_id");
    m_nAuthCompID = findDataItem("auth_comp_id");
    m_nAuthSeqID = findDataItem("auth_seq_id");
    m_nAuthAsymID = findDataItem("auth_asym_id");

    m_bLoopDefsOK = true;
  }    

  tokenizeLine();

  int nID;

  if (!getToken(m_nID).toInt(&nID)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }

  int nSeqID;
  if (!getToken(m_nLabelSeqID).toInt(&nSeqID)) {
    //MB_THROW (MmcifFormatException, "invalid mmCIF format");
    //return;
    nSeqID = -1;
  }

  ElemID eleid = ElemSym::str2SymID(getToken(m_nTypeSymbol));

  LString atomname1, atomname2;
  if (m_nAuthAtomID>=0) {
    atomname1 = getToken(m_nAuthAtomID);
    if (atomname1.getAt(0)=='"')
      atomname1 = atomname1.substr(1, atomname1.length()-2);
  }
  if (m_nLabelAtomID>=0)
    atomname2 = getToken(m_nLabelAtomID);

  LString resname1;
  if (m_nAuthCompID>=0) {
    resname1 = getToken(m_nAuthCompID);
  }
  
  LString sconfid = getToken(m_nLabelAltID);

  
  LString chain1;
  if (m_nAuthAsymID>=0)
    chain1 = getToken(m_nAuthAsymID);

  LString resseq1;
  if (m_nAuthSeqID>=0)
    resseq1 = getToken(m_nAuthSeqID);
  
  LString inscode;
  if (m_nInsCode>=0)
    inscode = getToken(m_nInsCode);
  if (inscode.equals("?") ||inscode.equals("."))
    inscode = "";
  
  char iCode = ' ';
  if (inscode.length()>0)
    iCode = inscode.getAt(0);
  int itmp;
  if (!resseq1.toInt(&itmp)) {
    // invalid res index --> default index (0)
    itmp = 0;
  }
  ResidIndex residx(itmp);
  if (iCode!=' ')
    residx.second = iCode;

  Vector4D pos;
  double dbuf;

  if (!getToken(m_nCartX).toDouble(&dbuf)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  pos.x() = dbuf;

  if (!getToken(m_nCartY).toDouble(&dbuf)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  pos.y() = dbuf;

  if (!getToken(m_nCartZ).toDouble(&dbuf)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  pos.z() = dbuf;

  double occ;
  if (!getToken(m_nOcc).toDouble(&occ)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }

  double bfac;
  if (!getToken(m_nBfac).toDouble(&bfac)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  
  
  MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
  pAtom->setParentUID(m_pMol->getUID());
  pAtom->setName(atomname1);
  pAtom->setElement(eleid);
  pAtom->setChainName(chain1);
  pAtom->setResIndex(residx);
  pAtom->setResName(resname1);

  pAtom->setPos(pos);
  pAtom->setBfac(bfac);
  pAtom->setOcc(occ);

  if (!sconfid.equals("?") && !sconfid.equals(".")){
    if (m_bLoadAltConf) {
      pAtom->setConfID(sconfid.getAt(0));
    }
    else {
      // ignore atoms with conf id other than "A"
      if (!sconfid.equals("A")) {
        return;
      }
    }
  }

  int naid = m_pMol->appendAtom(pAtom);
  if (naid<0) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }

  m_atommap.insert(std::pair<int,int>(nID, naid));

  if (nSeqID>=0) {
    MolResiduePtr pRes = pAtom->getParentResidue();
    m_residTab.insert(ResidTab::value_type(nSeqID, pRes));
  }
  
  m_nReadAtoms++;
}

void MmcifMolReader::readAnisoULine()
{
  if (!m_bLoopDefsOK) {
    m_recStPos.resize( m_loopDefs.size() );
    m_recEnPos.resize( m_loopDefs.size() );

    m_nID = findDataItem("id");
    m_nU11 = findDataItem("U[1][1]");
    m_nU22 = findDataItem("U[2][2]");
    m_nU33 = findDataItem("U[3][3]");
    m_nU12 = findDataItem("U[1][2]");
    m_nU13 = findDataItem("U[1][3]");
    m_nU23 = findDataItem("U[2][3]");

    m_bLoopDefsOK = true;
  }    

  tokenizeLine();

  int nID;

  if (!getToken(m_nID).toInt(&nID)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }

  double u11, u12, u13, u22, u23, u33;
  if (!getToken(m_nU11).toDouble(&u11)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  if (!getToken(m_nU22).toDouble(&u22)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  if (!getToken(m_nU33).toDouble(&u33)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  if (!getToken(m_nU12).toDouble(&u12)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  if (!getToken(m_nU13).toDouble(&u13)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  if (!getToken(m_nU23).toDouble(&u23)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }

  std::map<int,int>::const_iterator iter = m_atommap.find(nID);
  if (iter==m_atommap.end()) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  MolAtomPtr pAtom = m_pMol->getAtom(iter->second);
  
  pAtom->setU(0, 0, u11);
  pAtom->setU(0, 1, u12);
  pAtom->setU(0, 2, u13);
  pAtom->setU(1, 1, u22);
  pAtom->setU(1, 2, u23);
  pAtom->setU(2, 2, u33);
}

void MmcifMolReader::readHelixLine()
{
  if (!m_bLoopDefsOK) {
    m_recStPos.resize( m_loopDefs.size() );
    m_recEnPos.resize( m_loopDefs.size() );

    m_nStSeqID = findDataItem("beg_label_seq_id");
    m_nEnSeqID = findDataItem("end_label_seq_id");
    m_nHlxClass = findDataItem("pdbx_PDB_helix_class");
    m_bLoopDefsOK = true;
  }

  tokenizeLine();

  int nStSeqID;
  if (!getToken(m_nStSeqID).toInt(&nStSeqID)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  int nEnSeqID;
  if (!getToken(m_nEnSeqID).toInt(&nEnSeqID)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }

  int ntype;
  if (!getToken(m_nHlxClass).toInt(&ntype)) {
    ntype = 1;
  }
  
  if (ntype==5)
    m_rng310Helix.push_back(SecStrList::value_type(nStSeqID, nEnSeqID));
  else if (ntype==3)
    m_rngPiHelix.push_back(SecStrList::value_type(nStSeqID, nEnSeqID));
  else
    m_rngHelix.push_back(SecStrList::value_type(nStSeqID, nEnSeqID));

}

void MmcifMolReader::readSheetLine()
{
  if (!m_bLoopDefsOK) {
    m_recStPos.resize( m_loopDefs.size() );
    m_recEnPos.resize( m_loopDefs.size() );

    m_nStSeqID = findDataItem("beg_label_seq_id");
    m_nEnSeqID = findDataItem("end_label_seq_id");
    
    m_bLoopDefsOK = true;
  }

  tokenizeLine();

  int nStSeqID;
  if (!getToken(m_nStSeqID).toInt(&nStSeqID)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  int nEnSeqID;
  if (!getToken(m_nEnSeqID).toInt(&nEnSeqID)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }

  m_rngSheet.push_back(SecStrList::value_type(nStSeqID, nEnSeqID));
}

void MmcifMolReader::applySecstr(const LString &sec1, const LString &sec2, const SecStrList &rng)
{
  SecStrList::const_iterator iter = rng.begin();
  SecStrList::const_iterator eiter = rng.end();

  for (; iter!=eiter; ++iter) {
    int nst = iter->first;
    int nen = iter->second;

    ResidTab::const_iterator iter = m_residTab.find(nst);
    if (iter==m_residTab.end()) {
      MB_THROW (MmcifFormatException, "invalid mmCIF format");
      return;
    }

    /*
    ResidTab::const_iterator en_iter = m_residTab.find(nen);
    if (en_iter==m_residTab.end()) {
      MB_THROW (MmcifFormatException, "invalid mmCIF format");
      return;
    }*/

    for (;; ++iter) {
      int ind = iter->first;
      MolResiduePtr pRes = iter->second;
      LString val = sec2;
      if (ind==nst)
        val += "s";
      else if (ind==nen)
        val += "e";

      pRes->setPropStr("secondary", sec1);
      pRes->setPropStr("secondary2", val);

      if (ind==nen)
        break;
    }

  }
}

