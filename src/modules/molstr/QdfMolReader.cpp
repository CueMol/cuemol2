// -*-Mode: C++;-*-
//
// QdfMol Reader (PDB format version)
//

#include <common.h>

#include "QdfMolReader.hpp"
#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>
#include "MolCoord.hpp"

using namespace molstr;

MC_DYNCLASS_IMPL(QdfMolReader, QdfMolReader, qlib::LSpecificClass<QdfMolReader>);

QdfMolReader::QdfMolReader()
     : super_t()
{
}

QdfMolReader::~QdfMolReader()
{
  MB_DPRINTLN("QdfMolReader destructed (%p)", this);
}

/////////////

const char *QdfMolReader::getTypeDescr() const
{
  return "CueMol data file (*.qdf)";
}

const char *QdfMolReader::getFileExt() const
{
  return "*.qdf";
}

const char *QdfMolReader::getName() const
{
  return "qdfmol";
}

qsys::ObjectPtr QdfMolReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW MolCoord());
}

/////////

// read PDB file from stream
bool QdfMolReader::read(qlib::InStream &ins)
{
  MolCoord *pObj = super_t::getTarget<MolCoord>();

  if (pObj==NULL) {
    LOG_DPRINTLN("QDFReader> MolCoord is not attached !!");
    return false;
  }

  m_pMol = pObj;

  start(ins);

  if (!getFileType().equals("MOL2")) {
    MB_THROW(qlib::FileFormatException, "invalid file format signature");
    return false;
  }

  // TO DO: read mol-level properties (cell params, etc)
  
  readChainData();

  readResidData();

  readAtomData();

  readBondData();
  
  end();

  m_pMol = NULL;
  return true;
}

void QdfMolReader::readChainData()
{
  qsys::QdfInStream &in = getStream();
  int nchains = in.readDataDef("chai");
  in.readRecordDef();

  for (int i=0; i<nchains; ++i) {
    in.startRecord();
    quint32 id = in.readUInt32("id");
    LString chname = in.readStr("name");

    in.endRecord();
  }
}

void QdfMolReader::readResidData()
{
}

void QdfMolReader::readAtomData()
{
}

void QdfMolReader::readBondData()
{
}

