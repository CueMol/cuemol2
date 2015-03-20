// -*-Mode: C++;-*-
//
//  Name label renderer class
//
// $Id: NameLabelRenderer.cpp,v 1.15 2011/05/02 14:51:29 rishitani Exp $

#include <common.h>
#include "SimpleTextRenderer.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>

#include <gfx/PixelBuffer.hpp>
#include <gfx/TextRenderManager.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

using namespace molvis;
using molstr::MolAtomPtr;

SimpleTextRenderer::SimpleTextRenderer()
     : super_t()
{
  m_nSizeUnit = TR_UNIT_PIXEL;
}

SimpleTextRenderer::~SimpleTextRenderer()
{
}

//////////////////////////////////////////////////////////////////////////

MolCoordPtr SimpleTextRenderer::getClientMol() const
{
  qsys::ObjectPtr robj = qsys::SceneManager::getObjectS(getClientObjID());
  if (robj.isnull()) return MolCoordPtr();
  return MolCoordPtr(robj);
}

bool SimpleTextRenderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  MolCoord *ptest = dynamic_cast<MolCoord *>(pobj.get());
  return ptest!=NULL;
}

LString SimpleTextRenderer::toString() const
{
  return LString::format("SimpleTextRenderer %p", this);
}

//////////////////////////////////////////////////////////////////////////

void SimpleTextRenderer::render(DisplayContext *pdc)
{
  if (m_pixbuf.isEmpty()) {
    gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
    if (pTRM==NULL) {
      MB_DPRINTLN("SimpleTextRenderer.render> Fatal error, cannot get TextRenderMgr");
      return;
    }
    
    double scl = pdc->getPixSclFac();
    pTRM->setupFont(getFontSize() * scl, getFontName(),
		    getFontStyle(), getFontWgt(),
		    getColor(), m_outlSize, m_outlColor);
    
    if (!pTRM->renderText(m_strLabel, m_pixbuf)) {
      MB_DPRINTLN("SimpleTextRenderer.render> Fatal error, renderText() failed");
      return;
    }
    // m_pixbuf.dump();
  }

  Vector4D pos;
  if (!getLabelPos(pos)) {
    MB_DPRINTLN("SimpleTextRenderer.render> Fatal error, cannot get label pos");
    return;
  }

  pdc->drawPixels(pos, m_pixbuf, ColorPtr());
}

Vector4D SimpleTextRenderer::getCenter() const
{
  Vector4D rval;
  if (getLabelPos(rval))
    return rval;

  return Vector4D(); // ERROR!!
}

/*bool SimpleTextRenderer::isHitTestSupported() const
{
  return false;
  }*/

const char *SimpleTextRenderer::getTypeName() const
{
  return "stext";
}

///////////

void SimpleTextRenderer::invalidatePixCache()
{
  m_pixbuf.clear();
}

MolAtomPtr SimpleTextRenderer::getTargetAtom() const
{
  MolCoordPtr pobj = ensureNotNull( getClientMol() );
  
  int aid = pobj->fromStrAID(m_strTgtAID);
  if (aid<0)
    return MolAtomPtr();

  return pobj->getAtom(aid);
}

bool SimpleTextRenderer::getLabelPos(Vector4D &res) const
{
  MolAtomPtr pAtom = getTargetAtom();
  if (pAtom.isnull())
    return false;

  res = pAtom->getPos();
  return true;
}

bool SimpleTextRenderer::makeLabelStr()
{
  MolAtomPtr pAtom = getTargetAtom();
  if (pAtom.isnull())
    return false;

  /*
  LString sbuf = pAtom->getChainName() + " " +
      pAtom->getResName() +
        pAtom->getResIndex().toString() + " " +
          pAtom->getName();
    char confid = pAtom->getConfID();
    if (confid)
      sbuf += LString(":") + LString(confid);
    
    rstrlab = sbuf; //.toUpperCase();
  }
  */

  return true;
}

