// -*-Mode: C++;-*-
//
//  Name label renderer class
//

#include <common.h>
#include "NameLabel2Renderer.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"

#include <gfx/PixelBuffer.hpp>
#include <gfx/DisplayContext.hpp>
#include <gfx/Texture.hpp>
#include <gfx/TextRenderManager.hpp>
#include <qsys/SceneManager.hpp>

#include <sysdep/OglShaderSetupHelper.hpp>

namespace molstr {

  struct NameLabel2
  {
  public:

    NameLabel2(): m_pPixBuf(NULL)
    {
    }

    NameLabel2(const NameLabel2 &arg)
         : aid(arg.aid), strAid(arg.strAid), str(arg.str), m_pPixBuf(NULL)
    {
    }

    virtual ~NameLabel2() {
      if (m_pPixBuf!=NULL)
        delete m_pPixBuf;
    }

    /// Target atom ID
    int aid;

    /// Target atom in string representation
    LString strAid;

    /// Custom label string
    LString str;

    /// Image data of the label (in CPU)
    gfx::PixelBuffer *m_pPixBuf;

    inline bool equals(const NameLabel2 &a) const {
      return aid==a.aid;
    }
  };

  struct NameLabel2List : public std::deque<NameLabel2> {};

}

//////////////////////////////////////////////////////////////////////////

using namespace molstr;

NameLabel2Renderer::NameLabel2Renderer()
     : super_t()
{
  m_pdata = MB_NEW NameLabel2List;

  //m_nMax = 5;
  //m_xdispl = 0.0;
  //m_ydispl = 0.0;

  m_strFontStyle = "normal";
  m_strFontWgt = "normal";
  m_bScaling = false;

  // will be called by RendererFactory
  //resetAllProps();

  m_pPO = NULL;
  m_pAttrAry = NULL;
  m_pLabelTex = NULL;
  setForceGLSL(true);
}

NameLabel2Renderer::~NameLabel2Renderer()
{
  m_pdata->clear();
  delete m_pdata;
}

//////////////////////////////////////////////////////////////////////////

/*
MolCoordPtr NameLabel2Renderer::getClientMol() const
{
  qsys::ObjectPtr robj = qsys::SceneManager::getObjectS(getClientObjID());
  if (robj.isnull()) return MolCoordPtr();
  return MolCoordPtr(robj);
}
*/

bool NameLabel2Renderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  MolCoord *ptest = dynamic_cast<MolCoord *>(pobj.get());
  return ptest!=NULL;
}

LString NameLabel2Renderer::toString() const
{
  return LString::format("NameLabel2Renderer %p", this);
}

bool NameLabel2Renderer::isHitTestSupported() const
{
  return false;
}

const char *NameLabel2Renderer::getTypeName() const
{
  return "*namelabel2";
}

Vector4D NameLabel2Renderer::getCenter() const
{
  // TO DO: throw NoCenterException
  return Vector4D();
}

/// Invalidate the display cache
void NameLabel2Renderer::invalidateDisplayCache()
{
  // clean-up internal data
  clearAllLabelPix();

  m_pixall.clear();
  if (m_pLabelTex!=NULL) {
    delete m_pLabelTex;
    m_pLabelTex = NULL;
  }
  if (m_pAttrAry!=NULL) {
    delete m_pAttrAry;
    m_pAttrAry = NULL;
  }

  // clean-up display list (if exists; in compatible mode)
  super_t::invalidateDisplayCache();
}

//////////////////////////////////////////////////////////////////////////
// old renderer interface implementations

void NameLabel2Renderer::preRender(DisplayContext *pdc)
{
  Vector4D dv;
  qsys::View *pview = pdc->getTargetView();
  if (pview!=NULL)
    pview->convXYTrans(m_xdispl, m_ydispl, dv);

  pdc->enableDepthTest(false);

  pdc->pushMatrix();
  pdc->translate(dv);

//  pdc->color(m_color);
  pdc->setLighting(false);
}

void NameLabel2Renderer::postRender(DisplayContext *pdc)
{
  pdc->popMatrix();
  pdc->enableDepthTest(true);
}

void NameLabel2Renderer::render(DisplayContext *pdc)
{
/*
  if (!pdc->isRenderPixmap())
    return;
  
  MolCoordPtr rCliMol = getClientMol();
  if (rCliMol.isnull()) {
    MB_DPRINTLN("NameLabel2Renderer::render> Client mol is null");
    return;
  }
  
  {
    LString strlab;
    Vector4D pos;
    NameLabel2List::iterator iter = m_pdata->begin();
    NameLabel2List::iterator eiter = m_pdata->end();
    for (; iter!=eiter; iter++) {
      NameLabel2 &lab = *iter;
      if (lab.m_nCacheID<0) {
        makeLabelStr(lab, strlab, pos);
        lab.m_nCacheID = m_pixCache.addString(pos, strlab);
      }
    }
  }
  
  m_pixCache.setFont(m_dFontSize, m_strFontName, m_strFontStyle, m_strFontWgt);
  pdc->color(m_color);
  m_pixCache.draw(pdc);
*/
  // if (pdc->isFile())
  // m_pixCache.draw(pdc, false); // force to ignore cached data
  //   else
  // m_pixCache.draw(pdc, true); // reuse cached label images
}

//////////////////////////////////////////////////////
// Ver. 2 interface implementations

/// Use ver2 interface (--> return true)
bool NameLabel2Renderer::isUseVer2Iface() const
{
  //return false;
  return true;
}

/// Initialize & setup capabilities (for glsl setup)
bool NameLabel2Renderer::init(DisplayContext *pdc)
{
  sysdep::OglShaderSetupHelper<NameLabel2Renderer> ssh(this);

  if (!ssh.checkEnvVS()) {
    LOG_DPRINTLN("NameLabel2> ERROR: GLSL not supported.");
    //MB_THROW(qlib::RuntimeException, "OpenGL GPU shading not supported");
    setShaderAvail(false);
    return false;
  }

  if (m_pPO==NULL)
    m_pPO = ssh.createProgObj("gpu_namelabel2",
                              "%%CONFDIR%%/data/shaders/namelabel2_vert.glsl",
                              "%%CONFDIR%%/data/shaders/namelabel2_frag.glsl");
  
  if (m_pPO==NULL) {
    LOG_DPRINTLN("NameLabel2> ERROR: cannot create progobj.");
    setShaderAvail(false);
    return false;
  }

  m_pPO->enable();

  // setup uniforms
  m_pPO->setUniform("labelTex", 0);

  // setup attributes
  m_nXyzLoc = m_pPO->getAttribLocation("a_xyz");
  m_nWhLoc = m_pPO->getAttribLocation("a_wh");
  m_nWidthLoc = m_pPO->getAttribLocation("a_width");
  m_nAddrLoc = m_pPO->getAttribLocation("a_addr");

  m_pPO->disable();
  setShaderAvail(true);
  return true;
}
    
void NameLabel2Renderer::createGLSL()
{
  int nlab = m_pdata->size();

  // create label texture
  if (m_pLabelTex!=NULL)
    delete m_pLabelTex;
  
  m_pLabelTex = MB_NEW gfx::Texture();

  //m_pLabelTex->setup(1, gfx::Texture::FMT_R,
  //gfx::Texture::TYPE_FLOAT32);

  m_pLabelTex->setup(1, gfx::Texture::FMT_R,
                     gfx::Texture::TYPE_UINT8_COLOR);

  //m_pLabelTex->setup(2, gfx::Texture::FMT_RGB,
  //gfx::Texture::TYPE_FLOAT32);


  //
  // Create VBO
  //
  
  if (m_pAttrAry!=NULL)
    delete m_pAttrAry;

  m_pAttrAry = MB_NEW AttrArray();
  AttrArray &attra = *m_pAttrAry;
  attra.setAttrSize(4);
  attra.setAttrInfo(0, m_nXyzLoc, 3, qlib::type_consts::QTC_FLOAT32,
                    offsetof(AttrElem, x));
  attra.setAttrInfo(1, m_nWhLoc, 2, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, w));
  attra.setAttrInfo(2, m_nWidthLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, width));
  attra.setAttrInfo(3, m_nAddrLoc, 1, qlib::type_consts::QTC_FLOAT32, offsetof(AttrElem, addr));

  attra.alloc(nlab*4);
  attra.allocInd(nlab*6);

  attra.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
  //attra.setDrawMode(gfx::AbstDrawElem::DRAW_POINTS);

}

bool NameLabel2Renderer::isCacheAvail() const
{
  return m_pAttrAry!=NULL && m_pLabelTex!=NULL;
}

/// Render to display (using GLSL)
void NameLabel2Renderer::renderGLSL(DisplayContext *pdc)
{
  if (m_pPO==NULL)
    return; // Error, shader program is not available (ignore)

  float width = 1.0f, height = 1.0f;
  float sclx = 1.0f, scly = 1.0f;
  qsys::View *pView = pdc->getTargetView();
  if (pView!=NULL) {
    if (pView->useSclFac()) {
      sclx = (float) pView->getSclFacX();
      scly = (float) pView->getSclFacY();
    }
    width = (float) pView->getWidth()*0.5f*sclx;// * 3.0f/4.0f;
    height = (float) pView->getHeight()*0.5f*scly;// * 3.0f/4.0f;
  }

  if (m_pixall.empty())
    createTextureData(pdc, sclx, scly);
  
  // Get label color
  qlib::uid_t nSceneID = getSceneID();
  float fr=0.0f, fg=0.0f, fb=0.0f, fa = pdc->getAlpha();
  if (!m_color.isnull()) {
    quint32 dcc = m_color->getDevCode(nSceneID);
    fr = gfx::convI2F(gfx::getRCode(dcc));
    fg = gfx::convI2F(gfx::getGCode(dcc));
    fb = gfx::convI2F(gfx::getBCode(dcc));
    fa *= gfx::convI2F(gfx::getACode(dcc));
  }

  // Determine ppa
  float ppa = -1.0f;
  if (m_bScaling)
    ppa = 100.0f; // TO DO: better impl.

  pdc->useTexture(m_pLabelTex, 0);

  m_pPO->enable();
  m_pPO->setUniformF("u_winsz", width, height);
  m_pPO->setUniformF("u_ppa", ppa);
  m_pPO->setUniformF("u_color", fr, fg, fb, fa);
  pdc->drawElem(*m_pAttrAry);

  m_pPO->disable();

  pdc->unuseTexture(m_pLabelTex);
}

void NameLabel2Renderer::createTextureData(DisplayContext *pdc, float sclx, float scly)
{
  int nlab = m_pdata->size();

  // Render label pixbuf
  {
    LString strlab;
    // Vector4D pos;
    NameLabel2List::iterator iter = m_pdata->begin();
    NameLabel2List::iterator eiter = m_pdata->end();
    for (; iter!=eiter; iter++) {
      NameLabel2 &lab = *iter;
      if (lab.m_pPixBuf==NULL) {
        strlab = makeLabelStr(lab);
        //strlab = "A";
        lab.m_pPixBuf = createPixBuf(sclx, strlab);
      }
//      MB_ASSERT(nlab.m_nCacheID>=0);
    }

    // m_pixCache.render(sclx);
  }

  // Calculate pixdata index
  int npix = 0;
  std::vector<int> pixaddr(nlab);
  {
    int i=0, j;
    NameLabel2List::iterator iter = m_pdata->begin();
    NameLabel2List::iterator eiter = m_pdata->end();
    for (; iter!=eiter; iter++, ++i) {
      NameLabel2 &lab = *iter;
      gfx::PixelBuffer *ppb = lab.m_pPixBuf;
      if (ppb==NULL) {
        MB_ASSERT(false);
        continue;
      }
      
      pixaddr[i] = npix;
      const int width = ppb->getWidth();
      const int height = ppb->getHeight();
      npix += width * height;
    }
  }
  
  // Create texture atlas
  m_pixall.resize(npix);
  {
    npix = 0;
    int i=0, j;
    NameLabel2List::iterator iter = m_pdata->begin();
    NameLabel2List::iterator eiter = m_pdata->end();
    for (; iter!=eiter; iter++, ++i) {
      NameLabel2 &lab = *iter;
      gfx::PixelBuffer *ppb = lab.m_pPixBuf;
      if (ppb==NULL) {
        MB_ASSERT(false);
        continue;
      }
      
      const int width = ppb->getWidth();
      const int height = ppb->getHeight();

      for (j=0; j<width*height; ++j) {
        //m_pixall[j+npix] = gfx::convB2F(ppb->at(j));
        m_pixall[j+npix] = ppb->at(j);
      }

      npix += width * height;
    }
  }

  m_pLabelTex->setData(npix, 1, 1, &m_pixall[0]);

  const float dispx = float(m_xdispl);
  const float dispy = float(m_ydispl);
  
  AttrArray &attra = *m_pAttrAry;
  {
    int i=0, j;
    LString strlab;
    Vector4D pos;
    NameLabel2List::iterator iter = m_pdata->begin();
    NameLabel2List::iterator eiter = m_pdata->end();
    for (; iter!=eiter; iter++, ++i) {
      NameLabel2 &lab = *iter;
      gfx::PixelBuffer *ppb = lab.m_pPixBuf;
      if (ppb==NULL) {
        MB_ASSERT(false);
        continue;
      }
      
      // Vector4D pos = m_pixCache.getPos( nlab.m_nCacheID );

      const int ive = i*4;
      const int ifc = i*6;

      const float width = (float) ppb->getWidth();
      const float height = (float) ppb->getHeight();

      //MB_DPRINTLN("Label2> %d width,height = %f,%f", i, width, height);
      // vertex data
      for (j=0; j<4; ++j) {
        //attra.at(ive+j).x = qfloat32( pos.x() );
        //attra.at(ive+j).y = qfloat32( pos.y() );
        //attra.at(ive+j).z = qfloat32( pos.z() );
        attra.at(ive+j).width = width;
        attra.at(ive+j).addr = float( pixaddr[i] );
      }
      
      attra.at(ive+0).w = dispx;
      attra.at(ive+0).h = dispy;

      attra.at(ive+1).w = dispx + width;
      attra.at(ive+1).h = dispy;

      attra.at(ive+2).w = dispx;
      attra.at(ive+2).h = dispy + height;

      attra.at(ive+3).w = dispx + width;
      attra.at(ive+3).h = dispy + height;
      
      // face indices
      attra.atind(ifc+0) = ive + 0;
      attra.atind(ifc+1) = ive + 1;
      attra.atind(ifc+2) = ive + 2;
      attra.atind(ifc+3) = ive + 2;
      attra.atind(ifc+4) = ive + 1;
      attra.atind(ifc+5) = ive + 3;
    }
  }

  LOG_DPRINTLN("NameLabel2> %d labels (%d pix tex) created", nlab, npix);
}

void NameLabel2Renderer::updateStaticGLSL()
{
  AttrArray &attra = *m_pAttrAry;

  int i=0, j;
  LString strlab;
  Vector4D pos;
  MolAtomPtr pA;
  MolCoordPtr pMol = getClientMol();

  NameLabel2List::iterator iter = m_pdata->begin();
  NameLabel2List::iterator eiter = m_pdata->end();
  for (; iter!=eiter; iter++, ++i) {
    NameLabel2 &lab = *iter;

    if (lab.aid<0) {
      makeLabelStr(lab);
    }

    pA = pMol->getAtom(lab.aid);
    if (pA.isnull())
      continue;

    Vector4D pos = pA->getPos();

    const int ive = i*4;
    const int ifc = i*6;

    // vertex data
    for (j=0; j<4; ++j) {
      attra.at(ive+j).x = qfloat32( pos.x() );
      attra.at(ive+j).y = qfloat32( pos.y() );
      attra.at(ive+j).z = qfloat32( pos.z() );
    }
  }

  attra.setUpdated(true);
}

void NameLabel2Renderer::updateDynamicGLSL()
{
  updateStaticGLSL();
}

//////////////////////////////////////////////////////////////////////////
// Label specific implementations

LString NameLabel2Renderer::makeLabelStr( NameLabel2 &lab)
{
  LString rstrlab;
  
  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  if (lab.aid<0) {
    lab.aid = pobj->fromStrAID(lab.strAid);
    if (lab.aid<0)
      return LString("(null)");
  }

  MolAtomPtr pAtom = pobj->getAtom(lab.aid);
  if (pAtom.isnull())
    return LString("(null)");
  
  if (!lab.str.isEmpty()) {
    rstrlab = lab.str;
  }
  else {
    LString sbuf = pAtom->getChainName() + " " +
      pAtom->getResName() +
        pAtom->getResIndex().toString() + " " +
          pAtom->getName();
    char confid = pAtom->getConfID();
    if (confid)
      sbuf += LString(":") + LString(confid);
    
    rstrlab = sbuf; //.toUpperCase();
  }
  
  return rstrlab;
}

gfx::PixelBuffer *NameLabel2Renderer::createPixBuf(double scl, const LString &lab)
{
  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  if (pTRM==NULL)
    return NULL;

  pTRM->setupFont(m_dFontSize * scl, m_strFontName, m_strFontStyle, m_strFontWgt);

  auto pixbuf = MB_NEW gfx::PixelBuffer();
  if (!pTRM->renderText(lab, *pixbuf))
    return NULL;
  return pixbuf;
}

bool NameLabel2Renderer::addLabel(MolAtomPtr patom, const LString &label /*= LString()*/)
{
  NameLabel2 newlab;
  newlab.aid = patom->getID();
  if (!label.isEmpty())
    newlab.str = label;

  BOOST_FOREACH(NameLabel2 &lab, *m_pdata) {
    if (newlab.equals(lab))
      return false; // already labeled
  }

  m_pdata->push_back(newlab);

  /*
  int nover = m_pdata->size() - m_nMax;
  for (; nover>0; nover--) {
    //NameLabel2 &lab = m_pdata->front();
    m_pdata->pop_front();
  }
  */
  
  // to be redrawn
  invalidateDisplayCache();

  return true;
}

bool NameLabel2Renderer::addLabelByID(int aid, const LString &label /*= LString()*/)
{
  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  MolAtomPtr pAtom = pobj->getAtom(aid);
  return addLabel(pAtom, label);
}

bool NameLabel2Renderer::removeLabelByID(int aid)
{
  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  MolAtomPtr pAtom = pobj->getAtom(aid);
  // return removeLabel(pAtom);

  NameLabel2List::iterator iter = m_pdata->begin();
  NameLabel2List::iterator eiter = m_pdata->end();
  for (; iter!=eiter; ++iter) {
    NameLabel2 &lab = *iter;
    if (aid==lab.aid) {
      // already labeled --> remove it
      //if (lab.m_nCacheID>=0)
      //m_pixCache.remove(lab.m_nCacheID);
      m_pdata->erase(iter);

      // to be redrawn
      invalidateDisplayCache();
      
      return true;
    }
  }

  // no label removed
  return false;
}

void NameLabel2Renderer::setFontSize(double val)
{
  if (qlib::isNear4(m_dFontSize, val))
    return;

  m_dFontSize = val;

  // font info was changed --> invalidate all cached data
  invalidateDisplayCache();
}

void NameLabel2Renderer::setFontName(const LString &val)
{
  if (m_strFontName.equals(val))
    return;
  
  m_strFontName = val;

  // font info was changed --> invalidate all cached data
  invalidateDisplayCache();
}

void NameLabel2Renderer::setFontStyle(const LString &val)
{
  if (m_strFontStyle.equals(val))
    return;

  m_strFontStyle = val;

  // font info was changed --> invalidate all cached data
  invalidateDisplayCache();
}

void NameLabel2Renderer::setFontWgt(const LString &val)
{
  if (m_strFontWgt.equals(val))
    return;

  m_strFontWgt = val;

  // font info was changed --> invalidate all cached data
  invalidateDisplayCache();
}

/// clear all cached data
void NameLabel2Renderer::clearAllLabelPix()
{
  // m_pixCache.invalidateAll();
  BOOST_FOREACH(NameLabel2 &value, *m_pdata) {
    if (value.m_pPixBuf!=NULL)
      delete value.m_pPixBuf;
    value.m_pPixBuf = NULL;
  }  
}

///////////////////////

void NameLabel2Renderer::propChanged(qlib::LPropEvent &ev)
{
  const LString propnm = ev.getName();
  if (propnm.equals("color")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void NameLabel2Renderer::styleChanged(qsys::StyleEvent &ev)
{
  super_t::styleChanged(ev);

  // TO DO: ignore non-relevant styleChanged message
  invalidateDisplayCache();
}

/*
void NameLabel2Renderer::objectChanged(qsys::ObjectEvent &ev)
{
  // Treat changed and changed_dynamic events as the same
  if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED ||
      ev.getType()==qsys::ObjectEvent::OBE_CHANGED_DYNAMIC) {
    invalidateDisplayCache();
  }
  else if (ev.getType()==qsys::ObjectEvent::OBE_PROPCHG) {
    qlib::LPropEvent *pPE = ev.getPropEvent();
    if (pPE && pPE->getName().equals("xformMat")) {
      invalidateDisplayCache();
    }
  }
}
*/

///////////////////////

void NameLabel2Renderer::writeTo2(qlib::LDom2Node *pNode) const
{
  // write properties
  super_t::writeTo2(pNode);

  MolCoordPtr pobj = getClientMol();
  MB_ASSERT(!pobj.isnull());
  
  BOOST_FOREACH(NameLabel2 &value, *m_pdata) {

    LString said = pobj->toStrAID(value.aid);
    if (said.isEmpty())
      continue;

    qlib::LDom2Node *pChNode = pNode->appendChild("label");
    // always in child element
    pChNode->setAttrFlag(false);

    // add atom attribute
    pChNode->appendStrAttr("aid", said);
  }
}

void NameLabel2Renderer::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();

    if (!tag.equals("label")) {
      // error
      continue;
    }

    if (!pChNode->findChild("aid")) {
      // error
      continue;
    }

    LString value = pChNode->getStrAttr("aid");
    if (value.isEmpty()) {
      // error
      continue;
    }
      
    NameLabel2 elem;
    elem.aid = -1;
    elem.strAid = value;

    m_pdata->push_back(elem);
  }
  
}

