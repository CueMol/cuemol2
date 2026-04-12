// -*-Mode: C++;-*-
//
// LineGpuPrim implementations
//

#include <common.h>

#include "LineGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// LineGpuPrim

LineGpuPrim::LineGpuPrim()
    : m_pPO(nullptr),
      m_pDrawAry(nullptr),
      m_linew(1.0f),
      m_bStipple(false),
      m_bNoDepth(false),
      m_bUseVertColor(true)
{
}

LineGpuPrim::~LineGpuPrim()
{
    invalidate();
}

bool LineGpuPrim::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_line",
                                  "%%CONFDIR%%/data/shaders/linew2_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/linew_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("LineGpuPrim> ERROR: cannot load shader.");
        return false;
    }

    m_pPO->initDrawParamsUBO(sizeof(DrawParams));
    MB_DPRINTLN("LineGpuPrim> shader loaded: %p", m_pPO);
    return true;
}

void LineGpuPrim::alloc(int nlines)
{
    MB_ASSERT(m_pPO != nullptr);

    m_pDrawAry = MB_NEW LineArray();
    LineArray &data = *m_pDrawAry;

    data.alloc(nlines);
    data.allocInd(6);
    data.assignInds({0, 1, 2, 2, 1, 3});
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    data.setNumInstances(nlines);
}

void LineGpuPrim::setupAttrs()
{
    MB_ASSERT(m_pDrawAry != nullptr);
    LineArray &data = *m_pDrawAry;

    if (data.getAttrSize() > 0) return;  // already set up

    data.setAttrSize(4);
    data.setAttrInfo(0, ATTRLOC_VERTEX1, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, x1));
    data.setAttrInfo(1, ATTRLOC_VERTEX2, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, x2));
    data.setAttrInfo(2, ATTRLOC_COLOR1, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineElem, r1));
    data.setAttrInfo(3, ATTRLOC_COLOR2, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineElem, r2));

    const int ndiv = 1;
    data.setAttrDivisor(0, ndiv);
    data.setAttrDivisor(1, ndiv);
    data.setAttrDivisor(2, ndiv);
    data.setAttrDivisor(3, ndiv);
}

void LineGpuPrim::setLine(int idx, const qlib::Vector4D &v1, quint32 devcode1,
                           const qlib::Vector4D &v2, quint32 devcode2)
{
    LineElem &elem = m_pDrawAry->at(idx);

    elem.x1 = (qfloat32)v1.x();
    elem.y1 = (qfloat32)v1.y();
    elem.z1 = (qfloat32)v1.z();
    elem.r1 = getRCode(devcode1);
    elem.g1 = getGCode(devcode1);
    elem.b1 = getBCode(devcode1);
    elem.a1 = getACode(devcode1);

    elem.x2 = (qfloat32)v2.x();
    elem.y2 = (qfloat32)v2.y();
    elem.z2 = (qfloat32)v2.z();
    elem.r2 = getRCode(devcode2);
    elem.g2 = getGCode(devcode2);
    elem.b2 = getBCode(devcode2);
    elem.a2 = getACode(devcode2);
}

void LineGpuPrim::draw(DisplayContext *pDC)
{
    if (m_pDrawAry == nullptr || m_pPO == nullptr) return;

    setupAttrs();

    // Get screen size from viewport
    qlib::Vector4D vp = pDC->getViewport();
    float w = (float)vp.z();
    float h = (float)vp.w();
    MB_DPRINTLN("LineGpuPrim> viewport: (%f, %f)", w, h);

    float linew = (m_linew < 0.0f) ? 1.0f : m_linew;
    float stippleLen = m_bStipple ? 8.0f : 0.0f;

    DrawParams ubo = {};
    ubo.frag_alpha  = (float)pDC->getAlpha();
    ubo.lineWidth   = linew;
    ubo.stippleLen  = stippleLen;
    ubo.u_nodepth   = m_bNoDepth ? 1 : 0;
    ubo.screenSize[0] = w;
    ubo.screenSize[1] = h;

    if (!m_bUseVertColor) {
        ubo.use_u_color = 1;
        float r = 0.5f, g = 0.5f, b = 0.5f;
        pDC->getDevRGBColor(pDC->getColor(), r, g, b);
        ubo.u_color[0] = r;
        ubo.u_color[1] = g;
        ubo.u_color[2] = b;
        ubo.u_color[3] = 1.0f;
    }

    m_pPO->enable();
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->updateDrawParamsUBO(&ubo, sizeof(ubo));

    pDC->drawElem(*m_pDrawAry);
    m_pPO->disable();

    MB_DPRINTLN("LineGpuPrim> linew: %f", linew);
}

void LineGpuPrim::invalidate()
{
    if (m_pDrawAry != nullptr) {
        delete m_pDrawAry;
        m_pDrawAry = nullptr;
    }
}
