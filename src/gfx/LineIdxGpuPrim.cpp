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

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// LineIdxGpuPrim

LineIdxGpuPrim::LineIdxGpuPrim()
    : m_pPO(nullptr),
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

    data.setAttrSize(4);
    data.setAttrInfo(0, ATTRLOC_P1, 4, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineIdxElem, ox1));
    data.setAttrInfo(1, ATTRLOC_P2, 4, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineIdxElem, ox2));
    data.setAttrInfo(2, ATTRLOC_COLOR1, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineIdxElem, r1));
    data.setAttrInfo(3, ATTRLOC_COLOR2, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineIdxElem, r2));

    const int ndiv = 1;
    data.setAttrDivisor(0, ndiv);
    data.setAttrDivisor(1, ndiv);
    data.setAttrDivisor(2, ndiv);
    data.setAttrDivisor(3, ndiv);
}

void LineIdxGpuPrim::setData(int i, int idx1, const qlib::Vector4D &off1,
                             quint32 devcode1, int idx2,
                             const qlib::Vector4D &off2, quint32 devcode2)
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

void LineIdxGpuPrim::invalidate()
{
    if (m_pDrawAry != nullptr) {
        delete m_pDrawAry;
        m_pDrawAry = nullptr;
    }
    m_pCoordTex = nullptr;
}
