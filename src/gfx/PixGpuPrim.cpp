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

namespace {

// PixGpuPrim DrawParamsBlock (binding=2, 64 bytes)
struct PixDrawUBO {
    float frag_alpha;       // offset 0
    float _p1, _p2, _p3;   // offset 4, 8, 12 (padding for vec3 alignment)
    float u_position[3];    // offset 16
    float _p4;              // offset 28
    float u_size[2];        // offset 32
    float u_viewportSize[2];// offset 40
    float u_colorBias[3];   // offset 48
    float _p5;              // offset 60
};

}  // namespace

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

    m_pPO->initDrawParamsUBO(sizeof(PixDrawUBO));
    alloc(pDC);
    return true;
}

void PixGpuPrim::alloc(DisplayContext *pDC)
{
    MB_ASSERT(pDC != nullptr);

    m_pDrawElem = MB_NEW QuadArray();
    QuadArray &data = *m_pDrawElem;

    data.setAttrSize(2);
    data.setAttrInfo(0, ATTRLOC_VERTEX, 2, qlib::type_consts::QTC_FLOAT32,
                     offsetof(Elem, x));
    data.setAttrInfo(1, ATTRLOC_TEXCOORD, 2, qlib::type_consts::QTC_FLOAT32,
                     offsetof(Elem, tx));

    pDC->allocBuffer(data, 4, 0);
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

    PixDrawUBO ubo = {};
    ubo.frag_alpha      = (float)pDC->getAlpha();
    ubo.u_position[0]   = (float)pos.x();
    ubo.u_position[1]   = (float)pos.y();
    ubo.u_position[2]   = (float)pos.z();
    ubo.u_size[0]       = float(w);
    ubo.u_size[1]       = float(h);
    ubo.u_viewportSize[0] = view_w;
    ubo.u_viewportSize[1] = view_h;
    ubo.u_colorBias[0]  = r;
    ubo.u_colorBias[1]  = g;
    ubo.u_colorBias[2]  = b;

    pRep->bind(0);

    m_pPO->enable();
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->updateDrawParamsUBO(&ubo, sizeof(ubo));
    // u_texture is a sampler2D; must remain as a regular uniform
    m_pPO->setUniform("u_texture", 0);

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
