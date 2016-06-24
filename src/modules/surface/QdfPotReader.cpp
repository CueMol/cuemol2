// -*-Mode: C++;-*-
//
// QDF ElePotMap obj file reader class
//
// $Id: QdfPotReader.cpp,v 1.1 2011/04/03 08:08:46 rishitani Exp $

#include <common.h>

#include "QdfPotReader.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

#include "ElePotMap.hpp"

using namespace surface;

MC_DYNCLASS_IMPL(QdfPotReader, QdfPotReader, qlib::LSpecificClass<QdfPotReader>);

QdfPotReader::QdfPotReader()
{
}

QdfPotReader::~QdfPotReader()
{
}

///////////////////////////////////////////

qsys::ObjectPtr QdfPotReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new ElePotMap());
}

/// get file-type description
const char *QdfPotReader::getTypeDescr() const
{
  return "CueMol elepot file (*.qdf)";
}

/// get file extension
const char *QdfPotReader::getFileExt() const
{
  return "*.qdf";
}

/// get nickname for scripting
const char *QdfPotReader::getName() const
{
  return "qdfpot";
}

bool QdfPotReader::read(qlib::InStream &ins)
{
  ElePotMap *pObj = super_t::getTarget<ElePotMap>();

  if (pObj==NULL) {
    LOG_DPRINTLN("QDFReader> ElePotMap is not attached !!");
    return false;
  }

  m_pObj = pObj;

  start(ins);

  if (!getFileType().equals("POT1")) {
    MB_THROW(qlib::FileFormatException, "invalid file format signature");
    return false;
  }

  readData();

  end();

  m_pObj = NULL;
  return true;
}

void QdfPotReader::readData()
{
  int nhdr = readDataDef("hdr");
  if (nhdr!=1) {
    MB_THROW(qlib::FileFormatException, "header length must be 1");
    return;
  }

  readRecordDef();

  startRecord();
  m_nx = getRecValInt32("nx");
  m_ny = getRecValInt32("ny");
  m_nz = getRecValInt32("nz");
  const int ntotal = m_nx*m_ny*m_nz;
  LOG_DPRINTLN("QdfPot> map size (%d,%d,%d)=%d", m_nx, m_ny, m_nz, ntotal);

  const double gx = getRecValFloat32("gx");
  const double gy = getRecValFloat32("gy");
  const double gz = getRecValFloat32("gz");
  LOG_DPRINTLN("QdfPot> grid size (%f,%f,%f)", gx, gy, gz);

  qlib::Vector4D orig;
  orig.x() = getRecValFloat32("ox");
  orig.y() = getRecValFloat32("oy");
  orig.z() = getRecValFloat32("oz");
  LOG_DPRINTLN("QdfPot> grid origine (%f,%f,%f)", orig.x(), orig.y(), orig.z());

  const int nprec = getRecValInt8("prec");
  if (nprec!=1) {
    MB_THROW(qlib::FileFormatException, "unsupported map data precision");
    return;
  }

  endRecord();

  ///////////////////

  int ndata = readDataDef("data");
  if (ndata!=ntotal) {
    MB_THROW(qlib::FileFormatException, "inconsistent data (ndata!=nx*ny*nz)");
    return;
  }
  
  //
  //  allocate memory
  //
  float *fbuf = MB_NEW float[ntotal];
  LOG_DPRINTLN("QdfPot> memory allocation %f Mbytes", double(ntotal*4.0)/(1024.0*1024.0));
  if (fbuf==NULL) {
    MB_THROW(qlib::OutOfMemoryException, "cannot allocate memory");
    return;
  }

  readRecordDef();

  readDataArray(fbuf);

  m_pObj->setMapFloatArray(fbuf, m_nx, m_ny, m_nz,
                           gx, gy, gz, orig);

}

void QdfPotReader::readDataArray(float *fbuf)
{
  for (int ix=0; ix<m_nx; ix++) {
    for (int iy=0; iy<m_ny; iy++) {
      for (int iz=0; iz<m_nz; iz++) {
        startRecord();
        float rho = getRecValFloat32("val");
        endRecord();
        const int ii = ix + (iy + iz*m_ny)*m_nx;
        fbuf[ii] = (float)rho;
      }
    }
  }

}

/*void readDataArray2()
{
}*/

