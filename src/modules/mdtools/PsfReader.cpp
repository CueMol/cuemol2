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

using namespace mdtools;
using namespace molstr;

PsfReader::PsfReader()
{

}

PsfReader::~PsfReader()
{
  MB_DPRINTLN("PsfReader destructed.");
}

///////////////////////////////////////////

/*
void PsfReader::attach(MolCoordPtr pMol)
{
  m_pMol = pMol;
}
*/

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

inline bool isNearMass(double x, double y)
{
  const double dtol = 0.1;
  
  //if (qlib::isNear4( ::floor(x+0.5), ::floor(y+0.5) ))
  if (y-dtol < x && x < y+dtol)
    return true;
  else
    return false;
}

ElemID convMassElem(double mass)
{
  if (isNearMass(mass, 1.0080))
    return ElemSym::H;

  if (isNearMass(mass, 12.0110))
    return ElemSym::C;
  if (isNearMass(mass, 14.0070))
    return ElemSym::N;
  if (isNearMass(mass, 15.9994))
    return ElemSym::O;
  if (isNearMass(mass, 18.998))
    return ElemSym::F;

  if (isNearMass(mass, 22.9898))
    return ElemSym::Na;
  if (isNearMass(mass, 24.305))
    return ElemSym::Mg;

  if (isNearMass(mass, 30.9740))
    return ElemSym::P;
  if (isNearMass(mass, 32.0600))
    return ElemSym::S;
  if (isNearMass(mass, 35.4500))
    return ElemSym::Cl;

  if (isNearMass(mass, 39.102000))
    return ElemSym::K;
  if (isNearMass(mass, 40.08))
    return ElemSym::Ca;
  if (isNearMass(mass, 55.847))
    return ElemSym::Fe;
  if (isNearMass(mass, 65.37))
    return ElemSym::Zn;

  return ElemSym::XX;
}

// read from stream
bool PsfReader::read(qlib::InStream &ins)
{
  if (m_pReadSel.isnull())
    readAll(ins);
  else
    readSel(ins);

  return true;
}

void PsfReader::readRemarkHeader()
{
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
    return;
  }
  MB_DPRINTLN("ncomment=%d", ncomment);
  
  for (int i=0; i<ncomment; ++i) {
    readLine();
    m_line = m_line.trim("\r\n ");
    LOG_DPRINTLN("PSF> %s", m_line.c_str());
  }
  readLine();
}

void PsfReader::readNATOM()
{
  // Read NATOM
  readLine();
  removeComment();

  if (!m_line.toInt(&m_natom)) {
    MB_THROW(qlib::FileFormatException, "Cannot read natom line");
    return;
  }
  LOG_DPRINTLN("PSF> natoms=%d", m_natom);
}

MolAtomPtr PsfReader::readAtom()
{
  LString stmp;
  quint32 iatom;

  readLine();
  // LOG_DPRINTLN("%s", m_line.c_str());

  stmp = m_line.substr(0, 8);
  stmp = stmp.trim(" ");
  if (!stmp.toNum<quint32>(&iatom)) {
    LString msg = LString::format("cannot convert atom number: %s", stmp.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return MolAtomPtr();
  }

  // chain name
  stmp = m_line.substr(9, 4);
  stmp = stmp.trim(" ");
  // stmp = stmp.toLowerCase();
  LString chain(stmp.c_str());

  // residue number
  stmp = m_line.substr(14, 4);
  int nresi;
  if (!stmp.toInt(&nresi)) {
    LString msg = LString::format("cannot convert resid number: %s", stmp.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return MolAtomPtr();
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
    return MolAtomPtr();
  }

  // mass
  stmp = m_line.substr(50, 8);
  double mass;
  if (!stmp.toDouble(&mass)) {
    LString msg = LString::format("cannot convert mass <%s>", stmp.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return MolAtomPtr();
  }

  ElemID eleid = convMassElem(mass);

  //LOG_DPRINTLN("ATOM %s %s %d %s",
  //(*pAtoms)[i].name.c_str(),
  //(*pAtoms)[i].resn.c_str(),
  //(*pAtoms)[i].resid,
  //(*pAtoms)[i].chain.c_str());

  MolAtomPtr pAtom(MB_NEW MolAtom());

  pAtom->setName(name);
  pAtom->setElement(eleid);
  pAtom->setChainName(chain);
  pAtom->setResIndex(residx);
  pAtom->setResName(resn);

  return pAtom;
}

void PsfReader::readAll(qlib::InStream &ins)
{
  LOG_DPRINTLN("PSF> Read all coord");
  int i, ires;
  qlib::LineStream ls(ins);
  m_pls = &ls;

  TrajectoryPtr pTraj(getTarget<Trajectory>());

  readRemarkHeader();

  readNATOM();
  
  ///////////////////

  // Read atoms
  for (i=0; i<m_natom; ++i) {
    MolAtomPtr pAtom = readAtom();
    
    int aid = pTraj->appendAtom(pAtom);
    if (aid<0) {
      LString stmp = m_line;
      stmp = stmp.chomp();
      // stmp = stmp.toUpperCase();
      // m_nErrCount ++;
      // if (m_nErrCount<m_nErrMax)
      LOG_DPRINTLN("PsfReader> read ATOM line failed: %s", stmp.c_str());
    }
  }

  readLine();

  //  if (!pTraj.isnull()) {
  //pTraj->createMol(m_pReadSel);
  //}

  pTraj->applyTopology(false);
  pTraj->setup();
}

void PsfReader::readSel(qlib::InStream &ins)
{
  LOG_DPRINTLN("PSF> Read selected (%s) coord", m_pReadSel->toString().c_str());

  int i, j, ires;
  qlib::LineStream ls(ins);
  m_pls = &ls;

  TrajectoryPtr pTraj(getTarget<Trajectory>());

  readRemarkHeader();

  readNATOM();
  
  ///////////////////

  MolCoordPtr pAllMol = MolCoordPtr(MB_NEW MolCoord());
  pAllMol->setSceneID(pTraj->getSceneID());

  // Read atoms
  for (i=0; i<m_natom; ++i) {
    MolAtomPtr pAtom = readAtom();
    
    int aid = pAllMol->appendAtom(pAtom);
    if (aid<0) {
      LString stmp = m_line;
      stmp = stmp.chomp();
      // stmp = stmp.toUpperCase();
      // m_nErrCount ++;
      // if (m_nErrCount<m_nErrMax)
      LOG_DPRINTLN("PsfReader> read ATOM line failed: %s", stmp.c_str());
    }
  }

  readLine();

  //////////

  pAllMol->applyTopology(false);
  
  std::deque<int> aidmap;
  MolCoord::AtomIter aiter = pAllMol->beginAtom();
  MolCoord::AtomIter eiter = pAllMol->endAtom();

  i=0;
  j=0;
  for (; aiter!=eiter; ++aiter, ++i) {
    MolAtomPtr pAtom = aiter->second;
    int aid = aiter->first;
    MB_ASSERT(aid==i);
    
    if (m_pReadSel->isSelected(pAtom)) {
      // add the copy of the original atom
      MolAtomPtr pNewAtom(static_cast<MolAtom *>(pAtom->clone()));
      int aid2 = pTraj->appendAtom(pNewAtom);
      MB_ASSERT(aid2==j);
      aidmap.push_back(aid);
      ++j;
    }
  }
  
  // m_pReadSel = pSel;

  pTraj->setupSel(pAllMol->getAtomSize(), aidmap);
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

