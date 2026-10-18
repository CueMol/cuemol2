// -*-Mode: C++;-*-
//
// CylinderGpuPrim implementations
//

#include <common.h>

#include "CylinderGpuPrim.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// CylinderGpuPrim

CylinderGpuPrim::CylinderGpuPrim()
    : m_pPO(nullptr),
      m_pPickPO(nullptr),
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

CylinderGpuPrim::~CylinderGpuPrim()
{
    invalidate();
}

bool CylinderGpuPrim::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_cylinder",
                                  "%%CONFDIR%%/data/shaders/cylinder_vertex.glsl",
                                  "%%CONFDIR%%/data/shaders/cylinder_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("CylinderGpuPrim> ERROR: cannot load shader.");
        return false;
    }

    m_pPO->initDrawParamsUBO(sizeof(DrawParams));
    return true;
}

void CylinderGpuPrim::alloc(DisplayContext *pDC, int ncyl)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(pDC != nullptr);

    auto *pdata = MB_NEW CylElemAry32();
    m_pDrawElem = pdata;
    CylElemAry32 &cyldata = *pdata;

    cyldata.setAttrSize(7);
    cyldata.setAttrInfo(0, ATTRLOC_VERTEX, 3, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylElem, cenx));
    cyldata.setAttrInfo(1, ATTRLOC_DIR, 3, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylElem, dirx));
    cyldata.setAttrInfo(2, ATTRLOC_IMPOS, 2, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylElem, dspx));
    cyldata.setAttrInfo(3, ATTRLOC_RAD, 1, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylElem, rad));
    cyldata.setAttrInfo(4, ATTRLOC_COLOR, 4, qlib::type_consts::QTC_UINT8,
                        offsetof(CylElem, r));
    // Hit names of the two halves: integer attributes for the pick program.
    cyldata.setAttrInfo(5, ATTRLOC_HITNAME_A, 1, qlib::type_consts::QTC_UINT32,
                        offsetof(CylElem, hitNameA));
    cyldata.setAttrInteger(5, true);
    cyldata.setAttrInfo(6, ATTRLOC_HITNAME_B, 1, qlib::type_consts::QTC_UINT32,
                        offsetof(CylElem, hitNameB));
    cyldata.setAttrInteger(6, true);

    pDC->allocBuffer(cyldata, ncyl * 4, ncyl * 6);
    cyldata.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
}

void CylinderGpuPrim::setData(int idx, const qlib::Vector4D &pos1,
                               const qlib::Vector4D &pos2, float rad, quint32 devcode,
                               quint32 hitNameA, quint32 hitNameB)
{
    qlib::Vector4D dir = pos2 - pos1;
    CylElemAry32 &cyldata = *m_pDrawElem;

    int i = idx * 4;
    int ifc = idx * 6;

    cyldata.atind(ifc) = i + 0;
    ++ifc;
    cyldata.atind(ifc) = i + 1;
    ++ifc;
    cyldata.atind(ifc) = i + 2;
    ++ifc;
    cyldata.atind(ifc) = i + 2;
    ++ifc;
    cyldata.atind(ifc) = i + 1;
    ++ifc;
    cyldata.atind(ifc) = i + 3;

    CylElem data;
    data.cenx = (qfloat32)pos1.x();
    data.ceny = (qfloat32)pos1.y();
    data.cenz = (qfloat32)pos1.z();
    data.dirx = (qfloat32)dir.x();
    data.diry = (qfloat32)dir.y();
    data.dirz = (qfloat32)dir.z();
    data.rad = rad;
    data.r = getRCode(devcode);
    data.g = getGCode(devcode);
    data.b = getBCode(devcode);
    data.a = getACode(devcode);

    // The pick shader takes A on the pos1 half and B on the pos2 half (same
    // vertex layout as CylinderIdxGpuPrim).
    data.hitNameA = hitNameA;
    data.hitNameB = hitNameB;

    // Two vertices at pos1 side
    for (int j = 0; j < 2; ++j) {
        cyldata.at(i) = data;
        cyldata.at(i).dspx = m_dsps[j][0];
        cyldata.at(i).dspy = m_dsps[j][1];
        ++i;
    }

    // Two vertices at pos2 side (reversed direction)
    data.cenx = (qfloat32)pos2.x();
    data.ceny = (qfloat32)pos2.y();
    data.cenz = (qfloat32)pos2.z();
    data.dirx = (qfloat32)(-dir.x());
    data.diry = (qfloat32)(-dir.y());
    data.dirz = (qfloat32)(-dir.z());

    for (int j = 2; j < 4; ++j) {
        cyldata.at(i) = data;
        cyldata.at(i).dspx = m_dsps[j][0];
        cyldata.at(i).dspy = m_dsps[j][1];
        ++i;
    }
}

void CylinderGpuPrim::draw(DisplayContext *pDC)
{
    if (m_pDrawElem == nullptr || m_pPO == nullptr) return;
    if (pDC->isPickDraw()) {
        drawPick(pDC);
        return;
    }

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
}

bool CylinderGpuPrim::initPick(DisplayContext *pDC)
{
    if (m_pPickPO != nullptr) return true;

    m_pPickPO = pDC->loadShaderObject("gpu_cylinder_pick",
                                      "%%CONFDIR%%/data/shaders/cylinder_pick_vertex.glsl",
                                      "%%CONFDIR%%/data/shaders/cylinder_pick_frag.glsl");
    if (m_pPickPO == nullptr) {
        LOG_DPRINTLN("CylinderGpuPrim> ERROR: cannot load pick shader.");
        return false;
    }
    m_pPickPO->initDrawParamsUBO(sizeof(PickDrawParams));
    return true;
}

void CylinderGpuPrim::drawPick(DisplayContext *pDC)
{
    if (!initPick(pDC)) return;

    // No edge in the pick pass (u_edge = 0).
    PickDrawParams ubo = {};
    ubo.u_edgecolor[3] = 1.0f;
    ubo.u_rend_idx     = pDC->getHitRendIndex();
    ubo.u_outer_name   = encodeHitName(pDC->getOuterName());

    m_pPickPO->enable();
    m_pPickPO->setupMat(pDC);
    m_pPickPO->updateDrawParamsUBO(&ubo, sizeof(ubo));
    pDC->drawElem(*m_pDrawElem);
    m_pPickPO->disable();
}

void CylinderGpuPrim::invalidate()
{
    if (m_pDrawElem != nullptr) {
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
}
