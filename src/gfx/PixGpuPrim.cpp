// -*-Mode: C++;-*-
//
// PixGpuPrim implementation
//

#include <common.h>

#include "PixGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>
#include <qsys/View.hpp>

using namespace gfx;

bool PixGpuPrim::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("pixdraw",
                                   "%%CONFDIR%%/data/shaders/pixdraw_vert.glsl",
                                   "%%CONFDIR%%/data/shaders/pixdraw_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("PixGpuPrim> ERROR: cannot load shader.");
        return false;
    }

    alloc();
    return true;
}

void PixGpuPrim::alloc()
{
    m_pDrawElem = MB_NEW QuadArray();
    QuadArray &data = *m_pDrawElem;

    data.setAttrSize(2);
    data.setAttrInfo(0, ATTRLOC_VERTEX, 2, qlib::type_consts::QTC_FLOAT32,
                     offsetof(Elem, x));
    data.setAttrInfo(1, ATTRLOC_TEXCOORD, 2, qlib::type_consts::QTC_FLOAT32,
                     offsetof(Elem, tx));

    data.alloc(4);
    data.setDrawMode(AbstDrawElem::DRAW_TRIANGLE_STRIP);

    data.at(0) = {0.0f, 1.0f, 0.0f, 1.0f};  // top-left
    data.at(1) = {0.0f, 0.0f, 0.0f, 0.0f};  // bottom-left
    data.at(2) = {1.0f, 1.0f, 1.0f, 1.0f};  // top-right
    data.at(3) = {1.0f, 0.0f, 1.0f, 0.0f};  // bottom-right
}

void PixGpuPrim::draw(DisplayContext *pDC, const qlib::Vector4D &pos,
                       const PixelBuffer &pixbuf, const ColorPtr &pcol)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(m_pDrawElem != nullptr);

    auto *pRep = pixbuf.getRep();
    if (pRep == nullptr) {
        MB_DPRINTLN("PixGpuPrim> PixRep is null, skipping draw");
        return;
    }

    auto pView = pDC->getTargetView();
    if (pView == nullptr) {
        MB_DPRINTLN("PixGpuPrim> ERROR: no target view");
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

void PixGpuPrim::invalidate()
{
    if (m_pDrawElem != nullptr) {
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
    m_pPO = nullptr;
}
