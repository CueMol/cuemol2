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
      m_pPickPO(nullptr),
      m_pDrawElems(nullptr),
      m_pPackedElems(nullptr),
      m_nLayout(LAYOUT_INTERLEAVED),
      m_nEdgeLineType(DisplayContext::ELT_NONE),
      m_nPolygonMode(DisplayContext::POLY_FILL),
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

void TrigGpuPrim::alloc(DisplayContext *pDC, int nverts, int nfaces)
{
    MB_ASSERT(m_pPO != nullptr);
    MB_ASSERT(pDC != nullptr);

    // Re-allocation: release the previous mesh (and its GPU buffer via the
    // VBORep dtor) instead of leaking it.
    invalidate();

    // In wireframe (POLY_LINE) mode, render triangle edges as GL_LINES:
    // each face contributes 3 edges (6 indices) instead of a filled triangle.
    const bool bWire = (m_nPolygonMode == DisplayContext::POLY_LINE);
    const int nInds = bWire ? nfaces * 6 : nfaces * 3;
    const int nMode = bWire ? gfx::AbstDrawElem::DRAW_LINES
                            : gfx::AbstDrawElem::DRAW_TRIANGLES;

    if (m_nLayout == LAYOUT_PACKED) {
        m_pPackedElems = MB_NEW PackedMesh();
        pDC->allocBuffer(*m_pPackedElems, nverts, nInds);
        m_pPackedElems->setDrawMode(nMode);
        return;
    }

    m_pDrawElems = MB_NEW TrigMesh();
    pDC->allocBuffer(*m_pDrawElems, nverts, nInds);
    m_pDrawElems->setDrawMode(nMode);
}

qbyte *TrigGpuPrim::packedBlock(int nWordsBefore) const
{
    MB_ASSERT(m_pPackedElems != nullptr && m_pPackedElems->getSize() > 0);
    qbyte *pbase = reinterpret_cast<qbyte *>(&m_pPackedElems->at(0));
    return pbase + size_t(nWordsBefore) * 4 * size_t(m_pPackedElems->getSize());
}

TrigGpuPrim::PackedArrays TrigGpuPrim::getPackedArrays()
{
    PackedArrays arrays = {nullptr, nullptr, nullptr, nullptr};
    if (m_pPackedElems == nullptr || m_pPackedElems->getSize() == 0) return arrays;
    arrays.pos = reinterpret_cast<qfloat32 *>(packedBlock(0));
    arrays.norm = reinterpret_cast<PackedNormal *>(packedBlock(3));
    arrays.color = packedBlock(5);
    arrays.hitName = reinterpret_cast<quint32 *>(packedBlock(6));
    return arrays;
}

// static
qlib::Vector4D TrigGpuPrim::unpackNormal(const PackedNormal &n)
{
    // normalize as GLES 3 does
    auto comp = [](qint16 v) {
        const double f = double(v) / 32767.0;
        return (f < -1.0) ? -1.0 : f;
    };
    return qlib::Vector4D(comp(n.x), comp(n.y), comp(n.z));
}

void TrigGpuPrim::markUpdated(int nFlags)
{
    if (m_pPackedElems == nullptr) {
        setUpdated(true);
        return;
    }
    const size_t nverts = size_t(m_pPackedElems->getSize());
    if (nFlags & UPD_GEOM) {
        // positions and normals adjoin: words 0-4 of each vertex
        m_pPackedElems->setUpdatedRange(0, 20 * nverts);
    }
    if (nFlags & UPD_COLOR) {
        m_pPackedElems->setUpdatedRange(20 * nverts, 4 * nverts);
    }
}

void TrigGpuPrim::setupAttrs()
{
    if (m_pPackedElems != nullptr) {
        auto &data = *m_pPackedElems;
        if (data.getAttrSize() > 0) return;  // already set up
        const int nverts = data.getSize();
        data.setAttrSize(4);
        data.setAttrInfo(0, ATTRLOC_VERTEX, 3, qlib::type_consts::QTC_FLOAT32, 0);
        data.setAttrStride(0, 12);
        data.setAttrInfo(1, ATTRLOC_NORM, 4, qlib::type_consts::QTC_INT16, 12 * nverts);
        data.setAttrStride(1, 8);
        data.setAttrInfo(2, ATTRLOC_COLOR, 4, qlib::type_consts::QTC_UINT8, 20 * nverts);
        data.setAttrStride(2, 4);
        data.setAttrInfo(3, ATTRLOC_HITNAME, 1, qlib::type_consts::QTC_UINT32,
                         24 * nverts);
        data.setAttrStride(3, 4);
        data.setAttrInteger(3, true);
        return;
    }

    MB_ASSERT(m_pDrawElems != nullptr);
    auto &data = *m_pDrawElems;

    if (data.getAttrSize() > 0) return;  // already set up

    data.setAttrSize(4);
    data.setAttrInfo(0, ATTRLOC_VERTEX, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, x));
    data.setAttrInfo(1, ATTRLOC_NORM, 3, qlib::type_consts::QTC_FLOAT32,
                     offsetof(TrigVertAttr, nx));
    data.setAttrInfo(2, ATTRLOC_COLOR, 4, qlib::type_consts::QTC_UINT8,
                     offsetof(TrigVertAttr, r));
    // Hit name: integer attribute, consumed by the pick program only (the
    // shading/edge programs do not declare location 3).
    data.setAttrInfo(3, ATTRLOC_HITNAME, 1, qlib::type_consts::QTC_UINT32,
                     offsetof(TrigVertAttr, hitName));
    data.setAttrInteger(3, true);
}

void TrigGpuPrim::setVertex(int idx, const qlib::Vector4D &v)
{
    if (m_pPackedElems != nullptr) {
        MB_ASSERT(idx >= 0 && idx < m_pPackedElems->getSize());
        qfloat32 *p = reinterpret_cast<qfloat32 *>(packedBlock(0)) + idx * 3;
        p[0] = (qfloat32)v.x();
        p[1] = (qfloat32)v.y();
        p[2] = (qfloat32)v.z();
        return;
    }
    auto &data = *m_pDrawElems;
    data.at(idx).x = (qfloat32)v.x();
    data.at(idx).y = (qfloat32)v.y();
    data.at(idx).z = (qfloat32)v.z();
}

void TrigGpuPrim::setNormal(int idx, const qlib::Vector4D &n)
{
    if (m_pPackedElems != nullptr) {
        MB_ASSERT(idx >= 0 && idx < m_pPackedElems->getSize());
        reinterpret_cast<PackedNormal *>(packedBlock(3))[idx] =
            packNormal(float(n.x()), float(n.y()), float(n.z()));
        return;
    }
    auto &data = *m_pDrawElems;
    data.at(idx).nx = (qfloat32)n.x();
    data.at(idx).ny = (qfloat32)n.y();
    data.at(idx).nz = (qfloat32)n.z();
}

void TrigGpuPrim::setColor(int idx, quint32 devcode)
{
    if (m_pPackedElems != nullptr) {
        MB_ASSERT(idx >= 0 && idx < m_pPackedElems->getSize());
        qbyte *p = packedBlock(5) + idx * 4;
        p[0] = getRCode(devcode);
        p[1] = getGCode(devcode);
        p[2] = getBCode(devcode);
        p[3] = getACode(devcode);
        return;
    }
    auto &data = *m_pDrawElems;
    data.at(idx).r = getRCode(devcode);
    data.at(idx).g = getGCode(devcode);
    data.at(idx).b = getBCode(devcode);
    data.at(idx).a = getACode(devcode);
}

void TrigGpuPrim::setHitName(int idx, quint32 name)
{
    if (m_pPackedElems != nullptr) {
        MB_ASSERT(idx >= 0 && idx < m_pPackedElems->getSize());
        reinterpret_cast<quint32 *>(packedBlock(6))[idx] = name;
        return;
    }
    auto &data = *m_pDrawElems;
    data.at(idx).hitName = name;
}

qlib::Vector4D TrigGpuPrim::getVertex(int idx) const
{
    if (m_pPackedElems != nullptr) {
        const qfloat32 *p = reinterpret_cast<const qfloat32 *>(packedBlock(0)) + idx * 3;
        return qlib::Vector4D(p[0], p[1], p[2]);
    }
    const TrigVertAttr &va = m_pDrawElems->at(idx);
    return qlib::Vector4D(va.x, va.y, va.z);
}

qlib::Vector4D TrigGpuPrim::getNormal(int idx) const
{
    if (m_pPackedElems != nullptr)
        return unpackNormal(reinterpret_cast<const PackedNormal *>(packedBlock(3))[idx]);
    const TrigVertAttr &va = m_pDrawElems->at(idx);
    return qlib::Vector4D(va.nx, va.ny, va.nz);
}

quint32 TrigGpuPrim::getColorRGBA(int idx) const
{
    qbyte r, g, b, a;
    if (m_pPackedElems != nullptr) {
        const qbyte *p = packedBlock(5) + idx * 4;
        r = p[0];
        g = p[1];
        b = p[2];
        a = p[3];
    }
    else {
        const TrigVertAttr &va = m_pDrawElems->at(idx);
        r = va.r;
        g = va.g;
        b = va.b;
        a = va.a;
    }
    return (quint32(r) << 24) | (quint32(g) << 16) | (quint32(b) << 8) | quint32(a);
}

quint32 TrigGpuPrim::getHitName(int idx) const
{
    if (m_pPackedElems != nullptr)
        return reinterpret_cast<const quint32 *>(packedBlock(6))[idx];
    return m_pDrawElems->at(idx).hitName;
}

void TrigGpuPrim::getFace(int idx, int &v1, int &v2, int &v3) const
{
    // Wireframe stores the edges (v1,v2)(v2,v3)(v3,v1)
    const bool bLine = (m_nPolygonMode == DisplayContext::POLY_LINE);
    const int n = bLine ? 6 : 3;
    auto get = [&](const auto &data) {
        v1 = int(data.atind(idx * n));
        v2 = int(data.atind(idx * n + (bLine ? 2 : 1)));
        v3 = int(data.atind(idx * n + (bLine ? 4 : 2)));
    };
    if (m_pPackedElems != nullptr)
        get(*m_pPackedElems);
    else
        get(*m_pDrawElems);
}

void TrigGpuPrim::setFace(int idx, int v1, int v2, int v3)
{
    auto set = [&](auto &data) {
        if (m_nPolygonMode == DisplayContext::POLY_LINE) {
            // Wireframe: 3 edges per face -> (v1,v2)(v2,v3)(v3,v1)
            data.atind(idx * 6 + 0) = v1;
            data.atind(idx * 6 + 1) = v2;
            data.atind(idx * 6 + 2) = v2;
            data.atind(idx * 6 + 3) = v3;
            data.atind(idx * 6 + 4) = v3;
            data.atind(idx * 6 + 5) = v1;
            return;
        }
        data.atind(idx * 3) = v1;
        data.atind(idx * 3 + 1) = v2;
        data.atind(idx * 3 + 2) = v3;
    };
    if (m_pPackedElems != nullptr)
        set(*m_pPackedElems);
    else
        set(*m_pDrawElems);
}

void TrigGpuPrim::draw(DisplayContext *pDC)
{
    if (attrs() == nullptr || m_pPO == nullptr) return;

    setupAttrs();

    if (pDC->isPickDraw()) {
        drawPick(pDC);
        return;
    }

    // Edge/silhouette pass is meaningful only for filled triangles; skip it
    // when the mesh is drawn as wireframe lines.
    if (m_nPolygonMode != DisplayContext::POLY_LINE &&
        m_nEdgeLineType != DisplayContext::ELT_NONE) {
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

    pDC->drawElem(*attrs());
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
        pDC->drawElem(*attrs());
        m_pEdgePO->disable();
        pDC->setFrontFace(true);   // GL_CCW (restore)
        pDC->setCullFace(false);
    }
}

bool TrigGpuPrim::initPick(DisplayContext *pDC)
{
    if (m_pPickPO != nullptr) return true;

    m_pPickPO = pDC->loadShaderObject("gpu_trig_pick",
                                      "%%CONFDIR%%/data/shaders/trig_pick_vert.glsl",
                                      "%%CONFDIR%%/data/shaders/trig_pick_frag.glsl");
    if (m_pPickPO == nullptr) {
        LOG_DPRINTLN("TrigGpuPrim> ERROR: cannot load pick shader.");
        return false;
    }
    m_pPickPO->initDrawParamsUBO(sizeof(PickDrawParams));
    return true;
}

void TrigGpuPrim::drawPick(DisplayContext *pDC)
{
    // Never draw the vec4-output shading program into the integer pick
    // target (type mismatch is an invalid draw); skip when unavailable.
    if (!initPick(pDC)) return;

    PickDrawParams ubo = {};
    ubo.u_nodepth    = m_bNoDepth ? 1 : 0;
    ubo.u_rend_idx   = pDC->getHitRendIndex();
    ubo.u_outer_name = encodeHitName(pDC->getOuterName());

    m_pPickPO->enable();
    m_pPickPO->setupMat(pDC);
    m_pPickPO->updateDrawParamsUBO(&ubo, sizeof(ubo));

    pDC->drawElem(*attrs());
    m_pPickPO->disable();
}

void TrigGpuPrim::invalidate()
{
    if (m_pDrawElems != nullptr) {
        delete m_pDrawElems;
        m_pDrawElems = nullptr;
    }
    if (m_pPackedElems != nullptr) {
        delete m_pPackedElems;
        m_pPackedElems = nullptr;
    }
}
