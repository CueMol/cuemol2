// -*-Mode: C++;-*-
//
// Light-weight renderer class
//

#include <common.h>

#include "LWRenderer.hpp"
#include "LWObject.hpp"
#include <gfx/DrawElem.hpp>

#include <gfx/DisplayContext.hpp>
#include <gfx/Hittest.hpp>

#include <qsys/ScalarObject.hpp>
#include <qsys/Scene.hpp>

using namespace lwview;
using gfx::DrawElem;
using gfx::DrawElemVC;

/// default constructor
LWRenderer::LWRenderer()
     : m_nDataID(0)
{
  m_phl = NULL;
}

LWRenderer::LWRenderer(const LWRenderer &r)
{
}

/// destructor
LWRenderer::~LWRenderer()
{
  clearData();
}

///////////////////////////////////////////

const char *LWRenderer::getTypeName() const
{
  return "lwrend";
}

LString LWRenderer::toString() const
{
  return LString("lwrend");
}

bool LWRenderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  LWObject *ptest = dynamic_cast<LWObject *>(pobj.get());
  return ptest!=NULL;
}

qlib::Vector4D LWRenderer::getCenter() const
{
  qlib::Vector4D pos;
  return pos;
}

///////////////////////////////////////////////

void LWRenderer::unloading()
{
  invalidateDisplayCache();
  invalidateHittestCache();
}

void LWRenderer::display(DisplayContext *pdc)
{
  int nsize = m_data.size();
  if (nsize==0)
    return;

  for (int i=0; i<nsize; ++i) {
    if (m_data[i]==NULL)
      continue;

    DrawElem *pElem = m_data[i];
    if (pElem->getType()==DrawElem::VA_PIXEL) {
      // VA_PIXEL (UI label) should be rendered in displayLabels() method
      // to avoid using shaders (current shader impl does not support textures, etc)
      continue;
    }
    pdc->drawElem(*pElem);
  }
}

void LWRenderer::displayLabels(DisplayContext *pdc)
{
  // VA_PIXEL (UI label) should be rendered in this displayLabels() method.

  int nsize = m_data.size();
  if (nsize==0)
    return;

  for (int i=0; i<nsize; ++i) {
    if (m_data[i]==NULL)
      continue;
    DrawElem *pElem = m_data[i];
    if (pElem->getType()==DrawElem::VA_PIXEL)
      pdc->drawElem(*pElem);
  }
}

void LWRenderer::invalidateDisplayCache()
{
  // clear cached VBO
  int nsize = m_data.size();
  for (int i=0; i<nsize; ++i) {
    if (m_data[i]!=NULL)
      m_data[i]->invalidateCache();
  }
}

////////////////////////////////////////////////////////
// Hittest implementation
//

void LWRenderer::invalidateHittestCache()
{
  if (m_phl!=NULL)
    delete m_phl;
  m_phl = NULL;
}

/// render Hittest object
void LWRenderer::displayHit(DisplayContext *pdc)
{
  if (m_hitIndex.size()==0)
    return;

  // check hittest display list cache
  if (m_phl!=NULL) {
    // render by existing display list
    pdc->callDisplayList(m_phl);
    return;
  }

  if (pdc->canCreateDL()) {
    // Cache does not exist,
    // so create new display list.
    m_phl = pdc->createDisplayList();

    LWObjPtr pObj = getClientObj();
    MB_ASSERT(!pObj.isnull());
    
    // start DL recording
    m_phl->recordStart();

    LWHitData hdat;
    for (int i=0; i<m_hitIndex.size(); ++i) {
      int id = m_hitIndex[i];
      if (pObj->getHitData(id, hdat)) {
        m_phl->drawPointHit(id, hdat.m_vPos);
      }
    }

    // end DL recording
    m_phl->recordEnd();

    // render by the created display list
    pdc->callDisplayList(m_phl);
    return;
  }
  else {
    // pdc can't create DL --> render directly??
    // not supported!!
  }
}

/// Hittest support check
bool LWRenderer::isHitTestSupported() const
{
  if (m_hitIndex.size()>0)
    return true;
  return false;
}

/// Hittest result interpretation
LString LWRenderer::interpHit(const gfx::RawHitData &rhit)
{
  qlib::uid_t rend_id = getUID();
  int nsize = rhit.getDataSize(rend_id);
  if (nsize<=0)
    return LString();

  LString rval;
  int nid;

  rval += "\"objtype\": \"LWObject\",\n";
  rval += LString::format("\"size\": %d,\n", nsize);

  //////////

  // Single hit
  nid = rhit.getDataAt(rend_id, 0, 0);
  
  if (nid<0) {
    MB_DPRINTLN("LWRend> invalid hitdata entry ignored");
    return LString();
  }
  
  LWObjPtr pObj = getClientObj();
  MB_ASSERT(!pObj.isnull());

  LWHitData hdat;
  if (!pObj->getHitData(nid, hdat))
    return LString();

  const LString &msg = hdat.m_sMsg;
  const Vector4D &pos = hdat.m_vPos;

  rval += "\"message\": \""+ msg + "\",\n";
  rval += LString::format("\"x\": %f,\n", pos.x());
  rval += LString::format("\"y\": %f,\n", pos.y());
  rval += LString::format("\"z\": %f,\n", pos.z());

  return rval;
}

////////////////////////////////////////////////////


void LWRenderer::allocData(int nsize)
{
  if (m_data.size()>0)
    clearData();
  
  m_data.allocate(nsize);
  for (int i=0; i<nsize; ++i)
    m_data[i] = NULL;
}

void LWRenderer::clearData()
{
  int nsize = m_data.size();
  for (int i=0; i<nsize; ++i) {
    if (m_data[i]!=NULL) {
      delete m_data[i];
      m_data[i] = NULL;
    }
  }
}

void LWRenderer::setDrawElem(int ind, DrawElem *pData)
{
  m_data[ind] = pData;
}


