// -*-Mode: C++;-*-
//
//  Abstract text renderer class
//

#include <common.h>
#include "TextRenderer.hpp"

#include <qlib/LDOM2Tree.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

using namespace molstr;

TextRenderer::TextRenderer()
     : super_t()
{
  m_strFontStyle = "normal";
  m_strFontWgt = "normal";
  m_nOfsUnit = TR_UNIT_PIXEL;
}

TextRenderer::~TextRenderer()
{
}

//////////////////////////////////////////////////////////////////////////

void TextRenderer::display(DisplayContext *pdc)
{
  if (pdc->isFile()) {
    preRender(pdc);
    render(pdc);
    postRender(pdc);
  }
}

void TextRenderer::displayLabels(DisplayContext *pdc)
{
  if (!pdc->isFile()) {
    preRender(pdc);
    render(pdc);
    postRender(pdc);
  }
}

void TextRenderer::preRender(DisplayContext *pdc)
{
  Vector4D dv;
  qsys::View *pview = pdc->getTargetView();
  if (pview!=NULL)
    pview->convTrans(m_offset, dv,
		     (m_nOfsUnit==TR_UNIT_PIXEL)?true:false);

  pdc->enableDepthTest(false);

  pdc->pushMatrix();
  pdc->translate(dv);

  pdc->setLighting(false);
}

void TextRenderer::postRender(DisplayContext *pdc)
{
  pdc->popMatrix();
  pdc->enableDepthTest(true);
}

bool TextRenderer::isHitTestSupported() const
{
  return false;
}

bool TextRenderer::isTransp() const
{
  return true;
}

void TextRenderer::setColor(const ColorPtr &rc)
{
  m_color = rc;

  qsys::ScenePtr pScene = getScene();
  if (!pScene.isnull())
    pScene->setUpdateFlag();
}

void TextRenderer::styleChanged(qsys::StyleEvent &ev)
{
  super_t::styleChanged(ev);
  invalidatePixCache();

  // qsys::ScenePtr pScene = getScene();
  // if (!pScene.isnull())
  //  pScene->setUpdateFlag();
}

void TextRenderer::setDispX(double rc)
{
  m_offset.x() = rc;
  setDefaultPropFlag("offset", false);
}

void TextRenderer::setDispY(double rc)
{
  m_offset.y() = -rc;
  setDefaultPropFlag("offset", false);
}

void TextRenderer::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  LString value;
  value = pNode->getStrAttr("dispx");
  if (!value.isEmpty()) {
    double d;
    if (value.toRealNum(&d))
      setDispX(d);
  }

  value = pNode->getStrAttr("dispy");
  if (!value.isEmpty()) {
    double d;
    if (value.toRealNum(&d))
      setDispY(d);
  }

}
