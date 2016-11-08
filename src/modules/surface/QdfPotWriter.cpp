// -*-Mode: C++;-*-
//
// QDF ElePotMap File writer class
//
// $Id: QdfPotWriter.cpp,v 1.1 2011/04/03 08:08:46 rishitani Exp $
//

#include <common.h>

#include "QdfPotWriter.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

#include "ElePotMap.hpp"

using namespace surface;

MC_DYNCLASS_IMPL(QdfPotWriter, QdfPotWriter, qlib::LSpecificClass<QdfPotWriter>);

QdfPotWriter::QdfPotWriter()
{
}

QdfPotWriter::~QdfPotWriter()
{
}

void QdfPotWriter::attach(qsys::ObjectPtr pObj)
{
  if (!canHandle(pObj)) {
    MB_THROW(qlib::InvalidCastException, "QdfPotWriter");
    return;
  }
  super_t::attach(pObj);
}

const char * QdfPotWriter::getTypeDescr() const
{
  return "CueMol elepot file (*.qdf)";
}

const char * QdfPotWriter::getFileExt() const
{
  return "*.qdf";
}

const char *QdfPotWriter::getName() const
{
  return "qdfpot";
}

bool QdfPotWriter::canHandle(qsys::ObjectPtr pobj) const
{
  return (dynamic_cast<ElePotMap *>(pobj.get())!=NULL);
}

/////////

// write surf to stream
bool QdfPotWriter::write(qlib::OutStream &outs)
{
  ElePotMap *pObj = super_t::getTarget<ElePotMap>();

  if (pObj==NULL) {
    LOG_DPRINTLN("QDFWriter> ElePotMap is not attached !!");
    return false;
  }

  m_pObj = pObj;

  start(outs);

  getStream().setFileType("POT1");

  writeData();

  end();

  m_pObj = NULL;
  return true;
}

void QdfPotWriter::writeData()
{
  const int nx = m_pObj->getColNo();
  const int ny = m_pObj->getRowNo();
  const int nz = m_pObj->getSecNo();
  const double gx = m_pObj->getColGridSize();
  const double gy = m_pObj->getRowGridSize();
  const double gz = m_pObj->getSecGridSize();
  const Vector4D orig = m_pObj->getOrigin();

  defineData("hdr", 1);

  defineRecord("nx", QDF_TYPE_INT32);
  defineRecord("ny", QDF_TYPE_INT32);
  defineRecord("nz", QDF_TYPE_INT32);

  defineRecord("gx", QDF_TYPE_FLOAT32);
  defineRecord("gy", QDF_TYPE_FLOAT32);
  defineRecord("gz", QDF_TYPE_FLOAT32);

  defineRecord("ox", QDF_TYPE_FLOAT32);
  defineRecord("oy", QDF_TYPE_FLOAT32);
  defineRecord("oz", QDF_TYPE_FLOAT32);
  
  defineRecord("prec", QDF_TYPE_INT8);

  startData();
  startRecord();

  setRecValInt32("nx", nx);
  setRecValInt32("ny", ny);
  setRecValInt32("nz", nz);

  setRecValFloat32("gx", float(gx));
  setRecValFloat32("gy", float(gy));
  setRecValFloat32("gz", float(gz));
  
  setRecValFloat32("ox", float(orig.x()));
  setRecValFloat32("oy", float(orig.y()));
  setRecValFloat32("oz", float(orig.z()));

  // single precision (float) data
  setRecValInt8("prec", 1);

  endRecord();
  endData();

  /////////////////////

  const int ntotal = nx*ny*nz;

  defineData("data", ntotal);
  defineRecord("val", QDF_TYPE_FLOAT32);

  startData();
  for (int ix=0; ix<nx; ix++) {
    for (int iy=0; iy<ny; iy++) {
      for (int iz=0; iz<nz; iz++) {
        double rho = m_pObj->atFloat(ix, iy, iz);
        startRecord();
        setRecValFloat32("val", float(rho));
        endRecord();
      }
    }
  }
  endData();
}


