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

  // MAP1: one bmap chunk; MAP2: the samples split into several bmap
  // chunks of whole sections (maps with more than 2^31 voxels)
  LString sft = getFileType();
  if (!sft.equals("MAP1") && !sft.equals("MAP2")) {
    MB_THROW(qlib::FileFormatException, "QdfDen invalid file format signature: "+sft);
    return false;
  }
  m_bSplit = sft.equals("MAP2");

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

  // map kind / origin (absent in chunks written before the cryo-EM mode:
  // those maps stay crystallographic with a zero origin)
  if (o.isDefined("mtype")) {
    const int mtype = o.readInt8("mtype");
    const qfloat32 ox = o.readFloat32("orgx");
    const qfloat32 oy = o.readFloat32("orgy");
    const qfloat32 oz = o.readFloat32("orgz");
    if (mtype==DensityMap::MAPTYPE_EM || mtype==DensityMap::MAPTYPE_XTAL)
      m_pObj->setDetectedMapType(mtype);
    m_pObj->setOrigin(qlib::Vector4D(ox, oy, oz));
  }

  // MAP2: chunking of the sample block
  int nchunk = 1;
  int nsecChunk = nz;
  if (m_bSplit) {
    if (!o.isDefined("nchk") || !o.isDefined("csec")) {
      MB_THROW(qlib::FileFormatException, "MAP2 header lacks the chunking fields");
      return;
    }
    nchunk = o.readInt32("nchk");
    nsecChunk = o.readInt32("csec");
    if (nchunk<1 || nsecChunk<1 ||
        (long long) nchunk * (long long) nsecChunk < (long long) nz) {
      MB_THROW(qlib::FileFormatException, "inconsistent MAP2 chunking");
      return;
    }
  }

  o.endRecord();

  m_pObj->setMapParams(stx, sty, stz, intx, inty, intz);

  const size_t nslice = size_t(nx)*size_t(ny);
  const size_t ntotal = nslice*size_t(nz);
  LOG_DPRINTLN("QdfDenMap> map size (%d,%d,%d)=%lld (%d chunk(s))",
               nx, ny, nz, (long long) ntotal, nchunk);

  ///////////////////

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

  for (int ic=0; ic<nchunk; ++ic) {
    const int k0 = ic*nsecChunk;
    const int k1 = qlib::min(nz, k0 + nsecChunk);
    const size_t nexpect = nslice*size_t(k1-k0);

    int ndata = readDataDef("bmap");
    if (ndata<0 || size_t(ndata)!=nexpect) {
      MB_THROW(qlib::FileFormatException, "inconsistent data (ndata!=nx*ny*nsec)");
      return;
    }
    o.readRecordDef();

    if (!o.isIntByteSwap())
      readDataArray2(k0, k1);
    else
      readDataArray(k0, k1);
  }

  m_pObj->endByteMap(rmin, rmax, rmean, rsig);
}

void QdfDenMapReader::readDataArray(int k0, int k1)
{
  QdfInStream &o = getStream();

  for (int iz=k0; iz<k1; iz++) {
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

void QdfDenMapReader::readDataArray2(int k0, int k1)
{
  QdfInStream &o = getStream();

  // one readFxRecords() per section keeps every read under the int range
  const size_t nslice = size_t(m_nx)*size_t(m_ny);
  for (int iz=k0; iz<k1; iz++)
    o.readFxRecords(int(nslice), m_pObj->sliceBytes(iz), int(nslice));
}


