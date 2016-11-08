// -*-Mode: C++;-*-
//
// QDF surface obj file reader class
//
// $Id: QdfSurfReader.cpp,v 1.1 2011/03/31 14:19:15 rishitani Exp $

#include <common.h>

#include "QdfSurfReader.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

#include "MolSurfObj.hpp"

using namespace surface;

MC_DYNCLASS_IMPL(QdfSurfReader, QdfSurfReader, qlib::LSpecificClass<QdfSurfReader>);

QdfSurfReader::QdfSurfReader()
{
}

QdfSurfReader::~QdfSurfReader()
{
}

///////////////////////////////////////////

qsys::ObjectPtr QdfSurfReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new MolSurfObj());
}

/// get file-type description
const char *QdfSurfReader::getTypeDescr() const
{
  return "CueMol molsurf file (*.qdf)";
}

/// get file extension
const char *QdfSurfReader::getFileExt() const
{
  return "*.qdf";
}

/// get nickname for scripting
const char *QdfSurfReader::getName() const
{
  return "qdfsurf";
}

bool QdfSurfReader::read(qlib::InStream &ins)
{
  MolSurfObj *pObj = super_t::getTarget<MolSurfObj>();

  if (pObj==NULL) {
    LOG_DPRINTLN("QDFReader> MolSurfObj is not attached !!");
    return false;
  }

  m_pObj = pObj;

  start(ins);

  LString sft = getFileType();
  if (!sft.equals("SRF1")) {
    MB_THROW(qlib::FileFormatException, "QdfSurf invalid file format signature: "+sft);
    return false;
  }

  if (getStream().isIntByteSwap()) {
    readVertData();
    readFaceData();
  }
  else {
    readVertData2();
    readFaceData2();
  }
  
  end();

  m_pObj = NULL;
  return true;
}

void QdfSurfReader::readVertData()
{
  int nverts = readDataDef("vert");
  m_pObj->setVertSize(nverts);
  
  readRecordDef();

  MSVert v;
  for (int ind=0; ind<nverts; ++ind) {
    startRecord();
    v.x = getRecValFloat32("x");
    v.y = getRecValFloat32("y");
    v.z = getRecValFloat32("z");
    v.nx = getRecValFloat32("nx");
    v.ny = getRecValFloat32("ny");
    v.nz = getRecValFloat32("nz");
    getRecValStr("id");
    endRecord();
    m_pObj->setVertex(ind, v);
  }

}

void QdfSurfReader::readFaceData()
{
  int nfaces = readDataDef("face");
  m_pObj->setFaceSize(nfaces);
  
  readRecordDef();

  MSFace f;
  for (int ind=0; ind<nfaces; ++ind) {
    startRecord();
    f.id1 = getRecValInt32("id1");
    f.id2 = getRecValInt32("id2");
    f.id3 = getRecValInt32("id3");
    endRecord();
    m_pObj->setFace(ind, f);
  }

}

void QdfSurfReader::readVertData2()
{
  int nverts = readDataDef("vert");
  m_pObj->setVertSize(nverts);
  
  readRecordDef();

  MSVert *pv = m_pObj->getVertPtr();
  getStream().readFxRecords(nverts, pv, sizeof (MSVert)*nverts);

#if 0
  MSVert v;
  for (int ind=0; ind<nverts; ++ind) {
    getStream().readFxRecords(1, &v, sizeof (MSVert));
    /*
    startRecord();
    v.x = getRecValFloat32("x");
    v.y = getRecValFloat32("y");
    v.z = getRecValFloat32("z");
    v.nx = getRecValFloat32("nx");
    v.ny = getRecValFloat32("ny");
    v.nz = getRecValFloat32("nz");
    getRecValStr("id");*/
    endRecord();
    m_pObj->setVertex(ind, v);
  }
#endif
  
}


void QdfSurfReader::readFaceData2()
{
  int nfaces = readDataDef("face");
  m_pObj->setFaceSize(nfaces);
  
  readRecordDef();

  MSFace *pf = m_pObj->getFacePtr();
  getStream().readFxRecords(nfaces, pf, sizeof (MSFace)*nfaces);
  /*
  MSFace f;
  for (int ind=0; ind<nfaces; ++ind) {
    startRecord();
    f.id1 = getRecValInt32("id1");
    f.id2 = getRecValInt32("id2");
    f.id3 = getRecValInt32("id3");
    endRecord();
    m_pObj->setFace(ind, f);
  }
*/
}


