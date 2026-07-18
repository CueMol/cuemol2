// -*-Mode: C++;-*-
//
// SphereIdxGpuPrim implementations
//

#include <common.h>

#include "SphereIdxGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "FloatDataTexture.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// SphereIdxGpuPrim

SphereIdxGpuPrim::SphereIdxGpuPrim()
    : m_pPO(nullptr),
      m_pDrawElem(nullptr),
      m_pCoordTex(nullptr),
      m_nCoordTexUnit(COORD_TEX_UNIT)
{
    m_dsps[0][0] = -1.0f;
    m_dsps[0][1] = -1.0f;
    m_dsps[1][0] = 1.0f;
    m_dsps[1][1] = -1.0f;
    m_dsps[2][0] = -1.0f;
    m_dsps[2][1] = 1.0f;
    m_dsps[3][0] = 1.0f;
    m_dsps[3][1] = 1.0f;
}

SphereIdxGpuPrim::~SphereIdxGpuPrim()
{
    invalidate();
}

bool SphereIdxGpuPrim::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_sphere2idx",
                                  "%%CONFDIR%%/data/shaders/sphere2idx_vertex.glsl",
                                  "%%CONFDIR%%/data/shaders/sphere_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("SphereIdxGpuPrim> ERROR: cannot load shader.");
        return false;
    }

    m_pPO->initDrawParamsUBO(sizeof(DrawParams));
    return true;
}

void SphereIdxGpuPrim::alloc(DisplayContext *pDC, int nsph)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(pDC != nullptr);

    auto *pdata = MB_NEW SphIdxElemAry32();
    m_pDrawElem = pdata;
    SphIdxElemAry32 &sphdata = *pdata;

    sphdata.setAttrSize(4);
    sphdata.setAttrInfo(0, ATTRLOC_INDEX, 1, qlib::type_consts::QTC_FLOAT32,
                        offsetof(SphIdxElem, index));
    sphdata.setAttrInfo(1, ATTRLOC_IMPOS, 2, qlib::type_consts::QTC_FLOAT32,
                        offsetof(SphIdxElem, dspx));
    sphdata.setAttrInfo(2, ATTRLOC_RAD, 1, qlib::type_consts::QTC_FLOAT32,
                        offsetof(SphIdxElem, rad));
    sphdata.setAttrInfo(3, ATTRLOC_COLOR, 4, qlib::type_consts::QTC_UINT8,
                        offsetof(SphIdxElem, r));

    pDC->allocBuffer(sphdata, nsph * 4, nsph * 6);
    sphdata.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
}

void SphereIdxGpuPrim::setData(int i, int idx, float rad, quint32 devcode)
{
    int iv = i * 4;
    int ifc = i * 6;

    SphIdxElemAry32 &sphdata = *m_pDrawElem;
    SphIdxElem data;

    data.index = (qfloat32)idx;
    data.rad = rad;
    data.r = getRCode(devcode);
    data.g = getGCode(devcode);
    data.b = getBCode(devcode);
    data.a = getACode(devcode);

    sphdata.atind(ifc) = iv + 0;
    ++ifc;
    sphdata.atind(ifc) = iv + 1;
    ++ifc;
    sphdata.atind(ifc) = iv + 2;
    ++ifc;
    sphdata.atind(ifc) = iv + 2;
    ++ifc;
    sphdata.atind(ifc) = iv + 1;
    ++ifc;
    sphdata.atind(ifc) = iv + 3;

    for (int j = 0; j < 4; ++j) {
        sphdata.at(iv) = data;
        sphdata.at(iv).dspx = m_dsps[j][0];
        sphdata.at(iv).dspy = m_dsps[j][1];
        ++iv;
    }
}

void SphereIdxGpuPrim::setCoordTex(FloatDataTexture *pTex, int texUnit)
{
    m_pCoordTex = pTex;
    m_nCoordTexUnit = texUnit;
}

void SphereIdxGpuPrim::draw(DisplayContext *pDC)
{
    if (m_pDrawElem == nullptr || m_pPO == nullptr) return;
    if (m_pCoordTex == nullptr) return;

    DrawParams ubo = {};
    ubo.frag_alpha = (float)pDC->getAlpha();

    if (pDC->getEdgeLineType() != DisplayContext::ELT_NONE) {
        ubo.u_edge  = (float)pDC->getEdgeLineWidth();
        ubo.u_bsilh = (pDC->getEdgeLineType() == DisplayContext::ELT_SILHOUETTE) ? 1 : 0;
        float r = 0.0f, g = 0.0f, b = 0.0f;
        pDC->getDevRGBColor(pDC->getEdgeLineColor(), r, g, b);
        ubo.u_edgecolor[0] = r;
        ubo.u_edgecolor[1] = g;
        ubo.u_edgecolor[2] = b;
        ubo.u_edgecolor[3] = 1.0f;
    } else {
        ubo.u_edgecolor[3] = 1.0f;
    }

    m_pPO->enable();
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->updateDrawParamsUBO(&ubo, sizeof(ubo));

    m_pCoordTex->bind(m_nCoordTexUnit);
    m_pPO->setUniform("u_coordTex", m_nCoordTexUnit);

    pDC->drawElem(*m_pDrawElem);

    m_pCoordTex->unbind();
    m_pPO->disable();
}

void SphereIdxGpuPrim::invalidate()
{
    if (m_pDrawElem != nullptr) {
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
    m_pCoordTex = nullptr;
}
