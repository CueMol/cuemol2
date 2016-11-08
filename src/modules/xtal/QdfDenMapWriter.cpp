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

  start(outs);

  getStream().setFileType("MAP1");

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

    o.endRecord();
  }
  o.endData();

  ////////////////
  // Map (bytemap)
  int nsize = nx*ny*nz;
  o.defData("bmap", nsize);
  o.defInt8("v");

  o.startData();
  for (int k=0; k<nz; k++)
    for (int j=0; j<ny; j++)
      for (int i=0; i<nx; i++) {
        o.startRecord();
        o.writeInt8("v", qint8( m_pObj->atByte(i,j,k) ));
        o.endRecord();
      }

  o.endData();

}


