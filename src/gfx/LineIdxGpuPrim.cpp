// -*-Mode: C++;-*-
//
// LineIdxGpuPrim implementations
//

#include <common.h>

#include "LineIdxGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "FloatDataTexture.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>

#include <algorithm>

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// LineIdxGpuPrim

LineIdxGpuPrim::LineIdxGpuPrim()
    : m_pPO(nullptr),
      m_pPickPO(nullptr),
      m_pDrawAry(nullptr),
      m_pCoordTex(nullptr),
      m_nCoordTexUnit(COORD_TEX_UNIT),
      m_linew(1.0f),
      m_bStipple(false),
      m_bNoDepth(false)
{
}

LineIdxGpuPrim::~LineIdxGpuPrim()
{
    invalidate();
}

bool LineIdxGpuPrim::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_lineidx",
                                  "%%CONFDIR%%/data/shaders/linew2idx_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/linew_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("LineIdxGpuPrim> ERROR: cannot load shader.");
        return false;
    }

    m_pPO->initDrawParamsUBO(sizeof(DrawParams));
    return true;
}

void LineIdxGpuPrim::alloc(DisplayContext *pDC, int nlines)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(pDC != nullptr);

    m_pDrawAry = MB_NEW LineIdxArray();
    LineIdxArray &data = *m_pDrawAry;

    pDC->allocBuffer(data, nlines, 6);
    data.assignInds({0, 1, 2, 2, 1, 3});
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    data.setNumInstances(nlines);
}

void LineIdxGpuPrim::setupAttrs()
{
    MB_ASSERT(m_pDrawAry != nullptr);
    LineIdxArray &data = *m_pDrawAry;

    if (data.getAttrSize() > 0) return;  // already set up

    data.setAttrSize(6);
    data.setAttrInfo(0, ATTRLOC_P1, 4, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineIdxElem, ox1));
    data.setAttrInfo(1, ATTRLOC_P2, 4, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineIdxElem, ox2));
    data.setAttrInfo(2, ATTRLOC_COLOR1, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineIdxElem, r1));
    data.setAttrInfo(3, ATTRLOC_COLOR2, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineIdxElem, r2));
    // Hit names: integer attributes consumed by the pick program only.
    data.setAttrInfo(4, ATTRLOC_HITNAME1, 1, qlib::type_consts::QTC_UINT32,
                     offsetof(LineIdxElem, hitName1));
    data.setAttrInteger(4, true);
    data.setAttrInfo(5, ATTRLOC_HITNAME2, 1, qlib::type_consts::QTC_UINT32,
                     offsetof(LineIdxElem, hitName2));
    data.setAttrInteger(5, true);

    const int ndiv = 1;
    for (int i = 0; i < 6; ++i) data.setAttrDivisor(i, ndiv);
}

void LineIdxGpuPrim::setData(int i, int idx1, const qlib::Vector4D &off1,
                             quint32 devcode1, int idx2,
                             const qlib::Vector4D &off2, quint32 devcode2,
                             quint32 hitName1, quint32 hitName2)
{
    LineIdxElem &elem = m_pDrawAry->at(i);

    elem.ox1 = (qfloat32)off1.x();
    elem.oy1 = (qfloat32)off1.y();
    elem.oz1 = (qfloat32)off1.z();
    elem.idx1 = (qfloat32)idx1;
    elem.r1 = getRCode(devcode1);
    elem.g1 = getGCode(devcode1);
    elem.b1 = getBCode(devcode1);
    elem.a1 = getACode(devcode1);

    elem.ox2 = (qfloat32)off2.x();
    elem.oy2 = (qfloat32)off2.y();
    elem.oz2 = (qfloat32)off2.z();
    elem.idx2 = (qfloat32)idx2;
    elem.r2 = getRCode(devcode2);
    elem.g2 = getGCode(devcode2);
    elem.b2 = getBCode(devcode2);
    elem.a2 = getACode(devcode2);

    elem.hitName1 = hitName1;
    elem.hitName2 = hitName2;
}

void LineIdxGpuPrim::setCoordTex(FloatDataTexture *pTex, int texUnit)
{
    m_pCoordTex = pTex;
    m_nCoordTexUnit = texUnit;
}

void LineIdxGpuPrim::draw(DisplayContext *pDC)
{
    if (m_pDrawAry == nullptr || m_pPO == nullptr) return;
    if (m_pCoordTex == nullptr) return;

    setupAttrs();

    if (pDC->isPickDraw()) {
        drawPick(pDC);
        return;
    }

    qlib::Vector4D vp = pDC->getViewport();
    float w = (float)vp.z();
    float h = (float)vp.w();

    float linew = (m_linew < 0.0f) ? 1.0f : m_linew;
    float stippleLen = m_bStipple ? 8.0f : 0.0f;

    DrawParams ubo = {};
    ubo.frag_alpha  = (float)pDC->getAlpha();
    ubo.lineWidth   = linew;
    ubo.stippleLen  = stippleLen;
    ubo.u_nodepth   = m_bNoDepth ? 1 : 0;
    ubo.screenSize[0] = w;
    ubo.screenSize[1] = h;

    m_pPO->enable();
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->updateDrawParamsUBO(&ubo, sizeof(ubo));

    m_pCoordTex->bind(m_nCoordTexUnit);
    m_pPO->setUniform("u_coordTex", m_nCoordTexUnit);

    pDC->drawElem(*m_pDrawAry);

    m_pCoordTex->unbind();
    m_pPO->disable();
}

bool LineIdxGpuPrim::initPick(DisplayContext *pDC)
{
    if (m_pPickPO != nullptr) return true;

    m_pPickPO = pDC->loadShaderObject("gpu_line_idx_pick",
                                      "%%CONFDIR%%/data/shaders/linew2idx_pick_vert.glsl",
                                      "%%CONFDIR%%/data/shaders/linew_pick_frag.glsl");
    if (m_pPickPO == nullptr) {
        LOG_DPRINTLN("LineIdxGpuPrim> ERROR: cannot load pick shader.");
        return false;
    }
    m_pPickPO->initDrawParamsUBO(sizeof(PickDrawParams));
    return true;
}

void LineIdxGpuPrim::drawPick(DisplayContext *pDC)
{
    if (!initPick(pDC)) return;

    qlib::Vector4D vp = pDC->getViewport();
    float linew = (m_linew < 0.0f) ? 1.0f : m_linew;
    linew = std::max(linew * float(pDC->getPickScale()), 1.5f);

    PickDrawParams ubo = {};
    ubo.base.lineWidth     = linew;
    ubo.base.u_nodepth     = m_bNoDepth ? 1 : 0;
    ubo.base.screenSize[0] = (float)vp.z();
    ubo.base.screenSize[1] = (float)vp.w();
    ubo.u_rend_idx         = pDC->getHitRendIndex();
    ubo.u_outer_name       = encodeHitName(pDC->getOuterName());

    m_pPickPO->enable();
    m_pPickPO->setupMat(pDC);
    m_pPickPO->updateDrawParamsUBO(&ubo, sizeof(ubo));

    m_pCoordTex->bind(m_nCoordTexUnit);
    m_pPickPO->setUniform("u_coordTex", m_nCoordTexUnit);

    pDC->drawElem(*m_pDrawAry);

    m_pCoordTex->unbind();
    m_pPickPO->disable();
}

void LineIdxGpuPrim::invalidate()
{
    if (m_pDrawAry != nullptr) {
        delete m_pDrawAry;
        m_pDrawAry = nullptr;
    }
    m_pCoordTex = nullptr;
}
