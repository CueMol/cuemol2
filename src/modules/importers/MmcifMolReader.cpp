// -*-Mode: C++;-*-
//
// mmCIF coordinate reader
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

/// Max atom counts thr. for prot 2ndry str auto calc.
#define MAX_ATOMS_PROTSEC 1000000

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

  CifParser parser(this);
  parser.read(lin);

  if (m_nReadAtoms<=0) {
    MB_THROW (MmcifFormatException, "invalid mmCIF coordinates format");
    return false;
  }

  m_pMol->applyTopology(m_bAutoTopoGen);
  m_pMol->calcBasePair(3.7, 30);

  if (m_nReadAtoms>MAX_ATOMS_PROTSEC && !m_bLoadSecstr) {
    LOG_DPRINTLN("mmCIF> Too many atoms are loaded: secstr reassgnment is disabled (--> loaded from the file)!!");
    m_bLoadSecstr = true;
  }

  if (m_bLoadSecstr) {
    apply2ndry("H", "helix", m_helix);
    apply2ndry("G", "helix", m_helix310);
    apply2ndry("I", "helix", m_helixpi);
    apply2ndry("E", "sheet", m_sheet);
  }
  else
    m_pMol->calcProt2ndry(-500.0);

  applyLink();

  LOG_DPRINTLN("mmCIF> read %d atoms", m_nReadAtoms);

  return true;

#if 0
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

  m_pMol->applyTopology(m_bAutoTopoGen);
  m_pMol->calcBasePair(3.7, 30);

  if (m_nReadAtoms>MAX_ATOMS_PROTSEC && !m_bLoadSecstr) {
    LOG_DPRINTLN("mmCIF> Too many atoms are loaded: secstr reassgnment is disabled (--> loaded from the file)!!");
    m_bLoadSecstr = true;
  }

  if (m_bLoadSecstr) {
    apply2ndry("H", "helix", m_helix);
    apply2ndry("G", "helix", m_helix310);
    apply2ndry("I", "helix", m_helixpi);
    apply2ndry("E", "sheet", m_sheet);
  }
  else
    m_pMol->calcProt2ndry(-500.0);

  applyLink();

  LOG_DPRINTLN("mmCIF> read %d atoms", m_nReadAtoms);

  return true;
#endif
}

void MmcifMolReader::error(const LString &msg) const
{
  LString msg2 = msg + LString::format(", at line %d (%s)",
                                       m_lineno, m_recbuf.c_str());
  MB_THROW (MmcifFormatException, msg2);
}

void MmcifMolReader::warning(const LString &msg) const
{
  LString msg2 = msg + LString::format(", at line %d (%s)",
                                       m_lineno, m_recbuf.c_str());
  LOG_DPRINTLN("mmCIF> Warning: %s", msg2.c_str());
}

#if 0
bool MmcifMolReader::readRecord(qlib::LineStream &ins)
{
  LString str = ins.readLine();
  if (str.isEmpty())
    return false;

  m_recbuf = str.chomp();

  if (!m_prevline.isEmpty()) {
    if (m_recbuf.startsWith("loop_"))
      warning("Unexpected loop_ directive, data lost: \""+m_prevline+"\"");
    else
      m_recbuf = m_prevline + " " + m_recbuf;
    m_prevline = "";
  }

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

  tokenizeLine(false);

  LString name = getToken(0);
  LString value = "\'\'";
  if (isTokAvail(1))
    value = getRawToken(1);

  int dotpos = name.indexOf('.');
  LString catname = name.substr(0, dotpos);
  LString item = name.substr(dotpos+1);

  if (m_strCatName.equals(catname)) {
    // the same category name as the previous line
    m_loopDefs.push_back( item.trim() );
    m_values.push_back( value );
  }
  else if (m_strCatName.isEmpty()) {
    // new category name in the file
    m_loopDefs.push_back( item.trim() );
    m_values.push_back( value );
    m_strCatName = catname;
  }
  else {
    // new category line begins
    emulateSingleDataLoop();
    m_loopDefs.push_back( item.trim() );
    m_values.push_back( value );
    m_strCatName = catname;
  }

}

void MmcifMolReader::emulateSingleDataLoop()
{
  m_recbuf = LString::join(" ", m_values);
  m_recbuf = m_recbuf.trim();
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
    LString msg = LString::format("invalid mmCIF format, catname mismatch (%s!=%s) in loopdef", m_strCatName.c_str(), catname.c_str());
    error(msg);
    return;
  }
  
  LString item = m_recbuf.substr(dotpos+1);
  // remove white spaces
  m_loopDefs.push_back( item.trim() );
}

bool MmcifMolReader::tokenizeLine(bool bChk)
{
  int nState = TOK_FIND_START;
  const int nsize = m_recbuf.length();
  const int nmaxtok = m_recStPos.size();
  int i, j;

  for (i=0, j=0; i<nsize && j<nmaxtok; ++i) {
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

  if (nState==TOK_FIND_END) {
    m_recEnPos[j] = i;
    ++j;
  }

  if (!bChk)
    return true;

  int ndefs = m_loopDefs.size();
  if (j<ndefs) {
    // try concat with next line...
    //LOG_DPRINTLN("Cat: %s, num of token(%d) is smaller than defs(%d): <%s>",
    //m_strCatName.c_str(), j, ndefs, m_recbuf.c_str());
    m_prevline = m_recbuf;
    return false;
  }

  return true;
}
#endif

void MmcifMolReader::readDataItem(CifParser &parser)
{
    if (parser.getCatName().equals("_atom_site"))
        readAtomLine(parser);
    else if (m_bLoadAnisoU && parser.getCatName().equals("_atom_site_anisotrop"))
        readAnisoULine(parser);
    else if (parser.getCatName().equals("_struct_conf"))
        readHelixLine(parser);
    else if (parser.getCatName().equals("_struct_sheet_range"))
        readSheetLine(parser);
    else if (parser.getCatName().equals("_struct_conn"))
        readConnLine(parser);
    else if (parser.getCatName().equals("_cell"))
        readCellLine(parser);
    else if (parser.getCatName().equals("_symmetry"))
        readSymmLine(parser);
}

/*
void MmcifMolReader::readLoopDataItem()
{
  // MB_DPRINTLN("mmCIF> loop line : %s", m_recbuf.c_str());

  if (m_strCatName.equals("_atom_site"))
    readAtomLine();
  else if (m_bLoadAnisoU && m_strCatName.equals("_atom_site_anisotrop"))
    readAnisoULine();
  //else if (m_bLoadSecstr && m_strCatName.equals("_struct_conf"))
  else if (m_strCatName.equals("_struct_conf"))
    readHelixLine();
  //else if (m_bLoadSecstr && m_strCatName.equals("_struct_sheet_range"))
  else if (m_strCatName.equals("_struct_sheet_range"))
    readSheetLine();
  else if (m_strCatName.equals("_struct_conn"))
    readConnLine();
  else if (m_strCatName.equals("_cell"))
    readCellLine();
  else if (m_strCatName.equals("_symmetry"))
    readSymmLine();

}
*/
////////////////////////////////////

ResidIndex MmcifMolReader::getResidIndex(CifParser &parser, int nSeqID, int nInsID)
{
  LString inscode;
  if (nInsID>=0)
    inscode = parser.getToken(nInsID);
  if (inscode.equals("?") ||inscode.equals("."))
    inscode = "";
  
  char iCode = ' ';
  if (inscode.length()>0)
    iCode = inscode.getAt(0);

  LString resseq1;
  if (nSeqID>=0)
	  resseq1 = parser.getToken(nSeqID);

  int itmp;
  if (!resseq1.toInt(&itmp)) {
    // invalid res index --> default index (0)
    itmp = 0;
  }
  ResidIndex residx(itmp);
  if (iCode!=' ')
    residx.second = iCode;

  return residx;
}

char MmcifMolReader::getConfID(CifParser &parser, int nConfID)
{
  if (nConfID<0)
    return '\0';
  LString alt1 = parser.getToken(nConfID);
  if (alt1.equals("?") || alt1.equals("."))
    return '\0';
  if (alt1.isEmpty())
    return '\0';

  return alt1.getAt(0);
}

void MmcifMolReader::readAtomLine(CifParser &parser)
{
  if (!parser.isLoopDefsOK()) {
    parser.setupLoopDefs();
    // m_recStPos.resize( m_loopDefs.size() );
    // m_recEnPos.resize( m_loopDefs.size() );
    m_nID = parser.findDataItem("id");
    m_nTypeSymbol = parser.findDataItem("type_symbol");
    m_nLabelAtomID = parser.findDataItem("label_atom_id");
    m_nLabelAltID = parser.findDataItem("label_alt_id");
    m_nLabelCompID = parser.findDataItem("label_comp_id");
    m_nLabelSeqID = parser.findDataItem("label_seq_id");
    m_nLabelAsymID = parser.findDataItem("label_asym_id");
    m_nInsCode = parser.findDataItem("pdbx_PDB_ins_code");
    m_nCartX = parser.findDataItem("Cartn_x");
    m_nCartY = parser.findDataItem("Cartn_y");
    m_nCartZ = parser.findDataItem("Cartn_z");
    m_nOcc = parser.findDataItem("occupancy");
    m_nBfac = parser.findDataItem("B_iso_or_equiv");

    m_nAuthAtomID = parser.findDataItem("auth_atom_id");
    if (m_nAuthAtomID<0) {
        LOG_DPRINTLN("mmCIF> Warning: auth_atom_id not found in _atom_site");
    }
    m_nAuthCompID = parser.findDataItem("auth_comp_id");
    if (m_nAuthCompID<0) {
        LOG_DPRINTLN("mmCIF> Warning: auth_comp_id not found in _atom_site");
    }
    m_nAuthSeqID = parser.findDataItem("auth_seq_id");
    if (m_nAuthSeqID<0) {
        LOG_DPRINTLN("mmCIF> Warning: auth_seq_id not found in _atom_site");
    }
    m_nAuthAsymID = parser.findDataItem("auth_asym_id");
    if (m_nAuthAsymID<0) {
        LOG_DPRINTLN("mmCIF> Warning: auth_asym_id not found in _atom_site");
    }
    m_nModelID = parser.findDataItem("pdbx_PDB_model_num");

    // m_bLoopDefsOK = true;
    parser.setLoopDefsOK(true);
  }    

  if (!parser.tokenizeLine())
    return;

  int nID;

  if (!parser.getToken(m_nID).toInt(&nID)) {
    error("invalid mmCIF format, cannot get atom site id");
    return;
  }

  int nSeqID;
  if (!parser.getToken(m_nLabelSeqID).toInt(&nSeqID)) {
    //error("invalid mmCIF format");
    //return;
    nSeqID = -1;
  }

  ElemID eleid = ElemSym::str2SymID(parser.getToken(m_nTypeSymbol));

  LString atomname;
  if (m_nAuthAtomID>=0) {
    atomname = parser.getToken(m_nAuthAtomID);
  }
  else if (m_nLabelAtomID>=0) {
    atomname = parser.getToken(m_nLabelAtomID);
  }
  else {
    error("invalid mmCIF format, cannot get atom name (_atom_site.label_atom_id)");
    return;
  }
  if (atomname.getAt(0)=='"')
    atomname = atomname.substr(1, atomname.length()-2);

  LString resname1;
  if (m_nAuthCompID>=0) {
    resname1 = parser.getToken(m_nAuthCompID);
  }
  else if (m_nLabelCompID>=0) {
    resname1 = parser.getToken(m_nLabelCompID);
  }
  else {
    error("invalid mmCIF format, cannot get residue name (_atom_site.label_comp_id)");
    return;
  }
  
  char confid = getConfID(parser, m_nLabelAltID);
  
  LString chain1;
  if (m_nAuthAsymID>=0) {
      chain1 = parser.getToken(m_nAuthAsymID);
  }
  else if (m_nLabelAsymID>=0) {
      chain1 = parser.getToken(m_nLabelAsymID);
  }
  else {
      error("invalid mmCIF format, cannot get chain name (_atom_site.label_asym_id)");
      return;
  }

  ResidIndex residx = getResidIndex(parser, m_nAuthSeqID, m_nInsCode);

  Vector4D pos;
  double dbuf;

  if (!parser.getToken(m_nCartX).toDouble(&dbuf)) {
    error("invalid mmCIF format, cannot get atom site cart_x");
    return;
  }
  pos.x() = dbuf;

  if (!parser.getToken(m_nCartY).toDouble(&dbuf)) {
    error("invalid mmCIF format, cannot get atom site cart_y");
    return;
  }
  pos.y() = dbuf;

  if (!parser.getToken(m_nCartZ).toDouble(&dbuf)) {
    error("invalid mmCIF format, cannot get atom site cart_z");
    return;
  }
  pos.z() = dbuf;

  double occ;
  if (!parser.getToken(m_nOcc).toDouble(&occ)) {
    error("invalid mmCIF format, cannot get atom site occpancy");
    return;
  }

  double bfac;
  if (!parser.getToken(m_nBfac).toDouble(&bfac)) {
    error("invalid mmCIF format, cannot get atom site bfac");
    return;
  }
  
  int nModel;
  if (!parser.getToken(m_nModelID).toInt(&nModel))
    nModel = 1;
  if (nModel>1) {
    if (!m_bLoadMultiModel)
      return;
    chain1 = MolCoord::encodeModelInChain(chain1, nModel);
  }
  
  MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
  pAtom->setParentUID(m_pMol->getUID());
  pAtom->setName(atomname);
  pAtom->setElement(eleid);
  pAtom->setChainName(chain1);
  pAtom->setResIndex(residx);
  pAtom->setResName(resname1);

  pAtom->setPos(pos);
  pAtom->setBfac(bfac);
  pAtom->setOcc(occ);

  //if (!sconfid.equals("?") && !sconfid.equals(".")){
  if (confid!='\0'){
    if (m_bLoadAltConf) {
      pAtom->setConfID(confid);
    }
    else {
      // ignore atoms with conf id other than "A"
      if (confid=='A') {
        return;
      }
    }
  }

  int naid = m_pMol->appendAtom(pAtom);
  if (naid<0) {
    error("invalid mmCIF format, appendAtom() failed!!");
    return;
  }

  m_atommap.insert(std::pair<int,int>(nID, naid));

  //if (nSeqID>=0) {
  //MolResiduePtr pRes = pAtom->getParentResidue();
  //m_residTab.insert(ResidTab::value_type(nSeqID, pRes));
  //}
  
  m_nReadAtoms++;
}


void MmcifMolReader::readAnisoULine(CifParser &parser)
{
  if (!parser.isLoopDefsOK()) {
    // m_recStPos.resize( m_loopDefs.size() );
    // m_recEnPos.resize( m_loopDefs.size() );
    parser.setupLoopDefs();      

    m_nID = parser.findDataItem("id");
    m_nU11 = parser.findDataItem("U[1][1]");
    m_nU22 = parser.findDataItem("U[2][2]");
    m_nU33 = parser.findDataItem("U[3][3]");
    m_nU12 = parser.findDataItem("U[1][2]");
    m_nU13 = parser.findDataItem("U[1][3]");
    m_nU23 = parser.findDataItem("U[2][3]");

    // m_bLoopDefsOK = true;
    parser.setLoopDefsOK(true);
  }    

  if (!parser.tokenizeLine())
    return;

  int nID;

  if (!parser.getToken(m_nID).toInt(&nID)) {
    error("invalid mmCIF format, cannot get anisou ID");
    return;
  }

  double u11, u12, u13, u22, u23, u33;
  if (!parser.getToken(m_nU11).toDouble(&u11)) {
    error("invalid mmCIF format, cannot get anisou U11");
    return;
  }
  if (!parser.getToken(m_nU22).toDouble(&u22)) {
    error("invalid mmCIF format, cannot get anisou U22");
    return;
  }
  if (!parser.getToken(m_nU33).toDouble(&u33)) {
    error("invalid mmCIF format, cannot get anisou U33");
    return;
  }
  if (!parser.getToken(m_nU12).toDouble(&u12)) {
    error("invalid mmCIF format, cannot get anisou U12");
    return;
  }
  if (!parser.getToken(m_nU13).toDouble(&u13)) {
    error("invalid mmCIF format, cannot get anisou U13");
    return;
  }
  if (!parser.getToken(m_nU23).toDouble(&u23)) {
    error("invalid mmCIF format, cannot get anisou U23");
    return;
  }

  AtomIDMap::const_iterator iter = m_atommap.find(nID);
  if (iter==m_atommap.end()) {
    // ignore error...
    // LString msg = LString::format("invalid mmCIF format, cannot find atom with ID=%d", nID);
    // error(msg);
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

void MmcifMolReader::readHelixLine(CifParser &parser)
{
  if (!parser.isLoopDefsOK()) {
    // m_recStPos.resize( m_loopDefs.size() );
    // m_recEnPos.resize( m_loopDefs.size() );
    parser.setupLoopDefs();

    //m_nStSeqID = parser.findDataItem("beg_label_seq_id");
    //m_nEnSeqID = parser.findDataItem("end_label_seq_id");
    
    m_nID = parser.findDataItem("conf_type_id");
    m_nChainID1 = parser.findDataItem("beg_auth_asym_id");
    m_nSeqID1 = parser.findDataItem("beg_auth_seq_id");
    m_nInsID1 = parser.findDataItem("pdbx_beg_PDB_ins_code");

    m_nChainID2 = parser.findDataItem("end_auth_asym_id");
    m_nSeqID2 = parser.findDataItem("end_auth_seq_id");
    m_nInsID2 = parser.findDataItem("pdbx_end_PDB_ins_code");

    m_nHlxClass = parser.findDataItem("pdbx_PDB_helix_class");
    // m_bLoopDefsOK = true;
    parser.setLoopDefsOK(true);
  }

  if (!parser.tokenizeLine())
    return;

  LString idstr = parser.getToken(m_nID);
  if (!idstr.equals("HELX_P"))
    return;

  LString ch = parser.getToken(m_nChainID1);
  // lnk.ch2 = parser.getToken(m_nChainID2);

  ResidIndex begseq = getResidIndex(parser, m_nSeqID1, m_nInsID1);
  ResidIndex endseq = getResidIndex(parser, m_nSeqID2, m_nInsID2);

  int ntype;
  if (!parser.getToken(m_nHlxClass).toInt(&ntype)) {
    ntype = 1;
  }
  
  if (!(begseq<endseq)) {
    LOG_DPRINTLN("mmCIF> Warning: invalid helix line ignored at %d: %s", m_lineno, m_recbuf.c_str());
    return;
  }

  if (ntype==5)
    m_helix310.append(ch, begseq, endseq);
  else if (ntype==3)
    m_helixpi.append(ch, begseq, endseq);
  else
    m_helix.append(ch, begseq, endseq);

  /*
  if (ntype==5)
    m_rng310Helix.push_back(SecStrList::value_type(nStSeqID, nEnSeqID));
  else if (ntype==3)
    m_rngPiHelix.push_back(SecStrList::value_type(nStSeqID, nEnSeqID));
  else
    m_rngHelix.push_back(SecStrList::value_type(nStSeqID, nEnSeqID));
  */
}

void MmcifMolReader::readSheetLine(CifParser &parser)
{
  if (!parser.isLoopDefsOK()) {
    // m_recStPos.resize( m_loopDefs.size() );
    // m_recEnPos.resize( m_loopDefs.size() );
    parser.setupLoopDefs();

    //m_nStSeqID = parser.findDataItem("beg_label_seq_id");
    //m_nEnSeqID = parser.findDataItem("end_label_seq_id");
    
    m_nChainID1 = parser.findDataItem("beg_auth_asym_id");
    m_nSeqID1 = parser.findDataItem("beg_auth_seq_id");
    m_nInsID1 = parser.findDataItem("pdbx_beg_PDB_ins_code");

    m_nChainID2 = parser.findDataItem("end_auth_asym_id");
    m_nSeqID2 = parser.findDataItem("end_auth_seq_id");
    m_nInsID2 = parser.findDataItem("pdbx_end_PDB_ins_code");

    // m_bLoopDefsOK = true;
    parser.setLoopDefsOK(true);
  }

  if (!parser.tokenizeLine())
    return;

  LString ch = parser.getToken(m_nChainID1);
  // lnk.ch2 = parser.getToken(m_nChainID2);

  ResidIndex begseq = getResidIndex(parser, m_nSeqID1, m_nInsID1);
  ResidIndex endseq = getResidIndex(parser, m_nSeqID2, m_nInsID2);

  m_sheet.append(ch, begseq, endseq);

  /*
  int nStSeqID;
  if (!parser.getToken(m_nStSeqID).toInt(&nStSeqID)) {
    error("invalid mmCIF format");
    return;
  }
  int nEnSeqID;
  if (!parser.getToken(m_nEnSeqID).toInt(&nEnSeqID)) {
    error("invalid mmCIF format");
    return;
  }

  m_rngSheet.push_back(SecStrList::value_type(nStSeqID, nEnSeqID));*/
}

void MmcifMolReader::apply2ndry(const char *ss1, const char *ss2, const ResidSet &data)
{
  ResidSet::const_iterator ich = data.begin();
  ResidSet::const_iterator ichen = data.end();
  for (; ich!=ichen; ++ich) {
    const LString &chain = ich->first;
    const ResidSet::mapped_type &rng = ich->second;
    
    ResidSet::mapped_type::const_iterator irn = rng.begin();
    ResidSet::mapped_type::const_iterator irnen = rng.end();

    MolChainPtr pCh = m_pMol->getChain(chain);
    if (pCh.isnull())
      continue;

    for (; irn!=irnen; ++irn) {
      int nst = irn->nstart;
      int nen = irn->nend;
      MB_DPRINTLN("%s %d:%d", chain.c_str(), nst, nen);
      for (int i=nst; i<=nen; ++i) {
        LString val = ss1;

        if (i==nst)
          val += "s";
        else if (i==nen)
          val += "e";
        
        MolResiduePtr pRes = pCh->getResidue(i);
        if (pRes.isnull())
          continue;
        pRes->setPropStr("secondary2", val);
        pRes->setPropStr("secondary", ss2);
        // MB_DPRINTLN("%s %d => %s", chain.c_str(), i, val.c_str());
      }
    }
  }
}

void MmcifMolReader::readConnLine(CifParser &parser)
{
  if (!parser.isLoopDefsOK()) {
    // m_recStPos.resize( m_loopDefs.size() );
    // m_recEnPos.resize( m_loopDefs.size() );
    parser.setupLoopDefs();

    m_nConnTypeID = parser.findDataItem("conn_type_id");
    
    m_nChainID1 = parser.findDataItem("ptnr1_auth_asym_id");
    m_nSeqID1 = parser.findDataItem("ptnr1_auth_seq_id");
    m_nInsID1 = parser.findDataItem("pdbx_ptnr1_PDB_ins_code");
    m_nAtomID1 = parser.findDataItem("ptnr1_label_atom_id");
    m_nAltID1 = parser.findDataItem("pdbx_ptnr1_label_alt_id");
    m_nSymmID1 = parser.findDataItem("ptnr1_symmetry");

    m_nChainID2 = parser.findDataItem("ptnr2_auth_asym_id");
    m_nSeqID2 = parser.findDataItem("ptnr2_auth_seq_id");
    m_nInsID2 = parser.findDataItem("pdbx_ptnr2_PDB_ins_code");
    m_nAtomID2 = parser.findDataItem("ptnr2_label_atom_id");
    m_nAltID2 = parser.findDataItem("pdbx_ptnr2_label_alt_id");
    m_nSymmID2 = parser.findDataItem("ptnr2_symmetry");

    // m_bLoopDefsOK = true;
    parser.setLoopDefsOK(true);
  }

  if (!parser.tokenizeLine())
    return;

  LString conn_typeid = parser.getToken(m_nConnTypeID);
  if (!conn_typeid.equals("covale")&&!conn_typeid.equals("disulf"))
    return;

  Linkage lnk;

  lnk.ch1 = parser.getToken(m_nChainID1);
  lnk.ch2 = parser.getToken(m_nChainID2);

  lnk.resi1 = getResidIndex(parser, m_nSeqID1, m_nInsID1);
  lnk.resi2 = getResidIndex(parser, m_nSeqID2, m_nInsID2);
    
  lnk.aname1 = parser.getToken(m_nAtomID1);
  lnk.aname2 = parser.getToken(m_nAtomID2);

  lnk.alt1 = getConfID(parser, m_nAltID1);
  lnk.alt2 = getConfID(parser, m_nAltID2);
  //LString symm1 = parser.getToken(m_nSymmID1);
  //LString symm2 = parser.getToken(m_nSymmID2);

    m_linkdat.push_back(lnk);
}

void MmcifMolReader::applyLink()
{
    // BOOST_FOREACH (const Linkage &elem, m_linkdat) {
  for (const Linkage &elem: m_linkdat) {
    MolAtomPtr pAtom1, pAtom2;
    pAtom1 = m_pMol->getAtom(elem.ch1, elem.resi1, elem.aname1, elem.alt1);
    pAtom2 = m_pMol->getAtom(elem.ch2, elem.resi2, elem.aname2, elem.alt2);

    if (pAtom1.isnull()||pAtom2.isnull()) {
      error(LString::format("Apply link failed for %s%s %s <--> %s%s %s",
                            elem.ch1.c_str(), elem.resi1.toString().c_str(), elem.aname1.c_str(),
                            elem.ch2.c_str(), elem.resi2.toString().c_str(), elem.aname2.c_str()));
      return;
    }

    m_pMol->makeBond(pAtom1->getID(), pAtom2->getID(), true);
  }  
}


void MmcifMolReader::readCellLine(CifParser &parser)
{
  parser.setupLoopDefs();
  // m_recStPos.resize( m_loopDefs.size() );
  // m_recEnPos.resize( m_loopDefs.size() );

  int nLenAID = parser.findDataItem("length_a");
  if (nLenAID<0) {
    error("_cell.length_a not found in _cell");
    return;
  }
    
  int nLenBID = parser.findDataItem("length_b");
  if (nLenBID<0) {
    error("_cell.length_b not found in _cell");
    return;
  }

  int nLenCID = parser.findDataItem("length_c");
  if (nLenCID<0) {
    error("_cell.length_c not found in _cell");
    return;
  }
    
  int nAngAID = parser.findDataItem("angle_alpha");
  if (nAngAID<0) {
    error("_cell.angle_alpha not found in _cell");
    return;
  }
  int nAngBID = parser.findDataItem("angle_beta");
  if (nAngBID<0) {
    error("_cell.angle_beta not found in _cell");
    return;
  }
  int nAngGID = parser.findDataItem("angle_gamma");
  if (nAngGID<0) {
    error("_cell.angle_gamma not found in _cell");
    return;
  }

  // m_bLoopDefsOK = true;
  parser.setLoopDefsOK(true);

  if (!parser.tokenizeLine())
    return;


  double len_a, len_b, len_c;
  double ang_a, ang_b, ang_g;

  if (!parser.getToken(nLenAID).toDouble(&len_a)) {
    warning("invalid mmCIF format");
    return;
  }
  if (!parser.getToken(nLenBID).toDouble(&len_b)) {
    warning("invalid mmCIF format");
    return;
  }
  if (!parser.getToken(nLenCID).toDouble(&len_c)) {
    warning("invalid mmCIF format");
    return;
  }

  if (!parser.getToken(nAngAID).toDouble(&ang_a)) {
    warning("invalid mmCIF format");
    return;
  }
  if (!parser.getToken(nAngBID).toDouble(&ang_b)) {
    warning("invalid mmCIF format");
    return;
  }
  if (!parser.getToken(nAngGID).toDouble(&ang_g)) {
    warning("invalid mmCIF format");
    return;
  }

  symm::CrystalInfoPtr pci = m_pMol->getCreateExtData("CrystalInfo");

  pci->setCellDimension(len_a, len_b, len_c,
                        ang_a, ang_b, ang_g);
}

void MmcifMolReader::readSymmLine(CifParser &parser)
{
  parser.setupLoopDefs();
  // m_recStPos.resize( m_loopDefs.size() );
  // m_recEnPos.resize( m_loopDefs.size() );
  
  int nSgNameID = parser.findDataItem("space_group_name_H-M");
  
  // m_bLoopDefsOK = true;
  parser.setLoopDefsOK(true);

  if (!parser.tokenizeLine())
    return;

  LString sgname = parser.getToken(nSgNameID);

  symm::CrystalInfoPtr pci = m_pMol->getCreateExtData("CrystalInfo");

  pci->setSGByName(sgname);
}

