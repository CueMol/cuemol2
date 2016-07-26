// -*-Mode: C++;-*-
//
// QdfMol Reader (PDB format version)
//

#include <common.h>

#include "QdfPdbReader.hpp"

using namespace molstr;

QdfPdbReader::QdfPdbReader()
     : super_t()
{
  m_bBuild2ndry = false;
}

QdfPdbReader::~QdfPdbReader()
{
  MB_DPRINTLN("QdfPdbReader destructed (%p)", this);
}

/////////////

const char *QdfPdbReader::getName() const
{
  return "qdfpdb";
}

const char *QdfPdbReader::getTypeDescr() const
{
  return "QDF-PDB (*.qdfpdb)";
}

const char *QdfPdbReader::getFileExt() const
{
  return "*.qdfpdb";
}

qsys::ObjectPtr QdfPdbReader::createDefaultObj() const
{
  return super_t::createDefaultObj();
}

/////////

// read PDB file from stream
bool QdfPdbReader::read(qlib::InStream &ins)
{
  return super_t::read(ins);
}

