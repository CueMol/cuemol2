// -*-Mode: C++;-*-
//
// SphereGpuPrim implementations
//

#include <common.h>

#include "SphereGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// SphereGpuPrim

SphereGpuPrim::SphereGpuPrim()
    : m_pPO(nullptr),
      m_pDrawElem(nullptr)
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

SphereGpuPrim::~SphereGpuPrim()
{
    invalidate();
}

bool SphereGpuPrim::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_sphere2",
                                  "%%CONFDIR%%/data/shaders/sphere2_vertex.glsl",
                                  "%%CONFDIR%%/data/shaders/sphere_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("SphereGpuPrim> ERROR: cannot load shader.");
        return false;
    }

    m_pPO->initDrawParamsUBO(sizeof(DrawParams));
    return true;
}

void SphereGpuPrim::alloc(DisplayContext *pDC, int nsph)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(pDC != nullptr);

    auto *pdata = MB_NEW SphElemAry32();
    m_pDrawElem = pdata;
    SphElemAry32 &sphdata = *pdata;

    sphdata.setAttrSize(4);
    sphdata.setAttrInfo(0, ATTRLOC_VERTEX, 3, qlib::type_consts::QTC_FLOAT32,
                        offsetof(SphElem, cenx));
    sphdata.setAttrInfo(1, ATTRLOC_IMPOS, 2, qlib::type_consts::QTC_FLOAT32,
                        offsetof(SphElem, dspx));
    sphdata.setAttrInfo(2, ATTRLOC_RAD, 1, qlib::type_consts::QTC_FLOAT32,
                        offsetof(SphElem, rad));
    sphdata.setAttrInfo(3, ATTRLOC_COLOR, 4, qlib::type_consts::QTC_UINT8,
                        offsetof(SphElem, r));

    pDC->allocBuffer(sphdata, nsph * 4, nsph * 6);
    sphdata.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
}

void SphereGpuPrim::setData(int idx, const qlib::Vector4D &pos, float rad,
                             quint32 devcode)
{
    int i = idx * 4;
    int ifc = idx * 6;

    SphElemAry32 &sphdata = *m_pDrawElem;
    SphElem data;

    data.cenx = (qfloat32)pos.x();
    data.ceny = (qfloat32)pos.y();
    data.cenz = (qfloat32)pos.z();
    data.rad = rad;
    data.r = getRCode(devcode);
    data.g = getGCode(devcode);
    data.b = getBCode(devcode);
    data.a = getACode(devcode);

    sphdata.atind(ifc) = i + 0;
    ++ifc;
    sphdata.atind(ifc) = i + 1;
    ++ifc;
    sphdata.atind(ifc) = i + 2;
    ++ifc;
    sphdata.atind(ifc) = i + 2;
    ++ifc;
    sphdata.atind(ifc) = i + 1;
    ++ifc;
    sphdata.atind(ifc) = i + 3;

    for (int j = 0; j < 4; ++j) {
        sphdata.at(i) = data;
        sphdata.at(i).dspx = m_dsps[j][0];
        sphdata.at(i).dspy = m_dsps[j][1];
        ++i;
    }
}

void SphereGpuPrim::draw(DisplayContext *pDC)
{
    if (m_pDrawElem == nullptr || m_pPO == nullptr) return;

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

    pDC->drawElem(*m_pDrawElem);
    m_pPO->disable();
    MB_DPRINTLN("****** SphereGpuPrim::draw: done.");
}

void SphereGpuPrim::invalidate()
{
    if (m_pDrawElem != nullptr) {
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
}
