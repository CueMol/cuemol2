// -*-Mode: C++;-*-
//
//  Name label renderer class (ver. 2) using GLSL
//

#include <common.h>
#include "GLSLNameLabel2Renderer.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/Texture.hpp>
#include <qsys/SceneManager.hpp>

//#include <sysdep/OglShaderSetupHelper.hpp>

using namespace molstr;

GLSLNameLabel2Renderer::GLSLNameLabel2Renderer()
     : super_t()
{
  // m_pPO = NULL;
  // m_pAttrAry = NULL;
  // m_pLabelTex = NULL;
  setForceGLSL(true);

  m_dPixPerAng = 10.0;
}

GLSLNameLabel2Renderer::~GLSLNameLabel2Renderer()
{
}

//////////////////////////////////////////////////////////////////////////

LString GLSLNameLabel2Renderer::toString() const
{
  return LString::format("GLSLNameLabel2Renderer %p", this);
}

//////////////////////////////////////////////////////
// Ver. 2 interface implementations

void GLSLNameLabel2Renderer::renderVBO(DisplayContext *pdc)
{
  super_t::render(pdc);
}

/// Invalidate the display cache
void GLSLNameLabel2Renderer::invalidateDisplayCache()
{
  // Clean-up GLSL related data
  m_glsllabel.invalidate();

  // // clean-up internal data
  // clearAllLabelPix();

  // clean-up display list (if exists; in compatible mode)
  super_t::invalidateDisplayCache();
}

/// Use ver2 interface (--> return true)
bool GLSLNameLabel2Renderer::isUseVer2Iface() const
{
  return true;
}

/// Initialize & setup capabilities (for glsl setup)
bool GLSLNameLabel2Renderer::init(DisplayContext *pdc)
{
  bool bres = m_glsllabel.initShader(this);
  if (!bres) {
    setShaderAvail(false);
    return false;
  }

  setShaderAvail(true);
  return true;
}
    
void GLSLNameLabel2Renderer::createGLSL()
{
  int nlab = m_pdata->size();
  if (nlab>0) {
    m_glsllabel.alloc(nlab);
  }
}

bool GLSLNameLabel2Renderer::isCacheAvail() const
{
  return m_glsllabel.isAvailable();
}

/// Render to display (using GLSL)
void GLSLNameLabel2Renderer::renderGLSL(DisplayContext *pdc)
{
  if (m_pdata->empty())
    return;
  
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

  if (!m_glsllabel.isPixDataAvail())
    createTextureData(pdc, sclx, scly);
  
  // Determine ppa
  float ppa = -1.0f;
  if (isScaling())
    ppa = float(m_dPixPerAng);

  m_glsllabel.draw(pdc, width, height, ppa, getSceneID());
}

void GLSLNameLabel2Renderer::createTextureData(DisplayContext *pdc, float asclx, float scly)
{
  int nlab = m_pdata->size();
  if (nlab==0)
    return;
  
  float sclx = asclx;
  
  if (isScaling()) {
    qsys::View *pView = pdc->getTargetView();
    if (pView!=NULL) {
      const double h = pView->getHeight();
      const double zoom = pView->getZoom();
      // estimate the scaling factor (PPA) from zoom factor
      m_dPixPerAng = h/zoom;
      sclx *= m_dPixPerAng;
    }
  }

  // Render label pixbuf
  {
    LString strlab;
    for (NameLabel2 &lab : *m_pdata) {
      if (lab.m_pPixBuf==NULL) {
        strlab = makeLabelStr(lab);
        //strlab = "A";
        lab.m_pPixBuf = createPixBuf(sclx, strlab);
      }
    }
  }

  // Calculate pixdata index
  int npix = 0;
  std::vector<int> pixaddr(nlab);
  {
    int i=0;
    for (const NameLabel2 &lab : *m_pdata) {
      gfx::PixelBuffer *ppb = lab.m_pPixBuf;
      if (ppb==NULL) {
        MB_ASSERT(false);
        continue;
      }
      
      pixaddr[i] = npix;
      const int width = ppb->getWidth();
      const int height = ppb->getHeight();
      npix += width * height;

      if (isScaling()) {
        // update the scaling factor (PPA) using the actual text dimension
        m_dPixPerAng = height/getFontSize();
      }

      ++i;
    }
  }
  
  m_glsllabel.createPixBuf(npix);
  
  {
    GLSLLabelHelper::PixBuf &pixall = m_glsllabel.getPixBuf();
    npix = 0;
    int j;
    for (const NameLabel2 &lab : *m_pdata) {
      gfx::PixelBuffer *ppb = lab.m_pPixBuf;
      if (ppb==NULL) {
        MB_ASSERT(false);
        continue;
      }
      
      const int width = ppb->getWidth();
      const int height = ppb->getHeight();

      for (j=0; j<width*height; ++j) {
        pixall[j+npix] = ppb->at(j);
      }

      npix += width * height;
    }
  }

  m_glsllabel.setTexData();

  const float dispx = float(getXDispl());
  const float dispy = float(getYDispl());
  
  const double th = qlib::toRadian(getRotTh());
  const double costh = cos(th);
  const double sinth = sin(th);

  auto pa = m_glsllabel.getDrawElem();
  {
    int i=0, j;
    LString strlab;
    Vector4D pos;
    for (const NameLabel2 &lab : *m_pdata) {
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
        //pa->at(ive+j).x = qfloat32( pos.x() );
        //pa->at(ive+j).y = qfloat32( pos.y() );
        //pa->at(ive+j).z = qfloat32( pos.z() );
        pa->at(ive+j).width = width;
        pa->at(ive+j).addr = float( pixaddr[i] );

        //pa->at(ive+j).nx = 1.0f;
        //pa->at(ive+j).ny = 0.0f;
        
        pa->at(ive+j).nx = costh;
        pa->at(ive+j).ny = sinth;
      }
      
      pa->at(ive+0).w = dispx;
      pa->at(ive+0).h = dispy;

      pa->at(ive+1).w = dispx + width;
      pa->at(ive+1).h = dispy;

      pa->at(ive+2).w = dispx;
      pa->at(ive+2).h = dispy + height;

      pa->at(ive+3).w = dispx + width;
      pa->at(ive+3).h = dispy + height;

      ++i;

    } // for (const NameLabel2 &lab : *m_pdata)

  }

  // LOG_DPRINTLN("GLSLNameLabel2> %d labels (%d pix tex) created", nlab, npix);
}

void GLSLNameLabel2Renderer::updateStaticGLSL()
{
  if (m_pdata->empty())
    return;
  
  int i=0, j;
  LString strlab;
  Vector4D pos;
  MolAtomPtr pA;
  MolCoordPtr pMol = getClientMol();

  auto pa = m_glsllabel.getDrawElem();

  for (NameLabel2 &lab : *m_pdata) {
    if (lab.aid<0) {
      makeLabelStr(lab);
    }

    pA = pMol->getAtom(lab.aid);
    if (pA.isnull())
      continue;

    Vector4D pos = pA->getPos();

    const int ive = i*4;
    // const int ifc = i*6;

    // vertex data
    for (j=0; j<4; ++j) {
      pa->at(ive+j).x = qfloat32( pos.x() );
      pa->at(ive+j).y = qfloat32( pos.y() );
      pa->at(ive+j).z = qfloat32( pos.z() );
    }

    ++i;
  }

  pa->setUpdated(true);
}

void GLSLNameLabel2Renderer::updateDynamicGLSL()
{
  updateStaticGLSL();
}

void GLSLNameLabel2Renderer::setRotTh(double th)
{
  m_dRotTh = th;

  int nlab = m_pdata->size();
  if (nlab==0)
    return;

  // texture, attr not ready --> not update data
  //  if (!m_glsllabel.isPixDataAvail())
  if (!m_glsllabel.isAvailable())
    return;

  // texture, attr are ready --> update existing attr
  auto pa = m_glsllabel.getDrawElem();

  int i, j;

  const double rth = qlib::toRadian(m_dRotTh);
  const double costh = cos(rth);
  const double sinth = sin(rth);

  for (i=0; i<nlab; ++i) {
    const int ive = i*4;

    // vertex data
    for (j=0; j<4; ++j) {
      pa->at(ive+j).nx = costh;
      pa->at(ive+j).ny = sinth;
    }
  }

  pa->setUpdated(true);
}

void GLSLNameLabel2Renderer::setColor(const gfx::ColorPtr &pcol)
{
  m_glsllabel.m_pcolor = pcol;
  super_t::setColor(pcol);
}

