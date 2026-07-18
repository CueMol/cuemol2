// -*-Mode: C++;-*-
//
// CylinderIdxGpuPrim implementations
//

#include <common.h>

#include "CylinderIdxGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "FloatDataTexture.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// CylinderIdxGpuPrim

CylinderIdxGpuPrim::CylinderIdxGpuPrim()
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

CylinderIdxGpuPrim::~CylinderIdxGpuPrim()
{
    invalidate();
}

bool CylinderIdxGpuPrim::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_cylinderidx",
                                  "%%CONFDIR%%/data/shaders/cylinder_idx_vertex.glsl",
                                  "%%CONFDIR%%/data/shaders/cylinder_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("CylinderIdxGpuPrim> ERROR: cannot load shader.");
        return false;
    }

    m_pPO->initDrawParamsUBO(sizeof(DrawParams));
    return true;
}

void CylinderIdxGpuPrim::alloc(DisplayContext *pDC, int ncyl)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(pDC != nullptr);

    auto *pdata = MB_NEW CylIdxElemAry32();
    m_pDrawElem = pdata;
    CylIdxElemAry32 &cyldata = *pdata;

    cyldata.setAttrSize(4);
    cyldata.setAttrInfo(0, ATTRLOC_CYL, 4, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylIdxElem, idx1));
    cyldata.setAttrInfo(1, ATTRLOC_IMPOS, 2, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylIdxElem, dspx));
    cyldata.setAttrInfo(2, ATTRLOC_RAD, 1, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylIdxElem, rad));
    cyldata.setAttrInfo(3, ATTRLOC_COLOR, 4, qlib::type_consts::QTC_UINT8,
                        offsetof(CylIdxElem, r));

    pDC->allocBuffer(cyldata, ncyl * 4, ncyl * 6);
    cyldata.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
}

void CylinderIdxGpuPrim::setData(int i, int idx1, int idx2, float ta, float tb,
                                 float rad, quint32 devcode)
{
    CylIdxElemAry32 &cyldata = *m_pDrawElem;

    int iv = i * 4;
    int ifc = i * 6;

    cyldata.atind(ifc) = iv + 0;
    ++ifc;
    cyldata.atind(ifc) = iv + 1;
    ++ifc;
    cyldata.atind(ifc) = iv + 2;
    ++ifc;
    cyldata.atind(ifc) = iv + 2;
    ++ifc;
    cyldata.atind(ifc) = iv + 1;
    ++ifc;
    cyldata.atind(ifc) = iv + 3;

    CylIdxElem data;
    data.idx1 = (qfloat32)idx1;
    data.idx2 = (qfloat32)idx2;
    data.rad = rad;
    data.r = getRCode(devcode);
    data.g = getGCode(devcode);
    data.b = getBCode(devcode);
    data.a = getACode(devcode);

    // Two vertices at the ta end (this=ta, other=tb)
    data.tthis = ta;
    data.tother = tb;
    for (int j = 0; j < 2; ++j) {
        cyldata.at(iv) = data;
        cyldata.at(iv).dspx = m_dsps[j][0];
        cyldata.at(iv).dspy = m_dsps[j][1];
        ++iv;
    }

    // Two vertices at the tb end (this=tb, other=ta)
    data.tthis = tb;
    data.tother = ta;
    for (int j = 2; j < 4; ++j) {
        cyldata.at(iv) = data;
        cyldata.at(iv).dspx = m_dsps[j][0];
        cyldata.at(iv).dspy = m_dsps[j][1];
        ++iv;
    }
}

void CylinderIdxGpuPrim::setCoordTex(FloatDataTexture *pTex, int texUnit)
{
    m_pCoordTex = pTex;
    m_nCoordTexUnit = texUnit;
}

void CylinderIdxGpuPrim::draw(DisplayContext *pDC)
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

void CylinderIdxGpuPrim::invalidate()
{
    if (m_pDrawElem != nullptr) {
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
    m_pCoordTex = nullptr;
}
