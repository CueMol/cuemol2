// -*-Mode: C++;-*-
//
// TrigGpuPrim implementations
//

#include <common.h>

#include "TrigGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// TrigGpuPrim

TrigGpuPrim::TrigGpuPrim()
    : m_pPO(nullptr),
      m_pEdgePO(nullptr),
      m_pDrawElems(nullptr),
      m_nEdgeLineType(DisplayContext::ELT_NONE),
      m_bNoDepth(false)
{
}

TrigGpuPrim::~TrigGpuPrim()
{
    invalidate();
}

bool TrigGpuPrim::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_trig", "%%CONFDIR%%/data/shaders/trig_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/trig_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("TrigGpuPrim> ERROR: cannot load trig shader.");
        return false;
    }

    m_pEdgePO = pDC->loadShaderObject("gpu_trig_edge",
                                      "%%CONFDIR%%/data/shaders/trigedge_vert.glsl",
                                      "%%CONFDIR%%/data/shaders/trigedge_frag.glsl");
    if (m_pEdgePO == nullptr) {
        LOG_DPRINTLN("TrigGpuPrim> ERROR: cannot load edge shader.");
        return false;
    }

    m_pPO->initDrawParamsUBO(sizeof(DrawParams));
    m_pEdgePO->initDrawParamsUBO(sizeof(EdgeDrawParams));
    return true;
}

void TrigGpuPrim::alloc(int nverts, int nfaces)
{
    MB_ASSERT(m_pPO != nullptr);

    m_pDrawElems = MB_NEW TrigMesh();
    auto &data = *m_pDrawElems;
    data.alloc(nverts);
    data.allocInd(nfaces * 3);
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
}

void TrigGpuPrim::setupAttrs()
{
    MB_ASSERT(m_pDrawElems != nullptr);
    auto &data = *m_pDrawElems;

    if (data.getAttrSize() > 0) return;  // already set up

    data.setAttrSize(3);
    data.setAttrInfo(0, ATTRLOC_VERTEX, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, x));
    data.setAttrInfo(1, ATTRLOC_NORM, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, nx));
    data.setAttrInfo(2, ATTRLOC_COLOR, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(TrigVertAttr, r));
}

void TrigGpuPrim::setVertex(int idx, const qlib::Vector4D &v)
{
    auto &data = *m_pDrawElems;
    data.at(idx).x = (qfloat32)v.x();
    data.at(idx).y = (qfloat32)v.y();
    data.at(idx).z = (qfloat32)v.z();
}

void TrigGpuPrim::setNormal(int idx, const qlib::Vector4D &n)
{
    auto &data = *m_pDrawElems;
    data.at(idx).nx = (qfloat32)n.x();
    data.at(idx).ny = (qfloat32)n.y();
    data.at(idx).nz = (qfloat32)n.z();
}

void TrigGpuPrim::setColor(int idx, quint32 devcode)
{
    auto &data = *m_pDrawElems;
    data.at(idx).r = getRCode(devcode);
    data.at(idx).g = getGCode(devcode);
    data.at(idx).b = getBCode(devcode);
    data.at(idx).a = getACode(devcode);
}

void TrigGpuPrim::setFace(int idx, int v1, int v2, int v3)
{
    auto &data = *m_pDrawElems;
    data.atind(idx * 3) = v1;
    data.atind(idx * 3 + 1) = v2;
    data.atind(idx * 3 + 2) = v3;
}

void TrigGpuPrim::draw(DisplayContext *pDC)
{
    if (m_pDrawElems == nullptr || m_pPO == nullptr) return;

    setupAttrs();

    if (m_nEdgeLineType != DisplayContext::ELT_NONE) {
        drawEdges(pDC);
    }

    DrawParams ubo = {};
    ubo.frag_alpha      = (float)pDC->getAlpha();
    ubo.enable_lighting = pDC->isLighting() ? 1 : 0;
    ubo.u_nodepth       = m_bNoDepth ? 1 : 0;

    m_pPO->enable();
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->updateDrawParamsUBO(&ubo, sizeof(ubo));

    pDC->drawElem(*m_pDrawElems);
    m_pPO->disable();
}

void TrigGpuPrim::drawEdges(DisplayContext *pDC)
{
    if (m_pEdgePO == nullptr) return;

    float r = 0.0f, g = 0.0f, b = 0.0f;
    pDC->getDevRGBColor(pDC->getEdgeLineColor(), r, g, b);
    float alpha = (float)pDC->getAlpha();

    if (m_nEdgeLineType == DisplayContext::ELT_EDGES ||
        m_nEdgeLineType == DisplayContext::ELT_SILHOUETTE) {
        EdgeDrawParams ubo = {};
        ubo.frag_alpha  = alpha;
        ubo.edge_width  = (float)pDC->getEdgeLineWidth();
        ubo.u_silh      = (m_nEdgeLineType == DisplayContext::ELT_SILHOUETTE) ? 1 : 0;
        ubo.edge_color[0] = r;
        ubo.edge_color[1] = g;
        ubo.edge_color[2] = b;
        ubo.edge_color[3] = alpha;

        m_pEdgePO->enable();
        m_pEdgePO->setupFog(pDC);
        m_pEdgePO->setupMat(pDC);
        m_pEdgePO->updateDrawParamsUBO(&ubo, sizeof(ubo));
        pDC->setCullFace(true);
        pDC->setFrontFace(false);  // GL_CW
        pDC->drawElem(*m_pDrawElems);
        m_pEdgePO->disable();
        pDC->setFrontFace(true);   // GL_CCW (restore)
        pDC->setCullFace(false);
    }
}

void TrigGpuPrim::invalidate()
{
    if (m_pDrawElems != nullptr) {
        delete m_pDrawElems;
        m_pDrawElems = nullptr;
    }
}
