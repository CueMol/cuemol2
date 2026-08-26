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

  LString sft = getFileType();
  if (!sft.equals("MAP1")) {
    MB_THROW(qlib::FileFormatException, "QdfDen invalid file format signature: "+sft);
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

  const size_t ntotal = size_t(nx)*size_t(ny)*size_t(nz);
  LOG_DPRINTLN("QdfDenMap> map size (%d,%d,%d)=%lld", nx, ny, nz, (long long) ntotal);

  ///////////////////

  int ndata = readDataDef("bmap");
  if (ndata<0 || size_t(ndata)!=ntotal) {
    MB_THROW(qlib::FileFormatException, "inconsistent data (ndata!=nx*ny*nz)");
    return;
  }

  // The samples are read section by section straight into the map
  // storage (no whole-map temporary buffer). Same quantization as the
  // historical setMapByteArray() path.
  DensityMap::MapQuant q;
  q.base = rmin;
  q.step = (double(rmax) - double(rmin))/256.0;
  m_pObj->beginByteMap(nx, ny, nz, q);

  m_nx = nx;
  m_ny = ny;
  m_nz = nz;
  if (!o.isIntByteSwap())
    readDataArray2();
  else
    readDataArray();

  m_pObj->endByteMap(rmin, rmax, rmean, rsig);
}

void QdfDenMapReader::readDataArray()
{
  QdfInStream &o = getStream();
  o.readRecordDef();

  for (int iz=0; iz<m_nz; iz++) {
    qbyte *pslice = m_pObj->sliceBytes(iz);
    for (int iy=0; iy<m_ny; iy++) {
      qbyte *prow = pslice + size_t(iy)*size_t(m_nx);
      for (int ix=0; ix<m_nx; ix++) {
        startRecord();
        prow[ix] = qbyte(o.readInt8("v"));
        endRecord();
      }
    }
  }
}

void QdfDenMapReader::readDataArray2()
{
  QdfInStream &o = getStream();
  o.readRecordDef();

  // one readFxRecords() per section keeps every read under the int range
  const size_t nslice = size_t(m_nx)*size_t(m_ny);
  for (int iz=0; iz<m_nz; iz++)
    o.readFxRecords(int(nslice), m_pObj->sliceBytes(iz), int(nslice));
}


