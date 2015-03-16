// -*-Mode: C++;-*-
//
//  Abstract text renderer class
//

#include <common.h>
#include "TextRenderer.hpp"

using namespace molstr;

TextRenderer::TextRenderer()
     : super_t()
{
  m_strFontStyle = "normal";
  m_strFontWgt = "normal";
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
    pview->convXYTrans(m_offset.x(), m_offset.y(), dv);

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

void NameLabelRenderer::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  LString value = pChNode->getStrAttr("dispx");
  if (!value.isEmpty()) {
    double d;
    if (value.toRealNum(&d))
      m_offset.x() = d;
  }

  LString value = pChNode->getStrAttr("dispy");
  if (!value.isEmpty()) {
    double d;
    if (value.toRealNum(&d))
      m_offset.y() = d;
  }

}
