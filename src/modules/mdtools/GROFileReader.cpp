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

#include "Trajectory.hpp"

using namespace mdtools;
using qlib::LChar;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::MolAtom;
using molstr::MolAtomPtr;
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
  m_pMol = MolCoordPtr( getTarget<MolCoord>() );
  m_pTraj = TrajectoryPtr( getTarget<Trajectory>() );

  m_nReadAtoms = 0;

  try {
    readContents(ins);
  }
  catch (const qlib::LException &e) {
    // ERROR !!
    m_pMol = MolCoordPtr();
    m_pTraj = TrajectoryPtr();
    LOG_DPRINTLN("GROFileReader> Fatal Error; exception: %s",
                 e.getFmtMsg().c_str());
    throw;
  }
  catch (...) {
    // ERROR !!
    m_pMol = MolCoordPtr();
    m_pTraj = TrajectoryPtr();
    LOG_DPRINTLN("GROFileReader> Fatal Error; unknown exception");
    throw;
  }

  // perform post-processing
  postProcess();

  LOG_DPRINTLN("GROFileReader> read %d atoms", m_nReadAtoms);

  // Clean-up the workspace
  m_pMol = MolCoordPtr();
  m_pTraj = TrajectoryPtr();

  return true;
}

void GROFileReader::readContents(qlib::InStream &ins)
{
  qlib::LineStream lin(ins);
  
  bool res;
  LString buf;

  readRecord(lin);
  // LOG_DPRINTLN("1: %s", m_recbuf.c_str());

  // NATOM
  int natom;
  readRecord(lin);
  if (!m_recbuf.toInt(&natom)) {
    MB_THROW(qlib::FileFormatException, "Cannot read natom line");
    return;
  }
  LOG_DPRINTLN("GRO> natoms=%d", natom);
  m_nAllAtoms = natom;

  //LString schain("_");
  MolAtomPtr pAtom;
  char cchain = 'A';
  int prev_resid = -1;
  int i;
  for (i=0; i<natom; ++i) {
    if (!readRecord(lin)) {
      LOG_DPRINTLN("GRO> readRecord failed for %d-th atom", i);
      break;
    }

    pAtom = readAtom();
    if (pAtom.isnull())
      continue;

    int nresid = pAtom->getResIndex().first;
    if (nresid<prev_resid && cchain<='Z')
      cchain ++;

    pAtom->setChainName(LString(cchain));

    int inum = 0, naid;
    
    for (;;++inum) {
      naid = m_pMol->appendAtom(pAtom);
      if (naid>=0) {
	prev_resid = nresid;
	m_nReadAtoms++;
	break; // OK
      }

      if (cchain>='Z') {
	LOG_DPRINTLN("GRO> ERROR: append atom failed.");
	break;
      }
      
      cchain ++;
      pAtom->setChainName(LString(cchain));
      // --> retry

    } // for (;;++inum)...
    
  } // for


  if (!readRecord(lin)) {
    LOG_DPRINTLN("GRO> readRecord failed for cell dim");
    return;
  }

  // cell info
  //  10.00000  10.00000   8.00000

  double cella, cellb, cellc;
  readDouble(1,10,&cella);
  readDouble(11,20,&cellb);
  readDouble(21,30,&cellc);
  LOG_DPRINTLN("PBC: %f, %f, %f", cella, cellb, cellc);

}


/// get element name from atomname (for illegal PDB files)
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

MolAtomPtr GROFileReader::readAtom()
{
  // Skip empty lines
  if (m_recbuf.isEmpty())
    return MolAtomPtr();
    
  // read residue number field
  int nresid;
  readInt(1,5,&nresid);

  //LOG_DPRINT("residue number: <%s>\n", str_resid.c_str());

  // read residue name field
  LString str_resnm = readStrTrim(6,10);
  if (str_resnm.isEmpty()) {
    LOG_DPRINTLN("GROFileReader> warning: Empty resid name.");
    return MolAtomPtr();
  }

  // read atom name field
  LString str_atmnm = readStrTrim(11,15);
  if (str_atmnm.isEmpty()) {
    LOG_DPRINTLN("GROFileReader> warning: Empty atom name.");
    return MolAtomPtr();
  }

  // read atom number field
  int atomid;
  readInt(16,20,&atomid);

  // read atom number field
  double xpos;
  readDouble(21,28,&xpos);

  // read atom number field
  double ypos;
  readDouble(29,36,&ypos);

  // read atom number field
  double zpos;
  readDouble(37,42,&zpos);

  int eleid = convFromAname(str_atmnm);

  // if (nresid<prev_resid && cchain<='Z')
  //  cchain ++;

  MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
  pAtom->setName(str_atmnm);
  pAtom->setElement(eleid);
  // pAtom->setChainName(LString(cchain));
  pAtom->setResIndex(nresid);
  pAtom->setResName(str_resnm);

  pAtom->setPos(Vector4D(xpos*10.0, ypos*10.0, zpos*10.0));

    /*
      LOG_DPRINTLN("GRO> append: %s/%d/%s/%d (%f,%f,%f) append atom...",
		   str_resnm.c_str(),
		   nresid,
		   str_atmnm.c_str(),
		   atomid,
		   xpos, ypos, zpos
		   );
    */

  return pAtom;
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


