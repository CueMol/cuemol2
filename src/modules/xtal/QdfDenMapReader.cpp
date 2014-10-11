// -*-Mode: C++;-*-
//
// QDF DensityMap File reader class
//

#include <common.h>

#include "QdfDenMapReader.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

#include "DensityMap.hpp"

using namespace xtal;
using qsys::QdfInStream;

MC_DYNCLASS_IMPL(QdfDenMapReader, QdfDenMapReader, qlib::LSpecificClass<QdfDenMapReader>);

QdfDenMapReader::QdfDenMapReader()
{
}

QdfDenMapReader::~QdfDenMapReader()
{
}

///////////////////////////////////////////

qsys::ObjectPtr QdfDenMapReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new DensityMap());
}

/// get file-type description
const char *QdfDenMapReader::getTypeDescr() const
{
  return "CueMol density map file (*.qdf)";
}

/// get file extension
const char *QdfDenMapReader::getFileExt() const
{
  return "*.qdf";
}

/// get nickname for scripting
const char *QdfDenMapReader::getName() const
{
  return "qdfmap";
}

bool QdfDenMapReader::read(qlib::InStream &ins)
{
  DensityMap *pObj = super_t::getTarget<DensityMap>();

  if (pObj==NULL) {
    LOG_DPRINTLN("QDFReader> DensityMap is not attached !!");
    return false;
  }

  m_pObj = pObj;

  start(ins);

  if (!getFileType().equals("MAP1")) {
    MB_THROW(qlib::FileFormatException, "invalid file format signature");
    return false;
  }

  readData();

  end();

  m_pObj = NULL;
  return true;
}

void QdfDenMapReader::readData()
{
  QdfInStream &o = getStream();

  int nhdr = o.readDataDef("xtal");
  if (nhdr!=1) {
    MB_THROW(qlib::FileFormatException, "header length must be 1");
    return;
  }

  o.readRecordDef();
  {
    o.startRecord();
    qfloat32 ca = o.readFloat32("a");
    qfloat32 cb = o.readFloat32("b");
    qfloat32 cc = o.readFloat32("c");
    qfloat32 alp = o.readFloat32("alp");
    qfloat32 bet = o.readFloat32("bet");
    qfloat32 gam = o.readFloat32("gam");
    int nsg = o.readInt32("sg");
    o.endRecord();

    m_pObj->setXtalParams(ca, cb, cc, alp, bet, gam, nsg);
  }
  
  //////////

  nhdr = readDataDef("hdr");
  if (nhdr!=1) {
    MB_THROW(qlib::FileFormatException, "header length must be 1");
    return;
  }

  o.readRecordDef();
  o.startRecord();
  int nmode = o.readInt8("mode");
  if (nmode!=1) {
    MB_THROW(qlib::FileFormatException, "unsupported map mode");
    return;
  }
  
  int nx = o.readInt32("nx");
  int ny = o.readInt32("ny");
  int nz = o.readInt32("nz");
  
  int stx = o.readInt32("stax");
  int sty = o.readInt32("stay");
  int stz = o.readInt32("staz");
  
  int intx = o.readInt32("intx");
  int inty = o.readInt32("inty");
  int intz = o.readInt32("intz");

  qfloat32 rmin = o.readFloat32("rmin");
  qfloat32 rmax = o.readFloat32("rmax");
  qfloat32 rmean = o.readFloat32("rmea");
  qfloat32 rsig = o.readFloat32("rsig");

  o.endRecord();

  m_pObj->setMapParams(stx, sty, stz, intx, inty, intz);

  const int ntotal = nx*ny*nz;
  LOG_DPRINTLN("QdfDenMap> map size (%d,%d,%d)=%d", nx, ny, nz, ntotal);

  ///////////////////

  int ndata = readDataDef("bmap");
  if (ndata!=ntotal) {
    MB_THROW(qlib::FileFormatException, "inconsistent data (ndata!=nx*ny*nz)");
    return;
  }
  
  //  allocate memory
  qbyte *fbuf = MB_NEW qbyte[ntotal];
  LOG_DPRINTLN("QdfDenMap> memory allocation %f Mbytes", double(ntotal*4.0)/(1024.0*1024.0));
  if (fbuf==NULL) {
    MB_THROW(qlib::OutOfMemoryException, "cannot allocate memory");
    return;
  }

  o.readRecordDef();

  for (int iz=0; iz<nz; iz++) {
    for (int iy=0; iy<ny; iy++) {
      for (int ix=0; ix<nx; ix++) {
        startRecord();
        qbyte rho = qbyte(o.readInt8("v"));
        endRecord();
        const int ii = ix + (iy + iz*ny)*nx;
        fbuf[ii] = rho;
      }
    }
  }

  m_pObj->setMapByteArray(fbuf, nx, ny, nz,
                          rmin, rmax, rmean, rsig);
  
}

