// -*-Mode: C++;-*-
//
// QDF MolSurfObj File writer class
//
// $Id: QdfSurfWriter.cpp,v 1.1 2011/03/31 14:19:15 rishitani Exp $
//

#include <common.h>

#include "QdfSurfWriter.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

#include "MolSurfObj.hpp"

using namespace surface;

MC_DYNCLASS_IMPL(QdfSurfWriter, QdfSurfWriter, qlib::LSpecificClass<QdfSurfWriter>);

QdfSurfWriter::QdfSurfWriter()
{
}

QdfSurfWriter::~QdfSurfWriter()
{
}

void QdfSurfWriter::attach(qsys::ObjectPtr pMol)
{
  if (!canHandle(pMol)) {
    MB_THROW(qlib::InvalidCastException, "QdfSurfWriter");
    return;
  }
  super_t::attach(pMol);
}

const char * QdfSurfWriter::getTypeDescr() const
{
  return "CueMol molsurf file (*.qdf)";
}

const char * QdfSurfWriter::getFileExt() const
{
  return "*.qdf";
}

const char *QdfSurfWriter::getName() const
{
  return "qdfsurf";
}

bool QdfSurfWriter::canHandle(qsys::ObjectPtr pobj) const
{
  return (dynamic_cast<MolSurfObj *>(pobj.get())!=NULL);
}

/////////

// write surf to stream
bool QdfSurfWriter::write(qlib::OutStream &outs)
{
  MolSurfObj *pObj = obj();

  if (pObj==NULL) {
    LOG_DPRINTLN("QDFWriter> MolSurfObj is not attached !!");
    return false;
  }

  m_pObj = pObj;

  start(outs);

  getStream().writeFileType("SRF1");

  writeVertData();

  writeFaceData();

  end();

  m_pObj = NULL;
  return true;
}

void QdfSurfWriter::writeVertData()
{
  int nverts = m_pObj->getVertSize();

  defineData("vert", nverts);

  defineRecord("x", QDF_TYPE_FLOAT32);
  defineRecord("y", QDF_TYPE_FLOAT32);
  defineRecord("z", QDF_TYPE_FLOAT32);
  defineRecord("nx", QDF_TYPE_FLOAT32);
  defineRecord("ny", QDF_TYPE_FLOAT32);
  defineRecord("nz", QDF_TYPE_FLOAT32);
  defineRecord("id", QDF_TYPE_UTF8STR);
  
  startData();

  LString id;
  for (int ind=0; ind<nverts; ++ind) {
    const MSVert &v = m_pObj->getVertAt(ind);
    startRecord();
    setRecValFloat32("x", v.x);
    setRecValFloat32("y", v.y);
    setRecValFloat32("z", v.z);
    setRecValFloat32("nx", v.nx);
    setRecValFloat32("ny", v.ny);
    setRecValFloat32("nz", v.nz);
    setRecValStr("id", id);
    endRecord();
  }

  endData();
}

void QdfSurfWriter::writeFaceData()
{
  int nfaces = m_pObj->getFaceSize();
  defineData("face", nfaces);

  defineRecord("id1", QDF_TYPE_INT32);
  defineRecord("id2", QDF_TYPE_INT32);
  defineRecord("id3", QDF_TYPE_INT32);

  startData();

  for (int ind=0; ind<nfaces; ++ind) {
    const MSFace &v = m_pObj->getFaceAt(ind);
    startRecord();
    setRecValInt32("id1", v.id1);
    setRecValInt32("id2", v.id2);
    setRecValInt32("id3", v.id3);
    endRecord();
  }

  endData();
}

