// -*-Mode: C++;-*-
//
// LineValIdxGpuPrim implementations
//

#include <common.h>

#include "LineValIdxGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "FloatDataTexture.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>

#include <algorithm>

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// LineValIdxGpuPrim

LineValIdxGpuPrim::LineValIdxGpuPrim()
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

LineValIdxGpuPrim::~LineValIdxGpuPrim()
{
    invalidate();
}

bool LineValIdxGpuPrim::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_linevalidx",
                                  "%%CONFDIR%%/data/shaders/linevalidx_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/linew_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("LineValIdxGpuPrim> ERROR: cannot load shader.");
        return false;
    }

    m_pPO->initDrawParamsUBO(sizeof(DrawParams));
    return true;
}

void LineValIdxGpuPrim::alloc(DisplayContext *pDC, int nlines)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(pDC != nullptr);

    m_pDrawAry = MB_NEW LineValArray();
    LineValArray &data = *m_pDrawAry;

    pDC->allocBuffer(data, nlines, 6);
    data.assignInds({0, 1, 2, 2, 1, 3});
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    data.setNumInstances(nlines);
}

void LineValIdxGpuPrim::setupAttrs()
{
    MB_ASSERT(m_pDrawAry != nullptr);
    LineValArray &data = *m_pDrawAry;

    if (data.getAttrSize() > 0) return;  // already set up

    data.setAttrSize(7);
    data.setAttrInfo(0, ATTRLOC_P1, 4, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineValElem, ox1));
    data.setAttrInfo(1, ATTRLOC_P2, 4, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineValElem, ox2));
    data.setAttrInfo(2, ATTRLOC_VAL, 4, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineValElem, t1));
    data.setAttrInfo(3, ATTRLOC_COLOR1, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineValElem, r1));
    data.setAttrInfo(4, ATTRLOC_COLOR2, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineValElem, r2));
    // Hit names: integer attributes consumed by the pick program only.
    data.setAttrInfo(5, ATTRLOC_HITNAME1, 1, qlib::type_consts::QTC_UINT32,
                     offsetof(LineValElem, hitName1));
    data.setAttrInteger(5, true);
    data.setAttrInfo(6, ATTRLOC_HITNAME2, 1, qlib::type_consts::QTC_UINT32,
                     offsetof(LineValElem, hitName2));
    data.setAttrInteger(6, true);

    const int ndiv = 1;
    for (int i = 0; i < 7; ++i) data.setAttrDivisor(i, ndiv);
}

void LineValIdxGpuPrim::setValLine(int i, int idx1, int idx2, float t1, float t2,
                                   float dispScale, int idxd, quint32 dc1,
                                   quint32 dc2, quint32 hitName1, quint32 hitName2)
{
    LineValElem &elem = m_pDrawAry->at(i);
    elem.hitName1 = hitName1;
    elem.hitName2 = hitName2;

    elem.ox1 = 0.0f;
    elem.oy1 = 0.0f;
    elem.oz1 = 0.0f;
    elem.idx1 = (qfloat32)idx1;
    elem.r1 = getRCode(dc1);
    elem.g1 = getGCode(dc1);
    elem.b1 = getBCode(dc1);
    elem.a1 = getACode(dc1);

    elem.ox2 = 0.0f;
    elem.oy2 = 0.0f;
    elem.oz2 = 0.0f;
    elem.idx2 = (qfloat32)idx2;
    elem.r2 = getRCode(dc2);
    elem.g2 = getGCode(dc2);
    elem.b2 = getBCode(dc2);
    elem.a2 = getACode(dc2);

    elem.t1 = t1;
    elem.t2 = t2;
    elem.dispScale = dispScale;
    elem.idxd = (qfloat32)idxd;
}

void LineValIdxGpuPrim::setLine(int i, int idx1, int idx2, float t1, float t2,
                                quint32 dc1, quint32 dc2, quint32 hitName1,
                                quint32 hitName2)
{
    setValLine(i, idx1, idx2, t1, t2, 0.0f, -1, dc1, dc2, hitName1, hitName2);
}

void LineValIdxGpuPrim::setAster(int i, int idx, const qlib::Vector4D &off1,
                                 const qlib::Vector4D &off2, quint32 dc,
                                 quint32 hitName)
{
    LineValElem &elem = m_pDrawAry->at(i);
    elem.hitName1 = hitName;
    elem.hitName2 = hitName;

    elem.ox1 = (qfloat32)off1.x();
    elem.oy1 = (qfloat32)off1.y();
    elem.oz1 = (qfloat32)off1.z();
    elem.idx1 = (qfloat32)idx;
    elem.r1 = getRCode(dc);
    elem.g1 = getGCode(dc);
    elem.b1 = getBCode(dc);
    elem.a1 = getACode(dc);

    elem.ox2 = (qfloat32)off2.x();
    elem.oy2 = (qfloat32)off2.y();
    elem.oz2 = (qfloat32)off2.z();
    elem.idx2 = (qfloat32)idx;
    elem.r2 = getRCode(dc);
    elem.g2 = getGCode(dc);
    elem.b2 = getBCode(dc);
    elem.a2 = getACode(dc);

    elem.t1 = 0.0f;
    elem.t2 = 0.0f;
    elem.dispScale = 0.0f;
    elem.idxd = -1.0f;
}

void LineValIdxGpuPrim::setCoordTex(FloatDataTexture *pTex, int texUnit)
{
    m_pCoordTex = pTex;
    m_nCoordTexUnit = texUnit;
}

void LineValIdxGpuPrim::draw(DisplayContext *pDC)
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

bool LineValIdxGpuPrim::initPick(DisplayContext *pDC)
{
    if (m_pPickPO != nullptr) return true;

    m_pPickPO = pDC->loadShaderObject("gpu_lineval_idx_pick",
                                      "%%CONFDIR%%/data/shaders/linevalidx_pick_vert.glsl",
                                      "%%CONFDIR%%/data/shaders/linew_pick_frag.glsl");
    if (m_pPickPO == nullptr) {
        LOG_DPRINTLN("LineValIdxGpuPrim> ERROR: cannot load pick shader.");
        return false;
    }
    m_pPickPO->initDrawParamsUBO(sizeof(PickDrawParams));
    return true;
}

void LineValIdxGpuPrim::drawPick(DisplayContext *pDC)
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

void LineValIdxGpuPrim::invalidate()
{
    if (m_pDrawAry != nullptr) {
        delete m_pDrawAry;
        m_pDrawAry = nullptr;
    }
    m_pCoordTex = nullptr;
}
