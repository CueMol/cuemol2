// -*-Mode: C++;-*-
//
// NAMD coor file reader class
//

#include <common.h>

#include "NAMDCoorReader.hpp"

#include <qlib/BinStream.hpp>
#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/TopparManager.hpp>

#include "PsfReader.hpp"

using namespace mdtools;
using namespace molstr;

NAMDCoorReader::NAMDCoorReader()
{
}

NAMDCoorReader::~NAMDCoorReader()
{
  MB_DPRINTLN("NAMDCoorReader destructed (%p)", this);
}

/////////////

const char *NAMDCoorReader::getName() const
{
  return "namdcoor";
}

const char *NAMDCoorReader::getTypeDescr() const
{
  return "NAMD Coordinates (*.coor)";
}

const char *NAMDCoorReader::getFileExt() const
{
  return "*.coor";
}

qsys::ObjectPtr NAMDCoorReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW MolCoord());
}

/////////

// read PDB file from stream
bool NAMDCoorReader::read(qlib::InStream &ins)
{
  // get the target
  m_pMol = MolCoordPtr(getTarget<MolCoord>());

  try {
    // load substream (mol topology)
    loadTopology();

    // load main stream (mol coord)
    loadCoord(ins);

    m_pMol->applyTopology();

    //if (m_bBuild2ndry) {
    m_pMol->calcProt2ndry();
    //}
  }
  catch (...) {
    // Clean-up the workspace
    m_pMol = MolCoordPtr();
    throw;
  }

  // Clean-up the workspace
  m_pMol = MolCoordPtr();

  return true;
}

void NAMDCoorReader::loadTopology()
{
  qlib::InStream *pSubIn = createInStream("topo");
  qlib::ensureNotNull(pSubIn);

  PsfReader psf;
  psf.attach(m_pMol);
  psf.read(*pSubIn);

}

void NAMDCoorReader::loadCoord(qlib::InStream &ins)
{
  qlib::BinInStream bins(ins);

  qint32 natoms = bins.tread<qint32>();

  if (m_pMol->getAtomSize()!=natoms) {
    qint32 natosm_sw = natoms;
    qlib::LByteSwapper<qint32>::swap(natosm_sw);

    if (m_pMol->getAtomSize()!=natosm_sw) {
      LString msg = LString::format("psf(%d) coor(%d or %d) natoms mismatch",
                                    m_pMol->getAtomSize(), natoms, natoms_sw);
      MB_THROW(qlib::FileFormatException, msg);
      return;
    }

    natoms = natosm_sw;
    LOG_DPRINTLN("NAMDCoor> Input is byte-swapped!!");
    bins.setSwapMode(qlib::BinInStream::MODE_SWAP);
  }

  qlib::Vector4D pos;
  double dbuf;
  for (int i=0; i<natoms; ++i) {
    MolAtomPtr pAtom = m_pMol->getAtom(i);
    qlib::ensureNotNull(pAtom);
    pos.x() = bins.tread<qfloat64>();
    pos.y() = bins.tread<qfloat64>();
    pos.z() = bins.tread<qfloat64>();
    pAtom->setPos(pos);
  }
}

