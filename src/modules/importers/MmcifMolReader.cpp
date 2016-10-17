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
  
  m_loopDefs.push_back( m_recbuf.substr(dotpos+1) );
}

void MmcifMolReader::readLoopDataItem()
{
  // MB_DPRINTLN("mmCIF> loop line : %s", m_recbuf.c_str());

  if (m_strCatName.equals("_atom_site"))
    readAtomLine();
}

void MmcifMolReader::readAtomLine()
{
  m_nReadAtoms++;
}

