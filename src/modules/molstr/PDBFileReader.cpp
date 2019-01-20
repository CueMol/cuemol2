// -*-Mode: C++;-*-
//
// PDB coordinate reader
//
// $Id: PDBFileReader.cpp,v 1.24 2011/04/06 13:09:32 rishitani Exp $
//

#include <common.h>

#include "PDBFileReader.hpp"

#include <qlib/LineStream.hpp>
#include <qlib/LChar.hpp>

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "MolAtom.hpp"
#include "ResidIterator.hpp"
#include "TopparManager.hpp"

#define CCP4_CONV 1
//#define QTL_CONV 1

using namespace molstr;
using qlib::LChar;

PDBFileReader::PDBFileReader()
  : m_nCurrModel(-1), m_nDefaultModel(-2)
{
  m_bLoadMultiModel = false;
  m_bLoadAltConf = true;
  m_bLoadAnisoU = true;
  m_bBuild2ndry = true;
  m_bAutoTopoGen = true;

  m_nErrCount = 0;
  m_nErrMax = 50;
  m_nDupAtoms = 0;
  m_nLostAtoms = 0;
}

PDBFileReader::~PDBFileReader()
{
  MB_DPRINTLN("PDBFileReader destructed (%p)", this);
}

/////////////

/** get nickname for scripting */
const char *PDBFileReader::getName() const
{
  return "pdb";
}

/** get file-type description */
const char *PDBFileReader::getTypeDescr() const
{
  return "PDB Coordinates (*.pdb;*.ent;*.pdb.gz)";
}

/** get file extension */
const char *PDBFileReader::getFileExt() const
{
  return "*.pdb; *.ent; *.pdb.gz";
  //return "*.pdb; *.ent";
}

qsys::ObjectPtr PDBFileReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW MolCoord());
}

/////////

// read PDB file from stream
bool PDBFileReader::read(qlib::InStream &ins)
{
  // get the target
  m_pMol = MolCoordPtr(getTarget<MolCoord>());

  m_curChainTag = LString();
  m_pCurChain = MolChainPtr();
  m_nPrevResIdx = -1;
  m_pPrevAtom = MolAtomPtr();

  m_nReadAtoms = 0;
  m_nErrCount = 0;
  m_nErrMax = 50;
  m_nDupAtoms = 0;
  m_nLostAtoms = 0;

  try {
    readContents(ins);
  }
  catch (const qlib::LException &e) {
    // ERROR !!
    m_pMol = MolCoordPtr();
    m_pCurChain = MolChainPtr();
    m_pPrevAtom = MolAtomPtr();
    LOG_DPRINTLN("PDBFileReader> Fatal Error; exception: %s",
                 e.getFmtMsg().c_str());
    throw;
  }
  catch (...) {
    // ERROR !!
    m_pMol = MolCoordPtr();
    m_pCurChain = MolChainPtr();
    m_pPrevAtom = MolAtomPtr();
    LOG_DPRINTLN("PDBFileReader> Fatal Error; unknown exception");
    throw;
  }

  // perform post-processing
  postProcess();

  // notify modification
  // m_pMol->fireAtomsAppended();

  if (m_nErrCount>m_nErrMax)
    LOG_DPRINTLN("PDBFileReader> Too many errors (%d) were supressed", m_nErrCount-m_nErrMax);

  if (m_nLostAtoms>0)
    LOG_DPRINTLN("PDBFileReader> Warning!! %d atom(s) lost", m_nLostAtoms);

  if (m_nDupAtoms>0)
    LOG_DPRINTLN("PDBFileReader> Warning!! names of %d duplicated atom(s) changed", m_nDupAtoms);

  LOG_DPRINTLN("PDBFileReader> read %d atoms", m_nReadAtoms);

  // Clean-up the workspace
  m_pMol = MolCoordPtr();
  m_pCurChain = MolChainPtr();
  m_pPrevAtom = MolAtomPtr();

  return true;
}

void PDBFileReader::readContents(qlib::InStream &ins)
{
  qlib::LineStream lin(ins);
  
  bool bUseHndlr = m_htab.size()>0;
  bool res;
  LString buf;

  m_helix.clear();
  m_sheet.clear();

  for ( ;; ) {
    if (!readRecord(lin))
      break;

    // Skip empty lines
    if (m_recbuf.isEmpty())
      continue;
    
    // read record name string
    LString recnam = readStr(1,6);
    recnam = recnam.trim();
    if (recnam.isEmpty()) {
      // LOG_DPRINTLN("PDBFileReader> warning: Empty line.");
      continue;
    }
    // MB_DPRINT("record name : <%s>\n", recnam.c_str());

    if (recnam.equals("ATOM") || recnam.equals("HETATM")) {
      if (m_nDefaultModel==-2)
        m_nDefaultModel = m_nCurrModel;
      //if (m_nDefaultModel == m_nCurrModel)

      res = readAtom();
      if (res)
        m_nReadAtoms ++;
    }
    else if (recnam.equals("HEADER") ||
             recnam.equals("TITLE") ||
             recnam.equals("EXPDTA") ||
             recnam.equals("AUTHOR") ||
             recnam.equals("REVDAT")) {
      buf = readStr(1,70);
      // buf = buf.toUpperCase();
      LOG_DPRINTLN("PDBFileReader> %s", buf.c_str());
    }
    else if (recnam.equals("HELIX")) {
      if (!readHelixRecord()) {
        buf = readStr(1,70);
        // buf = buf.toUpperCase();
        m_nErrCount ++;
        if (m_nErrCount<m_nErrMax)
          LOG_DPRINTLN("PDBRead> invalid HELIX line %s", buf.c_str());
      }
    }
    else if (recnam.equals("SHEET")) {
      if (!readSheetRecord()) {
        buf = readStr(1,70);
        // buf = buf.toUpperCase();
        m_nErrCount ++;
        if (m_nErrCount<m_nErrMax)
          LOG_DPRINTLN("PDBRead> invalid SHEET line %s", buf.c_str());
      }
    }
    else if (recnam.equals("ANISOU")) {
      if (m_bLoadAnisoU)
        readAnisou();
    }
    else if (recnam.equals("MODEL")) {
      //buf = readStr(11, 14);
      buf = m_recbuf.substr(6);
      if (buf.toInt(&m_nCurrModel)) {
        // valid model record ...
	// LOG_DPRINTLN("line: %s", readStr(1,70).c_str());
	// LOG_DPRINTLN("buf: %s", buf.c_str());
        // LOG_DPRINTLN("Read model %d (def=%d, flag=%d)", m_nCurrModel, m_nDefaultModel, m_bLoadMultiModel);

	// if (m_nDefaultModel!=-2 && m_nCurrModel!=m_nDefaultModel)
	// LOG_DPRINTLN("PDBReader> WARNING: MODEL %d is ignored!", m_nCurrModel);
      }
      else {
        readError("MODEL");
        m_nCurrModel = -1;
      }
    }
    else if (recnam.equals("ENDMDL")) {
      // end of model section
      m_nCurrModel = -1;
    }
    else if (recnam.equals("SSBOND")) {
      if (!readSSBond()) {
        readError("SSBOND");
      }
    }
    else if (recnam.equals("LINK")) {
      if (!readLink()) {
        readError("LINK");
      }
    }
    else if (recnam.equals("REMARK")) {
      if (!readRemark()) {
        readError("REMARK");
      }
    }
    else if (bUseHndlr) {
      RecordHandler *ph = m_htab.get(recnam);
      if (ph!=NULL)
        ph->read(m_recbuf, m_pMol.get());
    }
  }
}

void PDBFileReader::readError(const LString &recnam)
{
  LString buf = readStr(1,70);
  // buf = buf.toUpperCase();
  m_nErrCount ++;
  if (m_nErrCount<m_nErrMax)
    LOG_DPRINTLN("PDBRead> invalid %s line %s", recnam.c_str(), buf.c_str());
}

bool PDBFileReader::isOrganicAtom(int eleid) const
{
  if (eleid==ElemSym::H ||
      eleid==ElemSym::C ||
      eleid==ElemSym::N ||
      eleid==ElemSym::O ||
      eleid==ElemSym::P ||
      eleid==ElemSym::S)
    return true;
  else
    return false;
}


bool PDBFileReader::checkAtomRecord(LString &chain, LString &resname, LString &atom)
{
  if (chain.isEmpty())
    chain = "_";

  if (resname.length()<=0)
    return false;
  
#if defined(QTL_CONV)
  if (resname.equals("A")) {
    // residue A represents ADE
    resname = "ADE";
  }
  else if (resname.equals("C")) {
    // residue C represents CYT
    resname = "CYT";
  }
  else if (resname.equals("G")) {
    // residue G represents GUA
    resname = "GUA";
  }
  else if (resname.equals("T")) {
    // residue T represents THY
    resname = "THY";
  }
  else if (resname.equals("U")) {
    // residue U represents URI
    resname = "URI";
  }

  // convert "*" to "'"
  int len = atom.length();
  if (len<=0)
    return false;
  char lastch = (atom.c_str())[len-1];
  if (lastch=='*') {
    //LString tmp = atom.left(len-1);
    atom = atom.left(len-1) + '\''; //tmp.append('\'');
  }

  // convert THY's C5M to C5A
  if (resname.equals("THY") && atom.equals("C5M")) {
    atom = "C5A";
  }

  // convert ILE's CD1 to CD
  if (resname.equals("ILE") && atom.equals("CD1")) {
    atom = "CD";
  }

#elif defined(CCP4_CONV)
  // convert ILE's CD to CD1
  if (resname.equals("ILE") && atom.equals("CD")) {
    atom = "CD1";
  }
#endif

  return true;
}

/** get element name from atomname (for illegal PDB files) */
int PDBFileReader::convFromAname(const LString &atomname)
{
  int i, nsize = atomname.length();
  const char *panam = atomname.c_str();

  for (i=0; i<nsize; i++) {
    switch (panam[i]) {
    case 'H':
      return ElemSym::H;
      break;

    case 'C':
      if (i+1<nsize) {
        if (panam[i+1]=='L')
          return ElemSym::Cl;
        if (panam[i+1]=='A')
          return ElemSym::Ca;
        if (panam[i+1]=='O')
          return ElemSym::Co;
        if (panam[i+1]=='U')
          return ElemSym::Cu;
        if (panam[i+1]=='R')
          return ElemSym::Cr;
      }      
      return ElemSym::C;
      break;

    case 'N':
      if (i+1<nsize) {
        if (panam[i+1]=='A')
          return ElemSym::Na;
        if (panam[i+1]=='I')
          return ElemSym::Ni;
      }      
      return ElemSym::N;
      break;

    case 'O':
      return ElemSym::O;
      break;

    case 'F':
      if (i+1<nsize) {
        if (panam[i+1]=='E')
          return ElemSym::Fe;
      }      
      return ElemSym::F;
      break;

    case 'P':
      return ElemSym::P;
      break;

    case 'S':
      return ElemSym::S;
      break;

    default:
      continue;
    }
  }

  return ElemSym::XX;
}

bool PDBFileReader::readAtom()
{
  // If LoadMultiModel==false,
  // we ignore ATOM line in the non-default models.
  if (!m_bLoadMultiModel && m_nDefaultModel!=m_nCurrModel)
    return true;

  LString atomname;
  ElemID eleid = ElemSym::XX;
  {
    // read atom name and extract element type
    // "ABCD" -> type 1: Element=AB and Name=ABCD (e.g. " CA " or "CA  ")
    //           type 2: Index=A Element=B and Name=ABCD (e.g. "1HD2")

    LString elename;
    atomname = readStr(13,16).trim();
    LString eleorig = readStr(13,14);

    for ( ;; ) {
      // check "type 1"
      elename = eleorig.trim(" ");
      eleid = ElemSym::str2SymID(elename);
      if (eleid!=ElemSym::XX)
        break; // type 1 OK 

      // check "type 2"
      LString ich = eleorig.substr(0,1);
      int dum;
      if (ich.toInt(&dum)) {
        elename = eleorig.substr(1,1);
        eleid = ElemSym::str2SymID(elename);
        if (eleid!=ElemSym::XX)
          break; // type 2 OK 
      }
      
      // illegal type
      eleid = ElemSym::str2SymID(atomname);
      if (eleid!=ElemSym::XX)
        break;
      eleid = convFromAname(readStr(13,16));
      if (eleid!=ElemSym::XX)
        break;

      LString pdb_elem = readStr(77,78).trim();
      eleid = ElemSym::str2SymID(pdb_elem);
      
      break;
    }
  }
  
  if (atomname.isEmpty())
    atomname = ElemSym::symID2Str(eleid);

  // read Residue name
  LString resname = readStr(18,20).trim();
  if (!isOrganicAtom(eleid)) {
    if (TopparManager::isAminoAcid(resname) ||
        TopparManager::isNuclAcid(resname)) {
      // amino acids and nucleic acids don't have inorganic atoms!!
      if (eleid==ElemSym::Hg ||
          eleid==ElemSym::Ho ||
          eleid==ElemSym::Hf ||
          eleid==ElemSym::He)
        eleid = ElemSym::H;
      else if (eleid==ElemSym::Ca)
        eleid = ElemSym::C;
      else if (eleid==ElemSym::Ne)
        eleid = ElemSym::N;
    }
  }
  
  if (resname.isEmpty()) {
    // empty resname --> default resname
    resname = "UNK";
  }
  
  // read conformation ID
  char confid = readChar(17);

  // read Chain name
  // char cchain = readChar(22);
  // if (cchain==' ') cchain = '\0';
  LString chain = readStr(22,22).trim();

  // read X-plor segment ID field (non PDB std)
  if (m_bLoadSegID) {
    // read X-plor segment ID field as chain ID
    chain = readStr(73,76).trim();
  }

  // read index of residue (residx)
  LString resSeq = readStr(23,26).trim();
  char iCode = readChar(27);
  int itmp;
  if (!resSeq.toInt(&itmp)) {
    // invalid res index --> default index (0)
    itmp = 0;
  }
  ResidIndex residx(itmp);
  if (iCode!=' ')
    residx.second = iCode;

  // perform some conversions for non-standard PDB files
  if (!checkAtomRecord(chain, resname, atomname))
    return false;

  // process model ID (encode model ID in the chain name)
  LString schain(chain);
  if (m_nDefaultModel!=m_nCurrModel)
    schain = MolCoord::encodeModelInChain(chain, m_nCurrModel);

  MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
  pAtom->setParentUID(m_pMol->getUID());
  pAtom->setName(atomname);
  pAtom->setElement(eleid);
  pAtom->setChainName(schain);
  pAtom->setResIndex(residx);
  pAtom->setResName(resname);

  // read atom coordinate values

  LString sbuf;
  double dbuf;
  qlib::Vector4D pos;

  if (!readStr(31,38).toDouble(&dbuf)){
    MB_THROW(PDBFileFormatException,
             LString::format("Invalid ATOM line (X coord) at %d: %s",
                             m_lineno,
                             m_recbuf.c_str()));
                             //m_recbuf.toUpperCase().c_str()));
    dbuf = 0.0;
  }
  pos.x() = dbuf;

  if (!readStr(39,46).toDouble(&dbuf)){
    MB_THROW(PDBFileFormatException,
             LString::format("Invalid ATOM line (Y coord) at %d: %s",
                             m_lineno,
                             m_recbuf.c_str()));
                             //m_recbuf.toUpperCase().c_str()));
    dbuf = 0.0;
  }
  pos.y() = dbuf;

  if (!readStr(47,54).toDouble(&dbuf)){
    MB_THROW(PDBFileFormatException,
             LString::format("Invalid ATOM line (Z coord) at %d: %s",
                             m_lineno,
                             m_recbuf.c_str()));
                             //m_recbuf.toUpperCase().c_str()));
    dbuf = 0.0;
  }
  pos.z() = dbuf;

  pAtom->setPos(pos);

  if (!readStr(61,66).toDouble(&dbuf)){
    dbuf = 1.0;
  }
  pAtom->setBfac(dbuf);
  
  if (!readStr(55,60).toDouble(&dbuf)){
    dbuf = 1.0;
  }
  pAtom->setOcc(dbuf);

  //int iatomseq;
  //if (readStr(7,11).toInt(&iatomseq)){
  //pAtom->setPropInt("atomseq", iatomseq);
  //}

  // check multi-conformational atom
  if (confid!=' ') {
    if (m_bLoadAltConf)
      pAtom->setConfID(confid);
    else {
      // ignore atoms with conf id other than 'A'
      if (confid!='A') {
        m_pPrevAtom = pAtom;
        return true;
      }
    }
  }

  int inum = 0, naid;
  LString aname = pAtom->getName();

  for (;;++inum) {
    naid = m_pMol->appendAtom(pAtom);

    if (naid>=0)
      break;

    LString cname = pAtom->getChainName();
    ResidIndex resid = pAtom->getResIndex();

    MolAtomPtr ptmp =  m_pMol->getAtom(cname, resid, pAtom->getName(), pAtom->getConfID());
    if (ptmp.isnull()) {
      LString stmp = m_recbuf;
      stmp = stmp.chomp();
      m_nErrCount ++;
      if (m_nErrCount<m_nErrMax)
        LOG_DPRINTLN("PDBFileReader> read ATOM line failed: %s", stmp.c_str());
      break;
    }

    // duplicated atom --> try to change the atom name
    LString newanam;

    if (inum<100) {
      if (aname.length()>2)
        break; // ERR
      newanam = LString::format("%s%02d", aname.c_str(), inum%100);
    }
    else {
      if (aname.length()>1)
        break; // ERR
      else if (inum<1000)
        newanam = LString::format("%d%s%02d", inum/100, aname.c_str(), inum%100);
      else
        break; // ERR
    }
    pAtom->setName(newanam);

    // retry
  }

  if (inum>0)
    ++m_nDupAtoms;

  if (naid<0)
    ++m_nLostAtoms;

  m_pPrevAtom = pAtom;
  return true;
}

void PDBFileReader::readAnisou()
{
  double u11, u12, u13, u22, u23, u33;

  if (m_pPrevAtom.isnull()) {
    m_nErrCount ++;
    if (m_nErrCount<m_nErrMax)
      LOG_DPRINTLN("PDBFile> Error: ANISOU line must be preceded by ATOM/HETATM line");
    return;
  }

  bool bOK = false;
  for ( ;; ) {
    if (!readStr(29, 35).toDouble(&u11))
      break;
    if (!readStr(36, 42).toDouble(&u22))
      break;
    if (!readStr(43, 49).toDouble(&u33))
      break;
    if (!readStr(50, 56).toDouble(&u12))
      break;
    if (!readStr(57, 63).toDouble(&u13))
      break;
    if (!readStr(64, 70).toDouble(&u23))
      break;
    bOK = true;
    break;
  }

  if (!bOK) {
    LString msg = LString::format("Invalid ANISOU line at %d: %s",
                                  m_lineno,
                                  m_recbuf.c_str());
                                  //m_recbuf.toUpperCase().c_str());
    m_nErrCount ++;
    if (m_nErrCount<m_nErrMax)
      LOG_DPRINTLN("PDBFile> %s", msg.c_str());
    return;
  }

  u11 /= 1.0e4;
  u12 /= 1.0e4;
  u13 /= 1.0e4;
  u22 /= 1.0e4;
  u23 /= 1.0e4;
  u33 /= 1.0e4;

  m_pPrevAtom->setU(0, 0, u11);
  m_pPrevAtom->setU(0, 1, u12);
  m_pPrevAtom->setU(0, 2, u13);
  m_pPrevAtom->setU(1, 1, u22);
  m_pPrevAtom->setU(1, 2, u23);
  m_pPrevAtom->setU(2, 2, u33);
}

/** process HELIX record */
bool PDBFileReader::readHelixRecord()
{
  // ignore HELIX record if the rebuilding is requested.
  if (m_bBuild2ndry) return true;

  LString sbuf;

  // init chain ID
  char initch = readChar(20);

  // init resid num
  sbuf = readStr(22,25);
  int initseq;
  if (!LChar::toInt(sbuf, initseq))
    return false;
  
  // end chain ID
  char endch = readChar(32); 

  // init resid num
  sbuf = readStr(34, 37);
  int endseq;
  if (!LChar::toInt(sbuf, endseq))
    return false;
  
  if (initch!=endch || initseq>endseq)
    return false;

  if (initch==' ')
    initch = endch = '_';

  // typeof helix
  int ntype = 1;
  sbuf = readStr(39, 40);
  if (!sbuf.toInt(&ntype))
    ntype = 1;

  MB_DPRINTLN("HELIX %c%d - %c%d type=%d",
              initch, initseq,
              initch, endseq, ntype);

  if (ntype==5)
    m_helix310.append(initch, initseq, endseq);
  else if (ntype==3)
    m_helixpi.append(initch, initseq, endseq);
  else
    m_helix.append(initch, initseq, endseq);

  //TagName chtag(initch);
  //RangeSel &helices = *(RangeSel *)m_pHelix;
  //helices.append(chtag, initseq, endseq);

  return true;
}

/// process SHEET record
bool PDBFileReader::readSheetRecord()
{
  // ignore SHEET record if the rebuilding is requested.
  if (m_bBuild2ndry) return true;

  LString sbuf;

  // init chain ID
  char initch = readChar(22);

  // init resid num
  sbuf = readStr(23,26);
  int initseq;
  if (!sbuf.toInt(&initseq))
    return false;
  
  // end chain ID
  char endch = readChar(33);

  // init resid num
  sbuf = readStr(34, 37);
  int endseq;
  if (!sbuf.toInt(&endseq))
    return false;
  
  if (initch!=endch || initseq>endseq)
    return false;

  if (initch==' ')
    initch = endch = '_';

  MB_DPRINTLN("SHEET %c%d - %c%d",
              initch, initseq,
              initch, endseq);

  m_sheet.append(initch, initseq, endseq);

  //TagName chtag(initch);
  //RangeSel &sheets = *(RangeSel *)m_pSheet;
  //sheets.append(chtag, initseq, endseq);

  return true;
}

bool PDBFileReader::readSSBond()
{
  LString sbuf;

  char ch1 = readChar(16);
  if (ch1==' ') ch1 = '_';
  sbuf = readStr(18, 21);
  int resi1;
  if (!sbuf.toInt(&resi1))
    return false;
  char ins1 = readChar(22);
  if (ins1==' ') ins1 = '\0';

  char ch2 = readChar(30);
  if (ch2==' ') ch2 = '_';
  sbuf = readStr(32, 35);
  int resi2;
  if (!sbuf.toInt(&resi2))
    return false;

  char ins2 = '\0';
  if (isAvailChar(36)) {
    ins2 = readChar(36);
    if (ins2==' ') ins2 = '\0';
  }

  m_linkdat.push_back(Linkage());
  Linkage &dat = m_linkdat.back();
  dat.bSSBond = true;
  dat.ch1 = LString(ch1);
  dat.resi1.first = resi1;
  dat.resi1.second = ins1;
  dat.ch2 = LString(ch2);
  dat.resi2.first = resi2;
  dat.resi2.second = ins2;

  return true;
}

bool PDBFileReader::readLink()
{
  LString sbuf;

  LString aname1 = readStr(13, 16).trim();
  char alt1 = readChar(17);
  if (alt1==' ') alt1 = '\0';
  LString resn1 = readStr(18, 20).trim();
  char ch1 = readChar(22);
  if (ch1==' ') ch1 = '_';
  sbuf = readStr(23, 26);
  int resi1;
  if (!sbuf.toInt(&resi1))
    return false;
  char ins1 = readChar(27);
  if (ins1==' ') ins1 = '\0';

  LString aname2 = readStr(43, 46).trim();
  char alt2 = readChar(47);
  if (alt2==' ') alt2 = '\0';
  LString resn2 = readStr(48, 50).trim();
  char ch2 = readChar(52);
  if (ch2==' ') ch2 = '_';
  sbuf = readStr(53, 56);
  int resi2;
  if (!sbuf.toInt(&resi2))
    return false;
  char ins2 = readChar(57);
  if (ins2==' ') ins2 = '\0';

  m_linkdat.push_back(Linkage());
  Linkage &dat = m_linkdat.back();
  dat.bSSBond = false;
  dat.ch1 = LString(ch1);
  dat.resi1.first = resi1;
  dat.resi1.second = ins1;
  dat.aname1 = aname1;
  dat.alt1 = alt1;

  dat.ch2 = LString(ch2);
  dat.resi2.first = resi2;
  dat.resi2.second = ins2;
  dat.aname2 = aname2;
  dat.alt2 = alt2;

  return true;
}

bool PDBFileReader::readRecord(qlib::LineStream &ins)
{
  //if (!ins.ready())
  //return false;
  
  LString str = ins.readLine();
  if (str.isEmpty())
    return false;

  m_recbuf = str.chomp();

  // m_recbuf = m_recbuf.toUpperCase();
  m_lineno = ins.getLineNo();
  return true;
}

void PDBFileReader::postProcess()
{
  // Apply automatic topology/linkage information
  m_pMol->applyTopology(m_bAutoTopoGen);
  
  // Apply manually defined linkage info (SSBOND, LINK)
  BOOST_FOREACH (const Linkage &elem, m_linkdat) {
    if (elem.bSSBond) {
      MB_DPRINTLN("PDBRead> SSBOND [%s%s] - [%s%s]",
                  elem.ch1.c_str(), elem.resi1.toString().c_str(),
                  elem.ch2.c_str(), elem.resi2.toString().c_str());

      MolAtomPtr pAtom1 = m_pMol->getAtom(elem.ch1, elem.resi1, "SG");
      MolAtomPtr pAtom2 = m_pMol->getAtom(elem.ch2, elem.resi2, "SG");
      if (!pAtom1.isnull() && !pAtom2.isnull())
        m_pMol->makeBond(pAtom1->getID(), pAtom2->getID(), true);
    }
    else {
      
      MolAtomPtr pAtom1 = m_pMol->getAtom(elem.ch1, elem.resi1, elem.aname1, elem.alt1);
      MolAtomPtr pAtom2 = m_pMol->getAtom(elem.ch2, elem.resi2, elem.aname2, elem.alt2);

      if (!pAtom1.isnull() && !pAtom2.isnull())
        m_pMol->makeBond(pAtom1->getID(), pAtom2->getID(), true);
    }
  }

  // Setup secondary structure info (proteins)
  if (m_bBuild2ndry) {
    // without setting modified flag
    m_pMol->calcProt2ndry(-500.0);
  }
  else {
    apply2ndry("H", "helix", m_helix);
    apply2ndry("G", "helix", m_helix310);
    apply2ndry("I", "helix", m_helixpi);
    apply2ndry("E", "sheet", m_sheet);
  }

  //if (m_bBuildBasePair)
  {
    m_pMol->calcBasePair(3.7, 30);
  }
}

void PDBFileReader::apply2ndry(const char *ss1, const char *ss2, const ResidSet &data)
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

bool PDBFileReader::readRemark()
{
  LString sbuf;

  LString subkey = readStr(8, 13).trim();
  if (subkey.equals("BASEPR"))
    return true;

  return true;
}

/*
int PDBFileReader::isSupportedFile(const char *fname, qlib::InStream *pins)
{
  LString strfname(fname);
  strfname = strfname.toLowerCase();
  
  if (strfname.endsWith(".pdb"))
    return SF_SUPPORTED;

  return SF_UNKNOWN;
}*/

////////////////////////////////

PDBFileReader::HndlrTab PDBFileReader::m_htab;

void PDBFileReader::registerHandler(RecordHandler *pH)
{
  m_htab.forceSet(pH->getRecordName(), pH);
}

PDBFileReader::RecordHandler *PDBFileReader::getHandler(const LString &name)
{
  return m_htab.get(name);
}

void PDBFileReader::init()
{
}

void PDBFileReader::fini()
{
  m_htab.clearAndDelete();
}

