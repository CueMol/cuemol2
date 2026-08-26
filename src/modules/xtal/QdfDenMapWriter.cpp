// -*-Mode: C++;-*-
//
// QDF DensityMap File writer class
//

#include <common.h>

#include "QdfDenMapWriter.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

#include "DensityMap.hpp"

using namespace xtal;
using qsys::QdfOutStream;

MC_DYNCLASS_IMPL(QdfDenMapWriter, QdfDenMapWriter, qlib::LSpecificClass<QdfDenMapWriter>);

QdfDenMapWriter::QdfDenMapWriter()
     : m_pObj(NULL), m_nChunkLimit(size_t(0x7fffffff)),
       m_bSplit(false), m_nSecChunk(0), m_nChunks(0)
{
}

QdfDenMapWriter::~QdfDenMapWriter()
{
}

void QdfDenMapWriter::attach(qsys::ObjectPtr pObj)
{
  if (!canHandle(pObj)) {
    MB_THROW(qlib::InvalidCastException, "QdfDenMapWriter");
    return;
  }
  super_t::attach(pObj);
}

const char * QdfDenMapWriter::getTypeDescr() const
{
  return "CueMol density map file (*.qdf)";
}

const char * QdfDenMapWriter::getFileExt() const
{
  return "*.qdf";
}

const char *QdfDenMapWriter::getName() const
{
  return "qdfmap";
}

bool QdfDenMapWriter::canHandle(qsys::ObjectPtr pobj) const
{
  return (dynamic_cast<DensityMap *>(pobj.get())!=NULL);
}

/////////

// write surf to stream
bool QdfDenMapWriter::write(qlib::OutStream &outs)
{
  DensityMap *pObj = super_t::getTarget<DensityMap>();

  if (pObj==NULL) {
    LOG_DPRINTLN("QDFWriter> DensityMap is not attached !!");
    return false;
  }

  m_pObj = pObj;

  // Chunking of the sample block: the QDF data-record count is a 32-bit
  // int, so a map with more voxels than one chunk holds is written as
  // MAP2, with the samples split into consecutive "bmap" chunks of whole
  // sections (older readers reject the MAP2 signature explicitly).
  const size_t nslice = size_t(pObj->getColNo())*size_t(pObj->getRowNo());
  const int nz = pObj->getSecNo();
  const size_t ntotal = nslice*size_t(nz);
  if (nslice > m_nChunkLimit) {
    m_pObj = NULL;
    MB_THROW(qlib::FileFormatException,
             "QdfDenMapWriter: a map section exceeds the QDF chunk record limit");
    return false;
  }
  m_bSplit = (ntotal > m_nChunkLimit);
  m_nSecChunk = nz;
  if (m_bSplit && nslice>0)
    m_nSecChunk = int(qlib::min(size_t(nz), m_nChunkLimit/nslice));
  if (m_nSecChunk<1)
    m_nSecChunk = 1;
  m_nChunks = (nz<=0) ? 1 : (nz + m_nSecChunk - 1)/m_nSecChunk;

  start(outs);

  getStream().writeFileType(m_bSplit ? "MAP2" : "MAP1");

  writeData();

  end();

  m_pObj = NULL;
  return true;
}

void QdfDenMapWriter::writeData()
{
  QdfOutStream &o = getStream();

  //////////
  // XtalInfo
  const CrystalInfo *pXI = &m_pObj->getXtalInfo();
  o.defData("xtal", 1);
  o.defFloat32("a");
  o.defFloat32("b");
  o.defFloat32("c");
  o.defFloat32("alp");
  o.defFloat32("bet");
  o.defFloat32("gam");
  o.defInt32("sg");

  o.startData();
  {
    o.startRecord();

    o.writeFloat32("a", (qfloat32) pXI->a());
    o.writeFloat32("b", (qfloat32) pXI->b());
    o.writeFloat32("c", (qfloat32) pXI->c());
    o.writeFloat32("alp", (qfloat32) pXI->alpha());
    o.writeFloat32("bet", (qfloat32) pXI->beta());
    o.writeFloat32("gam", (qfloat32) pXI->gamma());
    o.writeInt32("sg", pXI->getSG());

    o.endRecord();
  }
  o.endData();
  
  //////////
  // Header

  o.defData("hdr", 1);
  o.defInt8("mode");
  o.defInt32("nx");
  o.defInt32("ny");
  o.defInt32("nz");
  o.defInt32("stax");
  o.defInt32("stay");
  o.defInt32("staz");
  o.defInt32("intx");
  o.defInt32("inty");
  o.defInt32("intz");
  o.defFloat32("rmin");
  o.defFloat32("rmax");
  o.defFloat32("rmea");
  o.defFloat32("rsig");
  // map kind detected at load time and the MRC origin (trailing fields:
  // older readers stop at rsig and skip the rest of the record)
  o.defInt8("mtype");
  o.defFloat32("orgx");
  o.defFloat32("orgy");
  o.defFloat32("orgz");
  if (m_bSplit) {
    // MAP2 only: number of bmap chunks and sections per chunk
    o.defInt32("nchk");
    o.defInt32("csec");
  }

  int nx = m_pObj->getColNo();
  int ny = m_pObj->getRowNo();
  int nz = m_pObj->getSecNo();

  o.startData();
  {
    o.startRecord();

    // mode1 is bytemap
    o.writeInt8("mode", 1);

    o.writeInt32("nx", nx);
    o.writeInt32("ny", ny);
    o.writeInt32("nz", nz);

    o.writeInt32("stax", m_pObj->getStartCol());
    o.writeInt32("stay", m_pObj->getStartRow());
    o.writeInt32("staz", m_pObj->getStartSec());

    o.writeInt32("intx", m_pObj->getColInterval());
    o.writeInt32("inty", m_pObj->getRowInterval());
    o.writeInt32("intz", m_pObj->getSecInterval());

    o.writeFloat32("rmin", (qfloat32) m_pObj->getMinDensity());
    o.writeFloat32("rmax", (qfloat32) m_pObj->getMaxDensity());
    o.writeFloat32("rmea", (qfloat32) m_pObj->getMeanDensity());
    o.writeFloat32("rsig", (qfloat32) m_pObj->getRmsdDensity());

    o.writeInt8("mtype", qint8(m_pObj->getDetectedMapType()));
    const qlib::Vector4D vorig = m_pObj->getOrigin();
    o.writeFloat32("orgx", (qfloat32) vorig.x());
    o.writeFloat32("orgy", (qfloat32) vorig.y());
    o.writeFloat32("orgz", (qfloat32) vorig.z());
    if (m_bSplit) {
      o.writeInt32("nchk", m_nChunks);
      o.writeInt32("csec", m_nSecChunk);
    }

    o.endRecord();
  }
  o.endData();

  ////////////////
  // Map (bytemap): one "bmap" chunk per m_nSecChunk sections (a single
  // chunk holding every section in the MAP1 layout)
  const size_t nslice = size_t(nx)*size_t(ny);
  const qlib::ChunkedArray3D<quint8> &bmap = m_pObj->getByteMap();
  for (int ic=0; ic<m_nChunks; ++ic) {
    const int k0 = ic*m_nSecChunk;
    const int k1 = qlib::min(nz, k0 + m_nSecChunk);

    o.defData("bmap", int(nslice*size_t(k1-k0)));
    o.defInt8("v");

    o.startData();
    // one-byte records need no byte swapping: write each section's
    // samples as one fixed-record block straight from the map storage
    for (int k=k0; k<k1; k++)
      o.writeFxRecords(int(nslice), bmap.slice(k), int(nslice));
    o.endData();
  }
}


