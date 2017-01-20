// -*-Mode: C++;-*-
//
// QDF LWObject writer class
//

#include <common.h>

#include "QdfLWObjWriter.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>
#include <gfx/DrawElem.hpp>
#include <gfx/PixelBuffer.hpp>

#include "LWObject.hpp"
#include "LWRenderer.hpp"

using namespace lwview;
using qsys::Object;
using qsys::ObjectPtr;
using qsys::Renderer;
using qsys::RendererPtr;
using qsys::QdfOutStream;

MC_DYNCLASS_IMPL(QdfLWObjWriter, QdfLWObjWriter, qlib::LSpecificClass<QdfLWObjWriter>);

QdfLWObjWriter::QdfLWObjWriter()
{
}

QdfLWObjWriter::~QdfLWObjWriter()
{
}

void QdfLWObjWriter::attach(qsys::ObjectPtr pMol)
{
  if (!canHandle(pMol)) {
    MB_THROW(qlib::InvalidCastException, "QdfLWObjWriter");
    return;
  }
  super_t::attach(pMol);
}

const char * QdfLWObjWriter::getTypeDescr() const
{
  return "CueMol light-weight obj file (*.qdf)";
}

const char * QdfLWObjWriter::getFileExt() const
{
  return "*.qdf";
}

const char *QdfLWObjWriter::getName() const
{
  return "qdflwobj";
}

bool QdfLWObjWriter::canHandle(qsys::ObjectPtr pobj) const
{
  return (dynamic_cast<LWObject *>(pobj.get())!=NULL);
}

/////////


// write surf to stream
bool QdfLWObjWriter::write(qlib::OutStream &outs)
{
  int i;
  LWObject *pObj = super_t::getTarget<LWObject>();

  if (pObj==NULL) {
    LOG_DPRINTLN("QDFWriter> LWObject is not attached !!");
    return false;
  }

  m_pObj = pObj;

  start(outs);

  QdfOutStream &o = getStream();

  o.writeFileType("LWO3");

  prepareData();

  // write type ID array
  const int nsize = m_tmpdat.size();
  o.defData("type", nsize);
  o.defInt32("id");
  o.defInt8("t");
  o.defInt8("m");
  o.defFloat32("w");
  o.defColorRGBA("c");
  o.startData();
  for (i=0; i<nsize; ++i) {
    int id = m_tmpdat[i].m_nDataID;
    gfx::DrawElem *pDE =  m_tmpdat[i].m_pDrawElem;
    qint8 tp = qint8( pDE->getType() );
    qint8 mode = qint8( pDE->getDrawMode() );

    o.startRecord();
    o.writeInt32("id", id);
    o.writeInt8("t", tp);
    o.writeInt8("m", mode);
    o.writeFloat32("w", pDE->getLineWidth());
    o.writeColorRGBA("c", pDE->getDefColor());
    o.endRecord();
  }
  o.endData();

  // write draw elems
  for (i=0; i<nsize; ++i) {
    int id = m_tmpdat[i].m_nDataID;
    gfx::DrawElem *pDE = m_tmpdat[i].m_pDrawElem;
    writeDrawElem(pDE);
  }

  // write hitpoint data (from version LWO2)
  writeHitData();

  end();

  // clear the temporary workarea
  m_tmpdat.clear();
  
  m_pObj = NULL;
  return true;
}

void QdfLWObjWriter::prepareData()
{
  Object::RendIter riter = m_pObj->beginRend();
  Object::RendIter reiter = m_pObj->endRend();
  Data entry;
  for (; riter!=reiter; ++riter) {
    LWRendPtr pRend(riter->second, qlib::no_throw_tag());
    if (pRend.isnull())
      continue;
    entry.m_nDataID = pRend->getDataID();
    const int ndes = pRend->getElemSize();
    for (int i=0; i<ndes; ++i) {
      entry.m_pDrawElem = pRend->getDrawElem(i);
      m_tmpdat.push_back(entry);
    }
  }
}

void QdfLWObjWriter::writeDrawElem(gfx::DrawElem *pData)
{
  switch (pData->getType()) {
  case gfx::DrawElem::VA_V: {
    writeDrawElemV(static_cast<gfx::DrawElemV *>(pData));
    break;
  }
  case gfx::DrawElem::VA_VN: {
    MB_ASSERT(false);
    break;
  }
  case gfx::DrawElem::VA_VC: {
    writeDrawElemVC(static_cast<gfx::DrawElemVC *>(pData));
    break;
  }
  case gfx::DrawElem::VA_VNC: {
    MB_ASSERT(false);
    break;
  }
  case gfx::DrawElem::VA_VNCI: {
    writeDrawElemVNCI(static_cast<gfx::DrawElemVNCI *>(pData));
    break;
  }
  case gfx::DrawElem::VA_PIXEL: {
    writeDrawElemPix(static_cast<gfx::DrawElemPix *>(pData));
    break;
  }
  default:
    //MB_ASSERT(false);
    MB_THROW(qlib::RuntimeException, "Unsupported drawing element");
    break;
  }
}

void QdfLWObjWriter::writeDrawElemV(gfx::DrawElemV * pData)
{
  const int nverts = pData->getSize();
  QdfOutStream &o = getStream();

  o.defData("vatr", nverts);
  o.defVec3D("v");
  o.startData();

  const gfx::DrawElemV::Elem *pElem = (const gfx::DrawElemV::Elem *) pData->getData();
  for (int i=0; i<nverts; ++i) {
    o.startRecord();
    o.writeVec3D("v", (const qfloat32 *) &pElem[i]);
    o.endRecord();
  }
  o.endData();
}

void QdfLWObjWriter::writeDrawElemVC(gfx::DrawElemVC * pData)
{
  const int nverts = pData->getSize();
  QdfOutStream &o = getStream();

  o.defData("vcat", nverts);
  o.defVec3D("v");
  o.defColorRGBA("c");
  o.startData();

  const gfx::DrawElemVC::Elem *pElem = (const gfx::DrawElemVC::Elem *) pData->getData();
  for (int i=0; i<nverts; ++i) {
    o.startRecord();
    o.writeVec3D("v", (const qfloat32 *) &pElem[i]);
    o.writeColorRGBA("c", (const qbyte *) &(pElem[i].r));
    o.endRecord();
  }
  o.endData();
}

void QdfLWObjWriter::writeDrawElemVNCI(gfx::DrawElemVNCI * pData)
{
  const int nverts = pData->getSize();
  QdfOutStream &o = getStream();

  o.defData("vnca", nverts);
  o.defVec3D("v");
  o.defVec3D("n");
  o.defColorRGBA("c");
  o.startData();

  const gfx::DrawElemVNCI::Elem *pElem = (const gfx::DrawElemVNCI::Elem *) pData->getData();
  for (int i=0; i<nverts; ++i) {
    o.startRecord();
    o.writeVec3D("v", (const qfloat32 *) &pElem[i]);
    o.writeVec3D("n", (const qfloat32 *) &(pElem[i].nx));
    o.writeColorRGBA("c", (const qbyte *) &(pElem[i].r));
    o.endRecord();
  }
  o.endData();

  /////

  //const int ninds = pData->getIndexSize();
  const int ninds = pData->getIndSize();
  o.defData("vnci", ninds);
  o.defInt32("i");
  o.startData();

  //const gfx::DrawElemVNCI::index_t *pinds = pData->getIndexData();
  const gfx::DrawElemVNCI::index_t *pinds = (const gfx::DrawElemVNCI::index_t *) pData->getIndData();
  for (int i=0; i<ninds; ++i) {
    o.startRecord();
    o.writeInt32("i", pinds[i]);
    o.endRecord();
  }
  o.endData();
}

/// Pixel image (point sprite, text label) data
void QdfLWObjWriter::writeDrawElemPix(gfx::DrawElemPix *pData)
{
  QdfOutStream &o = getStream();

  // header info
  o.defData("pixi", 1);
  o.defVec3D("v");
  o.defColorRGBA("c");
  o.defInt32("w");
  o.defInt32("h");
  o.defInt8("d");
  // o.defInt32("size");
  o.startData();

  o.startRecord();
  o.writeVec3D("v", pData->m_pos);
  o.writeColorRGBA("c", pData->m_color);
  o.writeInt32("w", pData->m_pPixBuf->getWidth());
  o.writeInt32("h", pData->m_pPixBuf->getHeight());
  o.writeInt8("d", pData->m_pPixBuf->getDepth());
  // o.writeInt32("size", pData->m_pPixBuf->size());
  o.endRecord();

  // pixel data
  int nsize = pData->m_pPixBuf->size();
  o.defData("pixd", nsize);
  o.defInt8("d");
  o.startData();

  const qbyte *pElem = pData->m_pPixBuf->data();
  for (int i=0; i<nsize; ++i) {
    o.startRecord();
    o.writeInt8("d", pElem[i]);
    o.endRecord();
  }
  o.endData();
}

////////////////////////////////////////////////////////////////
// hittest data serialization

void QdfLWObjWriter::writeHitData()
{
  int i;
  QdfOutStream &o = getStream();

  // write object's master data

  const int ndata = m_pObj->m_hitdata.size();
  o.defData("hitm", ndata);
  o.defVec3D("v");
  o.defStr("s");
  o.startData();

  LWHitData hdat;
  for (i=0; i<ndata; ++i) {
    m_pObj->getHitData(i, hdat);
    o.startRecord();
    o.writeVec3D("v", hdat.m_vPos);
    o.writeStr("s", hdat.m_sMsg);
    o.endRecord();
  }
  o.endData();

  //////////////////

  // write rendere's typelist

  // count valid renderers
  int nrend = 0;
  Object::RendIter riter = m_pObj->beginRend();
  Object::RendIter reiter = m_pObj->endRend();
  for (; riter!=reiter; ++riter) {
    LWRendPtr pRend(riter->second, qlib::no_throw_tag());
    if (pRend.isnull() || !pRend->isHitTestSupported())
      continue;
    ++nrend;
  }

  o.defData("hitt", nrend);
  // Renderer ID
  o.defInt32("id");
  // type of hit index for this renderer
  o.defInt8("t");
  o.startData();

  riter = m_pObj->beginRend();
  reiter = m_pObj->endRend();
  for (; riter!=reiter; ++riter) {
    LWRendPtr pRend(riter->second, qlib::no_throw_tag());
    if (pRend.isnull() || !pRend->isHitTestSupported())
      continue;
    o.startRecord();
    o.writeInt32("id", pRend->getDataID());
    // index type (point is only supported in the current impl)
    o.writeInt8("t", 0);
    o.endRecord();
  }
  o.endData();

  //////////////////

  riter = m_pObj->beginRend();
  reiter = m_pObj->endRend();
  for (; riter!=reiter; ++riter) {
    LWRendPtr pRend(riter->second, qlib::no_throw_tag());
    if (pRend.isnull() || !pRend->isHitTestSupported())
      continue;

    // write the point data index
    o.defData("hitp", pRend->getHitIndexSize());
    // index in the master data
    o.defInt32("i");
    o.startData();

    for (i=0; i<pRend->getHitIndexSize(); ++i) {
      o.startRecord();
      // point only
      o.writeInt32("i", pRend->getHitIndex(i));
      o.endRecord();
    }
    o.endData();
  }
}

