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

#include <modules/symm/CrystalInfo.hpp>
#include <modules/symm/SymOpDB.hpp>

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
        // new data table begins (end of data line)
        emulateSingleDataLoop();
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
        // new data line begins (end of loop)
        m_nState = MMCIFMOL_DATA;
        resetLoopDef();
        readDataLine();
      }
      else if (m_recbuf.startsWith("loop_")) {
        // new data table begins (end of loop)
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

  m_pMol->applyTopology(m_bAutoTopoGen);
  m_pMol->calcBasePair(3.7, 30);
  if (m_bLoadSecstr) {
    applySecstr("helix", "H", m_rngHelix);
    applySecstr("helix", "G", m_rng310Helix);
    applySecstr("helix", "I", m_rngPiHelix);
    applySecstr("sheet", "E", m_rngSheet);
  }
  else
    m_pMol->calcProt2ndry(-500.0);

  applyLink();

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

  // data line contains 2 elements (name and value)
  m_recStPos.resize( 2 );
  m_recEnPos.resize( 2 );

  tokenizeLine();

  LString name = getToken(0);
  LString value = getRawToken(1);

  int dotpos = name.indexOf('.');
  LString catname = name.substr(0, dotpos);
  LString item = name.substr(dotpos+1);

  m_loopDefs.push_back( item.trim() );
  m_values.push_back( value );

  if (m_strCatName.equals(catname)) {
    // the same category name as the previous line
  }
  else if (m_strCatName.isEmpty()) {
    // new category name in the file
    m_strCatName = catname;
  }
  else {
    // new category line begins
    emulateSingleDataLoop();
    m_strCatName = catname;
  }

}

void MmcifMolReader::emulateSingleDataLoop()
{
  m_recbuf = LString::join(" ", m_values);
  m_values.clear();
  readLoopDataItem();
  resetLoopDef();
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
  int nState = TOK_FIND_START;
  const int nsize = m_recbuf.length();
  int i, j;

  for (i=0, j=0; i<nsize; ++i) {
    char c = m_recbuf.getAt(i);
    if (nState==TOK_FIND_START) {
      if (c!=' ') {
        if (c=='\'') {
          m_recStPos[j] = i;
          nState = TOK_FIND_QUOTEND;
        }
        else if (c=='\"') {
          m_recStPos[j] = i;
          nState = TOK_FIND_DQUOTEND;
        }
        else {
          m_recStPos[j] = i;
          nState = TOK_FIND_END;
        }
      }
    }
    else if (nState==TOK_FIND_END) {
      if (c==' ') {
        m_recEnPos[j] = i;
        nState = TOK_FIND_START;
        ++j;
      }
    }
    else if (nState==TOK_FIND_QUOTEND) {
      if (c=='\'') {
        m_recEnPos[j] = i+1;
        nState = TOK_FIND_START;
        ++j;
      }
    }
    else if (nState==TOK_FIND_DQUOTEND) {
      if (c=='\"') {
        m_recEnPos[j] = i+1;
        nState = TOK_FIND_START;
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
  else if (m_strCatName.equals("_struct_conn"))
    readConnLine();
  else if (m_strCatName.equals("_cell"))
    readCellLine();
  else if (m_strCatName.equals("_symmetry"))
    readSymmLine();

}

////////////////////////////////////

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

    m_nModelID = findDataItem("pdbx_PDB_model_num");

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
  
  int nModel;
  if (!getToken(m_nModelID).toInt(&nModel))
    nModel = 1;
  if (nModel>1) {
    if (!m_bLoadMultiModel)
      return;
    chain1 = MolCoord::encodeModelInChain(chain1, nModel);
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

  AtomIDMap::const_iterator iter = m_atommap.find(nID);
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

void MmcifMolReader::readConnLine()
{
  if (!m_bLoopDefsOK) {
    m_recStPos.resize( m_loopDefs.size() );
    m_recEnPos.resize( m_loopDefs.size() );

    m_nConnTypeID = findDataItem("conn_type_id");
    
    m_nSeqID1 = findDataItem("ptnr1_label_seq_id");
    m_nAtomID1 = findDataItem("ptnr1_label_atom_id");
    m_nAltID1 = findDataItem("pdbx_ptnr1_label_alt_id");
    m_nSymmID1 = findDataItem("ptnr1_symmetry");

    m_nSeqID2 = findDataItem("ptnr2_label_seq_id");
    m_nAtomID2 = findDataItem("ptnr2_label_atom_id");
    m_nAltID2 = findDataItem("pdbx_ptnr2_label_alt_id");
    m_nSymmID2 = findDataItem("ptnr2_symmetry");

    m_bLoopDefsOK = true;
  }

  tokenizeLine();

  LString conn_typeid = getToken(m_nConnTypeID);
  if (conn_typeid.equals("covale")||conn_typeid.equals("disulf")) {
    Linkage lnk;
    if (!getToken(m_nSeqID1).toInt(&lnk.resi1)) {
      MB_THROW (MmcifFormatException, "invalid mmCIF format");
      return;
    }
    if (!getToken(m_nSeqID2).toInt(&lnk.resi2)) {
      MB_THROW (MmcifFormatException, "invalid mmCIF format");
      return;
    }
    
    
    lnk.aname1 = getToken(m_nAtomID1);
    lnk.aname2 = getToken(m_nAtomID2);

    LString alt1 = getToken(m_nAltID1);
    LString alt2 = getToken(m_nAltID2);
    if (alt1.equals("?") || alt1.equals(".")){
      alt1 = "";
    }
    else {
      alt1 = alt1.substr(0,1);
    }
    if (alt2.equals("?") || alt2.equals(".")){
      alt2 = "";
    }
    else {
      alt2 = alt2.substr(0,1);
    }
    lnk.alt1 = alt1;
    lnk.alt2 = alt2;
    //LString symm1 = getToken(m_nSymmID1);
    //LString symm2 = getToken(m_nSymmID2);

    m_linkdat.push_back(lnk);
  }
}

void MmcifMolReader::applyLink()
{
  BOOST_FOREACH (const Linkage &elem, m_linkdat) {
    MolResiduePtr pRes1 = findResid(elem.resi1);
    MolResiduePtr pRes2 = findResid(elem.resi2);

    if (pRes1.isnull()||pRes2.isnull()) {
      MB_THROW (MmcifFormatException, "invalid mmCIF format");
      return;
    }

    MolAtomPtr pAtom1, pAtom2;
    if (elem.alt1.isEmpty())
      pAtom1 = pRes1->getAtom(elem.aname1);
    else
      pAtom1 = pRes1->getAtom(elem.aname1, elem.alt1.getAt(0));

    if (elem.alt2.isEmpty())
      pAtom2 = pRes2->getAtom(elem.aname2);
    else
      pAtom2 = pRes2->getAtom(elem.aname2, elem.alt2.getAt(0));

    if (pAtom1.isnull()||pAtom2.isnull()) {
      MB_THROW (MmcifFormatException, "invalid mmCIF format");
      return;
    }

    m_pMol->makeBond(pAtom1->getID(), pAtom2->getID(), true);
  }  
}

MolResiduePtr MmcifMolReader::findResid(int nSeqID) const
{
  ResidTab::const_iterator iter = m_residTab.find(nSeqID);
  if (iter==m_residTab.end()) {
    return MolResiduePtr();
  }
  return iter->second;
}

void MmcifMolReader::readCellLine()
{
  m_recStPos.resize( m_loopDefs.size() );
  m_recEnPos.resize( m_loopDefs.size() );

  int nLenAID = findDataItem("length_a");
  int nLenBID = findDataItem("length_b");
  int nLenCID = findDataItem("length_c");
    
  int nAngAID = findDataItem("angle_alpha");
  int nAngBID = findDataItem("angle_beta");
  int nAngGID = findDataItem("angle_gamma");

  m_bLoopDefsOK = true;

  tokenizeLine();


  double len_a, len_b, len_c;
  double ang_a, ang_b, ang_g;

  if (!getToken(nLenAID).toDouble(&len_a)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  if (!getToken(nLenBID).toDouble(&len_b)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  if (!getToken(nLenCID).toDouble(&len_c)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }

  if (!getToken(nAngAID).toDouble(&ang_a)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  if (!getToken(nAngBID).toDouble(&ang_b)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }
  if (!getToken(nAngGID).toDouble(&ang_g)) {
    MB_THROW (MmcifFormatException, "invalid mmCIF format");
    return;
  }

  symm::CrystalInfoPtr pci = m_pMol->getCreateExtData("CrystalInfo");

  pci->setCellDimension(len_a, len_b, len_c,
                        ang_a, ang_b, ang_g);
}

void MmcifMolReader::readSymmLine()
{
  m_recStPos.resize( m_loopDefs.size() );
  m_recEnPos.resize( m_loopDefs.size() );
  
  int nSgNameID = findDataItem("space_group_name_H-M");
  
  m_bLoopDefsOK = true;

  tokenizeLine();

  LString sgname = getToken(nSgNameID);

  symm::CrystalInfoPtr pci = m_pMol->getCreateExtData("CrystalInfo");

  pci->setSGByName(sgname);
}

