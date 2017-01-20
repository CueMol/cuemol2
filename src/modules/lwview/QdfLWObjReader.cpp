// -*-Mode: C++;-*-
//
// QDF LWObject reader class
//

#include <common.h>

#include "QdfLWObjReader.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>
#include <gfx/PixelBuffer.hpp>

#include "LWObject.hpp"
#include "LWRenderer.hpp"

using namespace lwview;
using qsys::Scene;
using qsys::ScenePtr;
using qsys::Object;
using qsys::ObjectPtr;
using qsys::Renderer;
using qsys::RendererPtr;
using qsys::QdfInStream;

MC_DYNCLASS_IMPL(QdfLWObjReader, QdfLWObjReader, qlib::LSpecificClass<QdfLWObjReader>);

QdfLWObjReader::QdfLWObjReader()
{
}

QdfLWObjReader::~QdfLWObjReader()
{
}

///////////////////////////////////////////

qsys::ObjectPtr QdfLWObjReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new LWObject());
}

/// get file-type description
const char *QdfLWObjReader::getTypeDescr() const
{
  return "CueMol light-weight obj file (*.qdf)";
}

/// get file extension
const char *QdfLWObjReader::getFileExt() const
{
  return "*.qdf";
}

/// get nickname for scripting
const char *QdfLWObjReader::getName() const
{
  return "qdflwobj";
}

bool QdfLWObjReader::read(qlib::InStream &ins)
{
  LWObject *pObj = super_t::getTarget<LWObject>();

  if (pObj==NULL) {
    LOG_DPRINTLN("QDFReader> LWObject is not attached !!");
    return false;
  }

  m_pObj = pObj;

  start(ins);

  LString ftype = getFileType();
  if (ftype.equals("LWO1"))
    m_nVer = 1;
  else if (ftype.equals("LWO2"))
    m_nVer = 2;
  else if (ftype.equals("LWO3"))
    m_nVer = 3;
  else if (ftype.startsWith("LWO")) {
    LOG_DPRINTLN("Warning> Unknown LWO version number");
  }
  else {
    MB_THROW(qlib::FileFormatException, "LWObj: invalid file format signature");
    return false;
  }

  // read type index and build m_tmprends array
  readTypeIndex();

  QdfInStream &o = getStream();
  const int nsize = m_tmpdat.size();
  int ind;
  for (ind=0; ind<nsize; ++ind) {
    if (m_tmpdat[ind].m_pDrawElem==NULL)
      o.skipAllRecords();
    else
      readDrawElem(m_tmpdat[ind].m_pDrawElem);
  }

  scatterDrawElem();

  // write hitpoint data (from version LWO2)
  if (m_nVer>=2)
    readHitData();

  end();

  m_pObj = NULL;
  return true;
}

LWRendPtr QdfLWObjReader::findRenderer(int nID)
{
  Object::RendIter riter = m_pObj->beginRend();
  Object::RendIter reiter = m_pObj->endRend();
  for (; riter!=reiter; ++riter) {
    LWRendPtr pRend(riter->second, qlib::no_throw_tag());
    if (pRend.isnull())
      continue;
    if (pRend->getDataID()==nID)
      return pRend;
  }
  return LWRendPtr();
}

void QdfLWObjReader::scatterDrawElem()
{
  int i;
  const int nsize = m_tmpdat.size();
  if (nsize==0) return;

  Object::RendIter riter = m_pObj->beginRend();
  Object::RendIter reiter = m_pObj->endRend();
  for (; riter!=reiter; ++riter) {
    LWRendPtr pRend = riter->second;
    if (pRend.isnull()) continue;
    int dataid = pRend->getDataID();
    if (dataid==0) continue;
    int nelems = 0;
    for (i=0; i<nsize; ++i)
      if (m_tmpdat[i].m_nDataID==dataid)
        ++nelems;
    pRend->allocData(nelems);
  }

  riter = m_pObj->beginRend();
  reiter = m_pObj->endRend();
  for (; riter!=reiter; ++riter) {
    LWRendPtr pRend = riter->second;
    if (pRend.isnull()) continue;
    int dataid = pRend->getDataID();
    if (dataid==0) continue;
    int ielem = 0;
    for (i=0; i<nsize; ++i) {
      if (m_tmpdat[i].m_pDrawElem!=NULL &&
          m_tmpdat[i].m_nDataID==dataid) {
        pRend->setDrawElem(ielem, m_tmpdat[i].m_pDrawElem);
        m_tmpdat[i].m_nDataID = 0;
        m_tmpdat[i].m_pDrawElem = NULL;
        ++ielem;
      }
    }
  }

  for (i=0; i<nsize; ++i) {
    if (m_tmpdat[i].m_pDrawElem!=NULL) {
      LOG_DPRINTLN("LWObj> ERROR: data (ID=%d) remains", m_tmpdat[i].m_nDataID);
      delete m_tmpdat[i].m_pDrawElem;
    }
  }

  // clear temporary data
  m_tmpdat.destroy();
}

/// read type index and build m_tmprends array
void QdfLWObjReader::readTypeIndex()
{
  QdfInStream &o = getStream();

  const int nsize = o.readDataDef("type");
  m_tmpdat.resize(nsize);
  
  o.readRecordDef();

  int ind;
  for (ind=0; ind<nsize; ++ind) {
    o.startRecord();

    int id = o.readInt32("id");
    qint8 type = o.readInt8("t");
    qint8 mode = o.readInt8("m");
    qfloat32 w = o.readFloat32("w");
    quint32 cc = o.readColorRGBA("c");

    o.endRecord();

    gfx::DrawElem *pelem=NULL;
    switch (type) {
    case gfx::DrawElem::VA_V: {
      pelem = MB_NEW gfx::DrawElemV();
      break;
    }
    /*case gfx::DrawElem::VA_VN: {
      MB_ASSERT(false);
      break;
    }*/
    case gfx::DrawElem::VA_VC: {
      pelem = MB_NEW gfx::DrawElemVC();
      break;
    }
    /*case gfx::DrawElem::VA_VNC: {
      MB_ASSERT(false);
      break;
    }*/
    case gfx::DrawElem::VA_VNCI: {
      pelem = MB_NEW gfx::DrawElemVNCI();
      break;
    }
    case gfx::DrawElem::VA_PIXEL: {
      pelem = MB_NEW gfx::DrawElemPix();
      // no mode value in VA_PIXEL data
      mode = gfx::DrawElem::DRAW_POINTS;
      break;
    }
    default: {
      //LString msg = LString::format("unknown vertex type ID: %d", type);
      //MB_THROW(qlib::FileFormatException, msg);
      LOG_DPRINTLN("QdfLOWbjIn> unknown vertex type ID: %d", type);
      pelem = NULL;
      break;
    }
    } // switch

    if (pelem!=NULL) {
      pelem->setDrawMode(mode);
      pelem->setDefColor(cc);
      pelem->setLineWidth(w);
    }
    m_tmpdat[ind].m_nDataID = id;
    m_tmpdat[ind].m_pDrawElem = pelem;
  }
}

void QdfLWObjReader::readDrawElem(gfx::DrawElem *pData)
{
  switch (pData->getType()) {
  case gfx::DrawElem::VA_V: {
    readDrawElemV(static_cast<gfx::DrawElemV *>(pData));
    break;
  }
  case gfx::DrawElem::VA_VN: {
    MB_ASSERT(false);
    break;
  }
  case gfx::DrawElem::VA_VC: {
    readDrawElemVC(static_cast<gfx::DrawElemVC *>(pData));
    break;
  }
  case gfx::DrawElem::VA_VNC: {
    MB_ASSERT(false);
    break;
  }
  case gfx::DrawElem::VA_VNCI: {
    readDrawElemVNCI(static_cast<gfx::DrawElemVNCI *>(pData));
    break;
  }
  case gfx::DrawElem::VA_PIXEL: {
    readDrawElemPix(static_cast<gfx::DrawElemPix *>(pData));
    break;
  }
  default:
    MB_ASSERT(false);
    break;
  }
}

void QdfLWObjReader::readDrawElemV(gfx::DrawElemV * pData)
{
  QdfInStream &o = getStream();

  const int nverts = o.readDataDef("vatr");
  pData->alloc(nverts);

  o.readRecordDef();

  const gfx::DrawElemV::Elem *pElem = (const gfx::DrawElemV::Elem *) pData->getData();
  for (int i=0; i<nverts; ++i) {
    o.startRecord();
    o.readVec3D("v", (qfloat32 *) &pElem[i]);
    o.endRecord();
  }
}

void QdfLWObjReader::readDrawElemVC(gfx::DrawElemVC * pData)
{
  QdfInStream &o = getStream();

  const int nverts = o.readDataDef("vcat");
  pData->alloc(nverts);

  o.readRecordDef();

  const gfx::DrawElemVC::Elem *pElem = (const gfx::DrawElemVC::Elem *) pData->getData();
  for (int i=0; i<nverts; ++i) {
    o.startRecord();
    o.readVec3D("v", (qfloat32 *) &pElem[i]);
    o.readColorRGBA("c", (qbyte *) &(pElem[i].r) );
    o.endRecord();
  }
}

void QdfLWObjReader::readDrawElemVNCI(gfx::DrawElemVNCI * pData)
{
  QdfInStream &o = getStream();

  const int nverts = o.readDataDef("vnca");
  pData->alloc(nverts);

  o.readRecordDef();

  const gfx::DrawElemVNCI::Elem *pElem = (const gfx::DrawElemVNCI::Elem *) pData->getData();
  for (int i=0; i<nverts; ++i) {
    o.startRecord();
    o.readVec3D("v", (qfloat32 *) &pElem[i] );
    o.readVec3D("n", (qfloat32 *) &(pElem[i].nx) );
    o.readColorRGBA("c", (qbyte *) &(pElem[i].r) );
    o.endRecord();
  }

  /////

  const int ninds = o.readDataDef("vnci");
  pData->allocIndex(ninds);

  o.readRecordDef();

  for (int i=0; i<ninds; ++i) {
    o.startRecord();
    pData->setIndex(i, gfx::DrawElemVNCI::index_t( o.readInt32("i") ));
    o.endRecord();
  }
}

void QdfLWObjReader::readDrawElemPix(gfx::DrawElemPix * pData)
{
  QdfInStream &o = getStream();

  // pixel data info
  const int ninfo = o.readDataDef("pixi");
  MB_ASSERT(ninfo==1);

  o.readRecordDef();

  o.startRecord();
  Vector4D pos = o.readVec3D("v");
  quint32 color = o.readColorRGBA("c");
  int width = o.readInt32("w");
  int height = o.readInt32("h");
  int depth = o.readInt8("d");
  o.endRecord();

  // Only the 8bit or 32bit depths are valid for pixel data
  MB_ASSERT(depth==8 || depth==32);

  gfx::PixelBuffer *pPixBuf = MB_NEW gfx::PixelBuffer();
  pPixBuf->setWidth(width);
  pPixBuf->setHeight(height);
  pPixBuf->setDepth(depth);

  //////////
  // pixel data
  const int nsize = o.readDataDef("pixd");

  // TO DO: check consistency of the read pixel data (size, depth, width, and height)

  pPixBuf->resize(nsize);

  o.readRecordDef();

  qbyte *pElem = pPixBuf->data();
  for (int i=0; i<nsize; ++i) {
    o.startRecord();
    pElem[i] = o.readInt8("d");
    o.endRecord();
  }

  pData->m_pPixBuf = pPixBuf;
  pData->m_pos = pos;
  pData->m_color = color;
}

void QdfLWObjReader::readHitData()
{
  int i;
  QdfInStream &o = getStream();

  // read master data

  int ndata = o.readDataDef("hitm");
  m_pObj->m_hitdata.resize(ndata);

  o.readRecordDef();

  for (i=0; i<ndata; ++i) {
    o.startRecord();
    Vector4D pos = o.readVec3D("v");
    LString msg= o.readStr("s");
    o.endRecord();
    // MB_DPRINTLN("hit %d, %s", i, msg.c_str());

    m_pObj->m_hitdata[i].m_sMsg = msg;
    m_pObj->m_hitdata[i].m_vPos = pos;
  }

  // read hit typelist/populate rends array

  ndata = o.readDataDef("hitt");
  qlib::Array<LWRendPtr> rends(ndata);
  o.readRecordDef();

  int id, type;
  for (i=0; i<ndata; ++i) {
    o.startRecord();
    id = o.readInt32("id");
    type = o.readInt8("t");
    o.endRecord();
    rends[i] = findRenderer(id);
  }

  // read index data

  for (i=0; i<ndata; ++i) {
    LWRendPtr pRend = rends[i];
    if (pRend.isnull()) {
      LOG_DPRINTLN("ERROR: hittest data corrupted!!");
      // skip record
      continue;
    }

    // point hittest data is only supported in the current version
    int ninds = o.readDataDef("hitp");
    pRend->setHitIndexSize(ninds);
    o.readRecordDef();
    
    for (int j=0; j<ninds; ++j) {
      o.startRecord();
      id = o.readInt32("i");
      o.endRecord();
      pRend->setHitIndex(j, id);
    }
  }

}

