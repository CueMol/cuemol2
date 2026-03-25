// -*-Mode: C++;-*-
//
// PixDrawObj2 implementation
//

#include <common.h>

#include "PixDrawObj2.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>
#include <qsys/View.hpp>

using namespace gfx;

bool PixDrawObj2::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("pixdraw",
                                   "%%CONFDIR%%/data/shaders/pixdraw_vert.glsl",
                                   "%%CONFDIR%%/data/shaders/pixdraw_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("PixDrawObj2> ERROR: cannot load shader.");
        return false;
    }

    m_nVertexLoc = m_pPO->getAttribLocation("a_vertex");
    m_nTexCoordLoc = m_pPO->getAttribLocation("a_texCoord");
    MB_DPRINTLN("PixDrawObj2> a_vertex loc=%d, a_texCoord loc=%d",
                m_nVertexLoc, m_nTexCoordLoc);

    alloc();
    return true;
}

void PixDrawObj2::alloc()
{
    m_pDrawElem = MB_NEW QuadArray();
    QuadArray &data = *m_pDrawElem;

    data.setAttrSize(2);
    data.setAttrInfo(0, m_nVertexLoc, 2, qlib::type_consts::QTC_FLOAT32,
                     offsetof(Elem, x));
    data.setAttrInfo(1, m_nTexCoordLoc, 2, qlib::type_consts::QTC_FLOAT32,
                     offsetof(Elem, tx));

    data.alloc(4);
    data.setDrawMode(AbstDrawElem::DRAW_TRIANGLE_STRIP);

    data.at(0) = {0.0f, 1.0f, 0.0f, 1.0f};  // top-left
    data.at(1) = {0.0f, 0.0f, 0.0f, 0.0f};  // bottom-left
    data.at(2) = {1.0f, 1.0f, 1.0f, 1.0f};  // top-right
    data.at(3) = {1.0f, 0.0f, 1.0f, 0.0f};  // bottom-right
}

void PixDrawObj2::draw(DisplayContext *pDC, const qlib::Vector4D &pos,
                       const PixelBuffer &pixbuf, const ColorPtr &pcol)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(m_pDrawElem != nullptr);

    auto *pRep = pixbuf.getRep();
    if (pRep == nullptr) {
        MB_DPRINTLN("PixDrawObj2> PixRep is null, skipping draw");
        return;
    }

    auto pView = pDC->getTargetView();
    if (pView == nullptr) {
        MB_DPRINTLN("PixDrawObj2> ERROR: no target view");
        return;
    }

    const int w = pixbuf.getWidth();
    const int h = pixbuf.getHeight();

    float r = 1.0f, g = 1.0f, b = 1.0f;
    pDC->getDevRGBColor(pcol, r, g, b);

    float view_w = pView->convToBackingX(pView->getWidth());
    float view_h = pView->convToBackingY(pView->getHeight());

    pRep->bind(0);

    m_pPO->enable();
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->setUniformF("frag_alpha", pDC->getAlpha());
    m_pPO->setUniformF("u_position", pos.x(), pos.y(), pos.z());
    m_pPO->setUniformF("u_size", float(w), float(h));
    m_pPO->setUniformF("u_viewportSize", view_w, view_h);
    m_pPO->setUniformF("u_colorBias", r, g, b);
    m_pPO->setUniformF("u_texture", 0);

    pDC->drawElem(*m_pDrawElem);

    m_pPO->disable();

    pRep->unbind();
}

void PixDrawObj2::invalidate()
{
    if (m_pDrawElem != nullptr) {
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
    m_pPO = nullptr;
}
