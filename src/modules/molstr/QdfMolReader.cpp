// -*-Mode: C++;-*-
//
// QdfMol Reader (PDB format version)
//

#include <common.h>

#include "QdfMolReader.hpp"

using namespace molstr;

QdfMolReader::QdfMolReader()
     : super_t()
{
  m_bBuild2ndry = false;
}

QdfMolReader::~QdfMolReader()
{
  MB_DPRINTLN("QdfMolReader destructed (%p)", this);
}

/////////////

const char *QdfMolReader::getName() const
{
  return "qdfpdb";
}

const char *QdfMolReader::getTypeDescr() const
{
  return "QDF-PDB (*.qdfpdb)";
}

const char *QdfMolReader::getFileExt() const
{
  return "*.qdfpdb";
}

qsys::ObjectPtr QdfMolReader::createDefaultObj() const
{
  return super_t::createDefaultObj();
}

/////////

// read PDB file from stream
bool QdfMolReader::read(qlib::InStream &ins)
{
  return super_t::read(ins);
}

