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

#include <algorithm>

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// LineGpuPrim

LineGpuPrim::LineGpuPrim()
    : m_pPO(nullptr),
      m_pPickPO(nullptr),
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

void LineGpuPrim::alloc(DisplayContext *pDC, int nlines)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(pDC != nullptr);

    m_pDrawAry = MB_NEW LineArray();
    LineArray &data = *m_pDrawAry;

    pDC->allocBuffer(data, nlines, 6);
    data.assignInds({0, 1, 2, 2, 1, 3});
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    data.setNumInstances(nlines);
}

void LineGpuPrim::setupAttrs()
{
    MB_ASSERT(m_pDrawAry != nullptr);
    LineArray &data = *m_pDrawAry;

    if (data.getAttrSize() > 0) return;  // already set up

    data.setAttrSize(6);
    data.setAttrInfo(0, ATTRLOC_VERTEX1, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, x1));
    data.setAttrInfo(1, ATTRLOC_VERTEX2, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, x2));
    data.setAttrInfo(2, ATTRLOC_COLOR1, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineElem, r1));
    data.setAttrInfo(3, ATTRLOC_COLOR2, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineElem, r2));
    // Hit names: integer attributes consumed by the pick program only.
    data.setAttrInfo(4, ATTRLOC_HITNAME1, 1, qlib::type_consts::QTC_UINT32,
                     offsetof(LineElem, hitName1));
    data.setAttrInteger(4, true);
    data.setAttrInfo(5, ATTRLOC_HITNAME2, 1, qlib::type_consts::QTC_UINT32,
                     offsetof(LineElem, hitName2));
    data.setAttrInteger(5, true);

    const int ndiv = 1;
    for (int i = 0; i < 6; ++i) data.setAttrDivisor(i, ndiv);
}

void LineGpuPrim::setLine(int idx, const qlib::Vector4D &v1, quint32 devcode1,
                           const qlib::Vector4D &v2, quint32 devcode2)
{
    setLine(idx, v1, devcode1, v2, devcode2, 0u, 0u);
}

void LineGpuPrim::setLine(int idx, const qlib::Vector4D &v1, quint32 devcode1,
                           const qlib::Vector4D &v2, quint32 devcode2,
                           quint32 hitName1, quint32 hitName2)
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

    elem.hitName1 = hitName1;
    elem.hitName2 = hitName2;
}

void LineGpuPrim::draw(DisplayContext *pDC)
{
    if (m_pDrawAry == nullptr || m_pPO == nullptr) return;

    setupAttrs();

    if (pDC->isPickDraw()) {
        drawPick(pDC);
        return;
    }

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

bool LineGpuPrim::initPick(DisplayContext *pDC)
{
    if (m_pPickPO != nullptr) return true;

    m_pPickPO = pDC->loadShaderObject("gpu_line_pick",
                                      "%%CONFDIR%%/data/shaders/linew2_pick_vert.glsl",
                                      "%%CONFDIR%%/data/shaders/linew_pick_frag.glsl");
    if (m_pPickPO == nullptr) {
        LOG_DPRINTLN("LineGpuPrim> ERROR: cannot load pick shader.");
        return false;
    }
    m_pPickPO->initDrawParamsUBO(sizeof(PickDrawParams));
    return true;
}

void LineGpuPrim::drawPick(DisplayContext *pDC)
{
    if (!initPick(pDC)) return;

    // The viewport is the (downscaled) pick target while picking.
    qlib::Vector4D vp = pDC->getViewport();

    float linew = (m_linew < 0.0f) ? 1.0f : m_linew;
    // Scale to pick texels; keep at least 1.5 texels so a thin line still
    // covers texel centres in the downscaled target.
    linew = std::max(linew * float(pDC->getPickScale()), 1.5f);

    PickDrawParams ubo = {};
    ubo.base.lineWidth     = linew;
    ubo.base.stippleLen    = 0.0f;
    ubo.base.u_nodepth     = m_bNoDepth ? 1 : 0;
    ubo.base.screenSize[0] = (float)vp.z();
    ubo.base.screenSize[1] = (float)vp.w();
    ubo.u_rend_idx         = pDC->getHitRendIndex();
    ubo.u_outer_name       = encodeHitName(pDC->getOuterName());

    m_pPickPO->enable();
    m_pPickPO->setupMat(pDC);
    m_pPickPO->updateDrawParamsUBO(&ubo, sizeof(ubo));

    pDC->drawElem(*m_pDrawAry);
    m_pPickPO->disable();
}

void LineGpuPrim::invalidate()
{
    if (m_pDrawAry != nullptr) {
        delete m_pDrawAry;
        m_pDrawAry = nullptr;
    }
}
