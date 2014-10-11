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
  const int nx = getRecValInt32("nx");
  const int ny = getRecValInt32("ny");
  const int nz = getRecValInt32("nz");
  const int ntotal = nx*ny*nz;
  LOG_DPRINTLN("QdfPot> map size (%d,%d,%d)=%d", nx, ny, nz, ntotal);

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

  for (int ix=0; ix<nx; ix++) {
    for (int iy=0; iy<ny; iy++) {
      for (int iz=0; iz<nz; iz++) {
        startRecord();
        float rho = getRecValFloat32("val");
        endRecord();
        const int ii = ix + (iy + iz*ny)*nx;
        fbuf[ii] = (float)rho;
      }
    }
  }

  m_pObj->setMapFloatArray(fbuf, nx, ny, nz,
                           gx, gy, gz, orig);

}

