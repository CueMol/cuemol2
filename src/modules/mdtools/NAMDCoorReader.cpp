// -*-Mode: C++;-*-
//
// NAMD coor file reader class
//

#include <common.h>

#include "NAMDCoorReader.hpp"

#include <cmath>
#include <cstring>

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

namespace {
constexpr qint32 SNIFF_MAX_NATOMS = 10000000;  // 1e7 atoms -- upper bound for realistic MD systems
constexpr qfloat64 SNIFF_COORD_MAX = 10000.0;  // Angstrom -- normal MD coords stay well within this range
}

/// Content sniff: NAMD coor begins with int32 natoms followed by
/// (natoms * 3) float64 xyz. There is no magic, so validate that
/// natoms is in a plausible range and that the first atom xyz are
/// IEEE-finite and within a sane magnitude. Try both native and
/// byte-swapped interpretations (the file's endian matches the
/// machine that wrote the paired PSF).
int NAMDCoorReader::canHandleContent(qlib::InStream &ins) const
{
  constexpr int HEADER_SIZE = 4 + 3 * 8;  // int32 natoms + 3 * float64 xyz
  char buf[HEADER_SIZE];
  int total = 0;
  while (total < HEADER_SIZE) {
    int n = ins.read(buf, total, HEADER_SIZE - total);
    if (n <= 0) break;
    total += n;
  }
  if (total < HEADER_SIZE) return CONTENT_UNKNOWN;

  auto plausible = [](qint32 natoms, qfloat64 x, qfloat64 y, qfloat64 z) -> bool {
    if (natoms < 1 || natoms > SNIFF_MAX_NATOMS) return false;
    if (!std::isfinite(x) || !std::isfinite(y) || !std::isfinite(z)) return false;
    if (std::abs(x) > SNIFF_COORD_MAX) return false;
    if (std::abs(y) > SNIFF_COORD_MAX) return false;
    if (std::abs(z) > SNIFF_COORD_MAX) return false;
    return true;
  };

  qint32 natoms;
  qfloat64 x, y, z;
  std::memcpy(&natoms, buf + 0,  sizeof(qint32));
  std::memcpy(&x,      buf + 4,  sizeof(qfloat64));
  std::memcpy(&y,      buf + 12, sizeof(qfloat64));
  std::memcpy(&z,      buf + 20, sizeof(qfloat64));
  if (plausible(natoms, x, y, z)) return CONTENT_YES;

  qlib::LByteSwapper<qint32>::swap(natoms);
  qlib::LByteSwapper<qfloat64>::swap(x);
  qlib::LByteSwapper<qfloat64>::swap(y);
  qlib::LByteSwapper<qfloat64>::swap(z);
  if (plausible(natoms, x, y, z)) return CONTENT_YES;

  return CONTENT_UNKNOWN;
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
    qint32 natoms_sw = natoms;
    qlib::LByteSwapper<qint32>::swap(natoms_sw);

    if (m_pMol->getAtomSize()!=natoms_sw) {
      LString msg = LString::format("psf(%d) coor(%d or %d) natoms mismatch",
                                    m_pMol->getAtomSize(), natoms, natoms_sw);
      MB_THROW(qlib::FileFormatException, msg);
      return;
    }

    natoms = natoms_sw;
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

