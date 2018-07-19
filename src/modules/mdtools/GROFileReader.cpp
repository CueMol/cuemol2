// -*-Mode: C++;-*-
//
// GROMACS GRO File reader class
//
// $Id$

#include <common.h>

#include "GROFileReader.hpp"

#include <qlib/LineStream.hpp>
#include <qlib/LChar.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/TopparManager.hpp>

using namespace mdtools;
using qlib::LChar;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::ElemSym;

GROFileReader::GROFileReader()
{
  m_bBuild2ndry = true;
  m_bAutoTopoGen = true;
}

GROFileReader::~GROFileReader()
{
  MB_DPRINTLN("GROFileReader destructed (%p)", this);
}

/////////////

const char *GROFileReader::getName() const
{
  return "gro";
}

const char *GROFileReader::getTypeDescr() const
{
  return "GRO Coordinates (*.gro)";
}

const char *GROFileReader::getFileExt() const
{
  return "*.gro";
}

qsys::ObjectPtr GROFileReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW molstr::MolCoord());
}

/////////

// read PDB file from stream
bool GROFileReader::read(qlib::InStream &ins)
{
  // get the target
  m_pMol = MolCoordPtr(getTarget<MolCoord>());

  /*
  m_curChainTag = LString();
  m_pCurChain = MolChainPtr();
  m_nPrevResIdx = -1;
  m_pPrevAtom = MolAtomPtr();

  m_nReadAtoms = 0;
  m_nErrCount = 0;
  m_nErrMax = 50;
  m_nDupAtoms = 0;
  m_nLostAtoms = 0;
  */
  try {
    readContents(ins);
  }
  catch (const qlib::LException &e) {
    // ERROR !!
    m_pMol = MolCoordPtr();
    //m_pCurChain = MolChainPtr();
    //m_pPrevAtom = MolAtomPtr();
    LOG_DPRINTLN("GROFileReader> Fatal Error; exception: %s",
                 e.getFmtMsg().c_str());
    throw;
  }
  catch (...) {
    // ERROR !!
    m_pMol = MolCoordPtr();
    //m_pCurChain = MolChainPtr();
    //m_pPrevAtom = MolAtomPtr();
    LOG_DPRINTLN("GROFileReader> Fatal Error; unknown exception");
    throw;
  }

  // perform post-processing
  postProcess();

  // notify modification
  // m_pMol->fireAtomsAppended();

  /*
  if (m_nErrCount>m_nErrMax)
    LOG_DPRINTLN("GROFileReader> Too many errors (%d) were supressed", m_nErrCount-m_nErrMax);

  if (m_nLostAtoms>0)
    LOG_DPRINTLN("GROFileReader> Warning!! %d atom(s) lost", m_nLostAtoms);

  if (m_nDupAtoms>0)
    LOG_DPRINTLN("GROFileReader> Warning!! names of %d duplicated atom(s) changed", m_nDupAtoms);

  LOG_DPRINTLN("GROFileReader> read %d atoms", m_nReadAtoms);

  // Clean-up the workspace
  m_pMol = MolCoordPtr();
  m_pCurChain = MolChainPtr();
  m_pPrevAtom = MolAtomPtr();
  */
  return true;
}

void GROFileReader::readContents(qlib::InStream &ins)
{
  qlib::LineStream lin(ins);
  
  bool res;
  LString buf;

  readRecord(lin);
  LOG_DPRINTLN("1: %s", m_recbuf.c_str());

  // NATOM
  int natom;
  readRecord(lin);
  if (!m_recbuf.toInt(&natom)) {
    MB_THROW(qlib::FileFormatException, "Cannot read natom line");
    return;
  }
  LOG_DPRINTLN("GRO> natoms=%d", natom);

  int i;
  for (i=0; i<natom; ++i) {
    if (!readRecord(lin))
      break;

    // Skip empty lines
    if (m_recbuf.isEmpty())
      continue;
    
    // read residue number field
    LString str_resid = readStrTrim(1,5);
    if (str_resid.isEmpty()) {
       LOG_DPRINTLN("GROFileReader> warning: Empty resid num.");
      continue;
    }
    int nresid;
    if (!str_resid.toInt(&nresid)) {
      MB_THROW(qlib::FileFormatException, "Cannot read XXX");
      return;
    }

    //LOG_DPRINT("residue number: <%s>\n", str_resid.c_str());

    // read residue name field
    LString str_resnm = readStrTrim(6,10);
    if (str_resnm.isEmpty()) {
       LOG_DPRINTLN("GROFileReader> warning: Empty resid name.");
      continue;
    }

    // read atom name field
    LString str_atmnm = readStrTrim(11,15);
    if (str_atmnm.isEmpty()) {
       LOG_DPRINTLN("GROFileReader> warning: Empty atom name.");
      continue;
    }

    // read atom number field
    LString str_atmid = readStrTrim(16,20);
    if (str_atmid.isEmpty()) {
       LOG_DPRINTLN("GROFileReader> warning: Empty atom number.");
      continue;
    }
    int atomid;
    if (!str_resid.toInt(&atomid)) {
      MB_THROW(qlib::FileFormatException, "Cannot read XXX");
      return;
    }

    // read atom number field
    double xpos;
    readDouble(21,28,&xpos);

    // read atom number field
    double ypos;
    readDouble(29,36,&ypos);

    // read atom number field
    double zpos;
    readDouble(37,42,&zpos);

    LOG_DPRINTLN("read: %s/%d/%s/%d (%f,%f,%f)",
	       str_resnm.c_str(),
	       nresid,
	       str_atmnm.c_str(),
	       atomid,
	       xpos, ypos, zpos
	       );
  }
}


bool GROFileReader::isOrganicAtom(int eleid) const
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


bool GROFileReader::checkAtomRecord(LString &chain, LString &resname, LString &atom)
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
int GROFileReader::convFromAname(const LString &atomname)
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

bool GROFileReader::readAtom()
{
  return true;
}



bool GROFileReader::readRecord(qlib::LineStream &ins)
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

void GROFileReader::postProcess()
{
  // Apply automatic topology/linkage information
  m_pMol->applyTopology(m_bAutoTopoGen);
  
  // Setup secondary structure info (proteins)
  if (m_bBuild2ndry) {
    // without setting modified flag
    m_pMol->calcProt2ndry(-500.0);
  }

  //if (m_bBuildBasePair)
  {
    m_pMol->calcBasePair(3.7, 30);
  }
}


