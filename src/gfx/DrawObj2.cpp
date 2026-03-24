// -*-Mode: C++;-*-
//
// DrawObj2 implementations
//

#include <common.h>

#include "DrawObj2.hpp"
#include "ShaderObject.hpp"
#include "DisplayContext.hpp"
#include "AbstractColor.hpp"
#include <qlib/LTypes.hpp>

using namespace gfx;

//////////////////////////////////////////////////////////////////////////
// SphereDrawObj2

SphereDrawObj2::SphereDrawObj2()
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

SphereDrawObj2::~SphereDrawObj2()
{
    invalidate();
}

bool SphereDrawObj2::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_sphere2",
                                  "%%CONFDIR%%/data/shaders/sphere2_vertex.glsl",
                                  "%%CONFDIR%%/data/shaders/sphere_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("SphereDrawObj2> ERROR: cannot load shader.");
        return false;
    }

    return true;
}

void SphereDrawObj2::alloc(int nsph)
{
    MB_ASSERT(m_pPO != nullptr);

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

    sphdata.alloc(nsph * 4);
    sphdata.allocInd(nsph * 6);
    sphdata.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
}

void SphereDrawObj2::setData(int idx, const qlib::Vector4D &pos, float rad,
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

void SphereDrawObj2::draw(DisplayContext *pDC)
{
    if (m_pDrawElem == nullptr || m_pPO == nullptr) return;

    m_pPO->enable();
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->setUniformF("frag_alpha", (float)pDC->getAlpha());

    if (pDC->getEdgeLineType() != DisplayContext::ELT_NONE) {
        m_pPO->setUniformF("u_edge", (float)pDC->getEdgeLineWidth());
        float r = 0.0f, g = 0.0f, b = 0.0f;
        pDC->getDevRGBColor(pDC->getEdgeLineColor(), r, g, b);
        m_pPO->setUniformF("u_edgecolor", r, g, b, 1.0f);
        m_pPO->setUniform(
            "u_bsilh",
            (pDC->getEdgeLineType() == DisplayContext::ELT_SILHOUETTE) ? 1 : 0);
    } else {
        m_pPO->setUniformF("u_edge", 0.0f);
        m_pPO->setUniformF("u_edgecolor", 0.0f, 0.0f, 0.0f, 1.0f);
        m_pPO->setUniform("u_bsilh", 0);
    }

    pDC->drawElem(*m_pDrawElem);
    m_pPO->disable();
    MB_DPRINTLN("****** SphereDrawObj2::draw: done.");
}

void SphereDrawObj2::invalidate()
{
    if (m_pDrawElem != nullptr) {
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
}

//////////////////////////////////////////////////////////////////////////
// CylinderDrawObj2

CylinderDrawObj2::CylinderDrawObj2()
    : m_nVertexLoc(0),
      m_nDirLoc(1),
      m_nImposLoc(2),
      m_nRadLoc(3),
      m_nColLoc(4),
      m_pPO(nullptr),
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

CylinderDrawObj2::~CylinderDrawObj2()
{
    invalidate();
}

bool CylinderDrawObj2::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_cylinder",
                                  "%%CONFDIR%%/data/shaders/cylinder_vertex.glsl",
                                  "%%CONFDIR%%/data/shaders/cylinder_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("CylinderDrawObj2> ERROR: cannot load shader.");
        return false;
    }

    m_nVertexLoc = m_pPO->getAttribLocation("a_vertex");
    m_nDirLoc = m_pPO->getAttribLocation("a_dir");
    m_nImposLoc = m_pPO->getAttribLocation("a_impos");
    m_nRadLoc = m_pPO->getAttribLocation("a_radius");
    m_nColLoc = m_pPO->getAttribLocation("a_color");

    return true;
}

void CylinderDrawObj2::alloc(int ncyl)
{
    MB_ASSERT(m_pPO != nullptr);

    auto *pdata = MB_NEW CylElemAry32();
    m_pDrawElem = pdata;
    CylElemAry32 &cyldata = *pdata;

    cyldata.setAttrSize(5);
    cyldata.setAttrInfo(0, m_nVertexLoc, 3, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylElem, cenx));
    cyldata.setAttrInfo(1, m_nDirLoc, 3, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylElem, dirx));
    cyldata.setAttrInfo(2, m_nImposLoc, 2, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylElem, dspx));
    cyldata.setAttrInfo(3, m_nRadLoc, 1, qlib::type_consts::QTC_FLOAT32,
                        offsetof(CylElem, rad));
    cyldata.setAttrInfo(4, m_nColLoc, 4, qlib::type_consts::QTC_UINT8,
                        offsetof(CylElem, r));

    cyldata.alloc(ncyl * 4);
    cyldata.allocInd(ncyl * 6);
    cyldata.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
}

void CylinderDrawObj2::setData(int idx, const qlib::Vector4D &pos1,
                               const qlib::Vector4D &pos2, float rad, quint32 devcode)
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

void CylinderDrawObj2::draw(DisplayContext *pDC)
{
    if (m_pDrawElem == nullptr || m_pPO == nullptr) return;

    m_pPO->enable();
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->setUniformF("frag_alpha", (float)pDC->getAlpha());

    if (pDC->getEdgeLineType() != DisplayContext::ELT_NONE) {
        m_pPO->setUniformF("u_edge", (float)pDC->getEdgeLineWidth());
        float r = 0.0f, g = 0.0f, b = 0.0f;
        pDC->getDevRGBColor(pDC->getEdgeLineColor(), r, g, b);
        m_pPO->setUniformF("u_edgecolor", r, g, b, 1.0f);
        m_pPO->setUniform(
            "u_bsilh",
            (pDC->getEdgeLineType() == DisplayContext::ELT_SILHOUETTE) ? 1 : 0);
    } else {
        m_pPO->setUniformF("u_edge", 0.0f);
        m_pPO->setUniformF("u_edgecolor", 0.0f, 0.0f, 0.0f, 1.0f);
        m_pPO->setUniform("u_bsilh", 0);
    }

    pDC->drawElem(*m_pDrawElem);
    m_pPO->disable();
}

void CylinderDrawObj2::invalidate()
{
    if (m_pDrawElem != nullptr) {
        delete m_pDrawElem;
        m_pDrawElem = nullptr;
    }
}

//////////////////////////////////////////////////////////////////////////
// TrigDrawObj2

TrigDrawObj2::TrigDrawObj2()
    : m_nVertexLoc(0),
      m_nNormLoc(1),
      m_nColLoc(2),
      m_nEVertLoc(0),
      m_nENormLoc(1),
      m_pPO(nullptr),
      m_pEdgePO(nullptr),
      m_pDrawElems(nullptr),
      m_nEdgeLineType(DisplayContext::ELT_NONE)
{
}

TrigDrawObj2::~TrigDrawObj2()
{
    invalidate();
}

bool TrigDrawObj2::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_trig", "%%CONFDIR%%/data/shaders/trig_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/trig_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("TrigDrawObj2> ERROR: cannot load trig shader.");
        return false;
    }

    m_nVertexLoc = m_pPO->getAttribLocation("aVertex");
    m_nNormLoc = m_pPO->getAttribLocation("aNormal");
    m_nColLoc = m_pPO->getAttribLocation("aColor");

    m_pEdgePO = pDC->loadShaderObject("gpu_trig_edge",
                                      "%%CONFDIR%%/data/shaders/trigedge_vert.glsl",
                                      "%%CONFDIR%%/data/shaders/trigedge_frag.glsl");
    if (m_pEdgePO == nullptr) {
        LOG_DPRINTLN("TrigDrawObj2> ERROR: cannot load edge shader.");
        return false;
    }

    m_nEVertLoc = m_pEdgePO->getAttribLocation("aVertex");
    m_nENormLoc = m_pEdgePO->getAttribLocation("aNormal");

    return true;
}

void TrigDrawObj2::alloc(int nverts, int nfaces)
{
    MB_ASSERT(m_pPO != nullptr);

    m_pDrawElems = MB_NEW TrigMesh();
    auto &data = *m_pDrawElems;
    data.alloc(nverts);
    data.allocInd(nfaces * 3);
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
}

void TrigDrawObj2::setupAttrs()
{
    MB_ASSERT(m_pDrawElems != nullptr);
    auto &data = *m_pDrawElems;

    if (data.getAttrSize() > 0) return;  // already set up

    data.setAttrSize(3);
    data.setAttrInfo(0, m_nVertexLoc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, x));
    data.setAttrInfo(1, m_nNormLoc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, nx));
    data.setAttrInfo(2, m_nColLoc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(TrigVertAttr, r));
}

void TrigDrawObj2::setVertex(int idx, const qlib::Vector4D &v)
{
    auto &data = *m_pDrawElems;
    data.at(idx).x = (qfloat32)v.x();
    data.at(idx).y = (qfloat32)v.y();
    data.at(idx).z = (qfloat32)v.z();
}

void TrigDrawObj2::setNormal(int idx, const qlib::Vector4D &n)
{
    auto &data = *m_pDrawElems;
    data.at(idx).nx = (qfloat32)n.x();
    data.at(idx).ny = (qfloat32)n.y();
    data.at(idx).nz = (qfloat32)n.z();
}

void TrigDrawObj2::setColor(int idx, quint32 devcode)
{
    auto &data = *m_pDrawElems;
    data.at(idx).r = getRCode(devcode);
    data.at(idx).g = getGCode(devcode);
    data.at(idx).b = getBCode(devcode);
    data.at(idx).a = getACode(devcode);
}

void TrigDrawObj2::setFace(int idx, int v1, int v2, int v3)
{
    auto &data = *m_pDrawElems;
    data.atind(idx * 3) = v1;
    data.atind(idx * 3 + 1) = v2;
    data.atind(idx * 3 + 2) = v3;
}

void TrigDrawObj2::draw(DisplayContext *pDC)
{
    if (m_pDrawElems == nullptr || m_pPO == nullptr) return;

    setupAttrs();

    if (m_nEdgeLineType != DisplayContext::ELT_NONE) {
        drawEdges(pDC);
    }

    m_pPO->enable();
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->setUniformF("frag_alpha", (float)pDC->getAlpha());
    m_pPO->setUniform("enable_lighting", 0);
    m_pPO->setUniform("u_nodepth", 0);

    pDC->drawElem(*m_pDrawElems);
    m_pPO->disable();
}

void TrigDrawObj2::drawEdges(DisplayContext *pDC)
{
    if (m_pEdgePO == nullptr) return;

    float r = 0.0f, g = 0.0f, b = 0.0f;
    pDC->getDevRGBColor(pDC->getEdgeLineColor(), r, g, b);
    float alpha = (float)pDC->getAlpha();

    if (m_nEdgeLineType == DisplayContext::ELT_EDGES) {
        m_pEdgePO->enable();
        m_pEdgePO->setupFog(pDC);
        m_pEdgePO->setupMat(pDC);
        m_pEdgePO->setUniformF("frag_alpha", alpha);
        m_pEdgePO->setUniformF("edge_width", (float)pDC->getEdgeLineWidth());
        m_pEdgePO->setUniformF("edge_color", r, g, b, alpha);
        pDC->setCullFace(true);
        pDC->setFrontFace(false);  // GL_CW
        pDC->drawElem(*m_pDrawElems);
        m_pEdgePO->disable();
        pDC->setFrontFace(true);   // GL_CCW (restore)
        pDC->setCullFace(false);
    }
}

void TrigDrawObj2::invalidate()
{
    if (m_pDrawElems != nullptr) {
        delete m_pDrawElems;
        m_pDrawElems = nullptr;
    }
}

//////////////////////////////////////////////////////////////////////////
// TrigMeshDrawObj2

TrigMeshDrawObj2::TrigMeshDrawObj2()
    : m_nVertexLoc(0),
      m_nNormLoc(1),
      m_nColLoc(2),
      m_nEVertLoc(0),
      m_nENormLoc(1),
      m_pPO(nullptr),
      m_pEdgePO(nullptr),
      m_pDrawElems(nullptr),
      m_nEdgeLineType(DisplayContext::ELT_NONE)
{
}

TrigMeshDrawObj2::~TrigMeshDrawObj2()
{
    invalidate();
}

bool TrigMeshDrawObj2::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_trig", "%%CONFDIR%%/data/shaders/trig_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/trig_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("TrigMeshDrawObj2> ERROR: cannot load trig shader.");
        return false;
    }

    m_nVertexLoc = m_pPO->getAttribLocation("aVertex");
    m_nNormLoc = m_pPO->getAttribLocation("aNormal");
    m_nColLoc = m_pPO->getAttribLocation("aColor");

    m_pEdgePO = pDC->loadShaderObject("gpu_trig_edge",
                                      "%%CONFDIR%%/data/shaders/trigedge_vert.glsl",
                                      "%%CONFDIR%%/data/shaders/trigedge_frag.glsl");
    if (m_pEdgePO == nullptr) {
        LOG_DPRINTLN("TrigMeshDrawObj2> ERROR: cannot load edge shader.");
        return false;
    }

    m_nEVertLoc = m_pEdgePO->getAttribLocation("aVertex");
    m_nENormLoc = m_pEdgePO->getAttribLocation("aNormal");

    return true;
}

void TrigMeshDrawObj2::alloc(int nverts, int nfaces)
{
    MB_ASSERT(m_pPO != nullptr);

    m_pDrawElems = MB_NEW TrigMesh();
    auto &data = *m_pDrawElems;
    data.alloc(nverts);
    data.allocInd(nfaces * 3);
    data.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
}

void TrigMeshDrawObj2::setupAttrs()
{
    MB_ASSERT(m_pDrawElems != nullptr);
    auto &data = *m_pDrawElems;

    if (data.getAttrSize() > 0) return;

    data.setAttrSize(3);
    data.setAttrInfo(0, m_nVertexLoc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, x));
    data.setAttrInfo(1, m_nNormLoc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, nx));
    data.setAttrInfo(2, m_nColLoc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(TrigVertAttr, r));
}

void TrigMeshDrawObj2::setVertex(int idx, const qlib::Vector4D &v)
{
    auto &data = *m_pDrawElems;
    data.at(idx).x = (qfloat32)v.x();
    data.at(idx).y = (qfloat32)v.y();
    data.at(idx).z = (qfloat32)v.z();
}

void TrigMeshDrawObj2::setNormal(int idx, const qlib::Vector4D &n)
{
    auto &data = *m_pDrawElems;
    data.at(idx).nx = (qfloat32)n.x();
    data.at(idx).ny = (qfloat32)n.y();
    data.at(idx).nz = (qfloat32)n.z();
}

void TrigMeshDrawObj2::setColor(int idx, quint32 devcode)
{
    auto &data = *m_pDrawElems;
    data.at(idx).r = getRCode(devcode);
    data.at(idx).g = getGCode(devcode);
    data.at(idx).b = getBCode(devcode);
    data.at(idx).a = getACode(devcode);
}

void TrigMeshDrawObj2::setFace(int idx, int v1, int v2, int v3)
{
    auto &data = *m_pDrawElems;
    data.atind(idx * 3) = v1;
    data.atind(idx * 3 + 1) = v2;
    data.atind(idx * 3 + 2) = v3;
}

void TrigMeshDrawObj2::draw(DisplayContext *pDC)
{
    if (m_pDrawElems == nullptr || m_pPO == nullptr) return;

    setupAttrs();

    if (m_nEdgeLineType != DisplayContext::ELT_NONE) {
        drawEdges(pDC);
    }

    m_pPO->enable();
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->setUniformF("frag_alpha", (float)pDC->getAlpha());
    m_pPO->setUniform("enable_lighting", 0);
    m_pPO->setUniform("u_nodepth", 0);

    pDC->drawElem(*m_pDrawElems);
    m_pPO->disable();
}

void TrigMeshDrawObj2::drawEdges(DisplayContext *pDC)
{
    if (m_pEdgePO == nullptr) return;

    float r = 0.0f, g = 0.0f, b = 0.0f;
    pDC->getDevRGBColor(pDC->getEdgeLineColor(), r, g, b);
    float alpha = (float)pDC->getAlpha();

    if (m_nEdgeLineType == DisplayContext::ELT_EDGES) {
        m_pEdgePO->enable();
        m_pEdgePO->setupFog(pDC);
        m_pEdgePO->setupMat(pDC);
        m_pEdgePO->setUniformF("frag_alpha", alpha);
        m_pEdgePO->setUniformF("edge_width", (float)pDC->getEdgeLineWidth());
        m_pEdgePO->setUniformF("edge_color", r, g, b, alpha);
        pDC->setCullFace(true);
        pDC->setFrontFace(false);  // GL_CW
        pDC->drawElem(*m_pDrawElems);
        m_pEdgePO->disable();
        pDC->setFrontFace(true);   // GL_CCW (restore)
        pDC->setCullFace(false);
    }
}

void TrigMeshDrawObj2::invalidate()
{
    if (m_pDrawElems != nullptr) {
        delete m_pDrawElems;
        m_pDrawElems = nullptr;
    }
}

//////////////////////////////////////////////////////////////////////////
// LineDrawObj2

LineDrawObj2::LineDrawObj2()
    : m_nVertex1Loc(0),
      m_nVertex2Loc(1),
      m_nCol1Loc(2),
      m_nCol2Loc(3),
      m_pPO(nullptr),
      m_pDrawAry(nullptr),
      m_linew(1.0f),
      m_bStipple(false),
      m_bNoDepth(false)
{
}

LineDrawObj2::~LineDrawObj2()
{
    invalidate();
}

bool LineDrawObj2::init(DisplayContext *pDC)
{
    if (m_pPO != nullptr) return true;

    m_pPO = pDC->loadShaderObject("gpu_line",
                                  "%%CONFDIR%%/data/shaders/linew2_vert.glsl",
                                  "%%CONFDIR%%/data/shaders/linew_frag.glsl");
    if (m_pPO == nullptr) {
        LOG_DPRINTLN("LineDrawObj2> ERROR: cannot load shader.");
        return false;
    }

    m_nVertex1Loc = m_pPO->getAttribLocation("a_vertex1");
    m_nVertex2Loc = m_pPO->getAttribLocation("a_vertex2");
    m_nCol1Loc = m_pPO->getAttribLocation("a_color1");
    m_nCol2Loc = m_pPO->getAttribLocation("a_color2");

    return true;
}

void LineDrawObj2::alloc(int nlines)
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

void LineDrawObj2::setupAttrs()
{
    MB_ASSERT(m_pDrawAry != nullptr);
    LineArray &data = *m_pDrawAry;

    if (data.getAttrSize() > 0) return;  // already set up

    data.setAttrSize(4);
    data.setAttrInfo(0, m_nVertex1Loc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, x1));
    data.setAttrInfo(1, m_nVertex2Loc, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(LineElem, x2));
    data.setAttrInfo(2, m_nCol1Loc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineElem, r1));
    data.setAttrInfo(3, m_nCol2Loc, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(LineElem, r2));

    const int ndiv = 1;
    data.setAttrDivisor(0, ndiv);
    data.setAttrDivisor(1, ndiv);
    data.setAttrDivisor(2, ndiv);
    data.setAttrDivisor(3, ndiv);
}

void LineDrawObj2::setLine(int idx, const qlib::Vector4D &v1, quint32 devcode1,
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

void LineDrawObj2::draw(DisplayContext *pDC)
{
    if (m_pDrawAry == nullptr || m_pPO == nullptr) return;

    setupAttrs();

    // Get screen size from viewport
    qlib::Vector4D vp = pDC->getViewport();
    float w = (float)vp.z();
    float h = (float)vp.w();

    float linew = (m_linew < 0.0f) ? (float)pDC->getLineWidth() : m_linew;
    float stippleLen = m_bStipple ? 8.0f : 0.0f;

    m_pPO->enable();
    m_pPO->setUniform("use_u_color", 0);
    m_pPO->setupFog(pDC);
    m_pPO->setupMat(pDC);
    m_pPO->setUniformF("frag_alpha", (float)pDC->getAlpha());
    m_pPO->setUniformF("lineWidth", linew);
    m_pPO->setUniformF("stippleLen", stippleLen);
    m_pPO->setUniformF("screenSize", w, h);
    m_pPO->setUniform("u_nodepth", m_bNoDepth ? 1 : 0);

    pDC->drawElem(*m_pDrawAry);
    m_pPO->disable();
}

void LineDrawObj2::invalidate()
{
    if (m_pDrawAry != nullptr) {
        delete m_pDrawAry;
        m_pDrawAry = nullptr;
    }
}
