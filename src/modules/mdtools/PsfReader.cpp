// -*-Mode: C++;-*-
//
// Xplor/CHARMM/NAMD PSF file reader
//

#include <common.h>

#include "PsfReader.hpp"
#include "Trajectory.hpp"
#include <qlib/LineStream.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/TopparManager.hpp>
#include <modules/molstr/ElemSym.hpp>
#include <modules/molstr/Selection.hpp>

using namespace mdtools;
using namespace molstr;

PsfReader::PsfReader()
{
}

PsfReader::~PsfReader()
{
}

///////////////////////////////////////////

/*void PsfReader::attach(MolCoordPtr pMol)
{
  m_pMol = pMol;
}*/


const char *PsfReader::getName() const
{
  return "psf";
}

const char *PsfReader::getTypeDescr() const
{
  return "CHARMM/NAMD topology (*.psf)";
}

const char *PsfReader::getFileExt() const
{
  return "*.psf";
}

qsys::ObjectPtr PsfReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW Trajectory);
}

///////////////////////////////////////////

ElemID convMassElem(double mass)
{
  if (qlib::isNear4(mass, 1.0080))
    return ElemSym::H;

  if (qlib::isNear4(mass, 12.0110))
    return ElemSym::C;
  if (qlib::isNear4(mass, 14.0070))
    return ElemSym::N;
  if (qlib::isNear4(mass, 15.9994))
    return ElemSym::O;
  if (qlib::isNear4(mass, 18.998))
    return ElemSym::F;

  if (qlib::isNear4(mass, 22.9898))
    return ElemSym::Na;
  if (qlib::isNear4(mass, 24.305))
    return ElemSym::Mg;

  if (qlib::isNear4(mass, 30.9740))
    return ElemSym::P;
  if (qlib::isNear4(mass, 32.0600))
    return ElemSym::S;
  if (qlib::isNear4(mass, 35.4500))
    return ElemSym::Cl;

  if (qlib::isNear4(mass, 39.102000))
    return ElemSym::K;
  if (qlib::isNear4(mass, 40.08))
    return ElemSym::Ca;
  if (qlib::isNear4(mass, 55.847))
    return ElemSym::Fe;
  if (qlib::isNear4(mass, 65.37))
    return ElemSym::Zn;

  return ElemSym::XX;
}

// read from stream
bool PsfReader::read(qlib::InStream &ins)
{
  int i, ires;
  qlib::LineStream ls(ins);
  m_pls = &ls;

  MolCoordPtr pMol(getTarget<MolCoord>());
  // TrajectoryPtr pMol(getTarget<Trajectory>());

  // skip header line
  readLine();
  readLine();

  ///////////////////
  // read REMARK header line
  readLine();
  removeComment();

  int ncomment;
  if (!m_line.toInt(&ncomment)) {
    MB_THROW(qlib::FileFormatException, "Cannot read ncomment line");
    return false;
  }
  MB_DPRINTLN("ncomment=%d", ncomment);
  
  for (i=0; i<ncomment; ++i) {
    readLine();
    m_line = m_line.trim("\r\n ");
    LOG_DPRINTLN("%s", m_line.c_str());
  }
  readLine();

  ///////////////////
  // read atoms
  readLine();
  removeComment();

  if (!m_line.toInt(&m_natom)) {
    MB_THROW(qlib::FileFormatException, "Cannot read natom line");
    return false;
  }
  MB_DPRINTLN("natoms=%d", m_natom);
  
  LString stmp;

  for (i=0; i<m_natom; ++i) {
    readLine();
    // LOG_DPRINTLN("%s", m_line.c_str());

    // chain name
    stmp = m_line.substr(9, 3);
    stmp = stmp.trim(" ");
    // stmp = stmp.toLowerCase();
    LString chain(stmp.c_str());

    // residue number
    stmp = m_line.substr(14, 4);
    int nresi;
    if (!stmp.toInt(&nresi)) {
      LString msg = LString::format("cannot convert resid number: %s", stmp.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }
    ResidIndex residx(nresi);

    //  residue name
    stmp = m_line.substr(19, 4);
    stmp = stmp.trim(" ");
    // stmp = stmp.toLowerCase();
    LString resn(stmp.c_str());

    // atom name
    stmp = m_line.substr(24, 4);
    stmp = stmp.trim(" ");
    // stmp = stmp.toLowerCase();
    LString name(stmp.c_str());
    
    // charge
    stmp = m_line.substr(34, 10);
    double charge;
    if (!stmp.toDouble(&charge)) {
      LString msg = LString::format("cannot convert charge %s", stmp.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }

    // mass
    stmp = m_line.substr(50, 8);
    double mass;
    if (!stmp.toDouble(&mass)) {
      LString msg = LString::format("cannot convert mass %s", stmp.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return false;
    }

    ElemID eleid = convMassElem(mass);

    //LOG_DPRINTLN("ATOM %s %s %d %s",
    //(*pAtoms)[i].name.c_str(),
    //(*pAtoms)[i].resn.c_str(),
    //(*pAtoms)[i].resid,
    //(*pAtoms)[i].chain.c_str());

    MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
    //pAtom->setParentUID(pMol->getUID());
    pAtom->setParent(pMol);
    pAtom->setName(name);
    pAtom->setElement(eleid);
    pAtom->setChainName(chain);
    pAtom->setResIndex(residx);
    pAtom->setResName(resn);
    
    if (pMol->appendAtom(pAtom)<0) {
      LString stmp = m_line;
      stmp = stmp.chomp();
      // stmp = stmp.toUpperCase();
      // m_nErrCount ++;
      // if (m_nErrCount<m_nErrMax)
      LOG_DPRINTLN("PsfReader> read ATOM line failed: %s", stmp.c_str());
    }
    
  }
  readLine();

  return true;
}

void PsfReader::readLine()
{
  if (m_pls!=NULL)
    m_line = m_pls->readLine();
}

void PsfReader::removeComment()
{
  int cpos = m_line.indexOf('!');
  if (cpos<0)
    return;
  else if (cpos<=1) {
    m_line = LString();
    return;
  }

  m_line = m_line.substr(0, cpos-1);
  return;
}

