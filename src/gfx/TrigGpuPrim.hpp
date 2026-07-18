// -*-Mode: C++;-*-
//
// TrigGpuPrim: Triangle mesh draw primitive
//

#pragma once

#include "GpuPrim.hpp"
#include "DrawAttrElems.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

/**
 * Triangle mesh draw primitive with optional edge/silhouette rendering.
 *
 * Uses two shader programs: a main shading program and an optional edge
 * program that renders back-face silhouette or crease edges.
 */
class GFX_API TrigGpuPrim : public GpuPrim
{
public:
    // ─── Data structures ─────────────────────────────────────────────────────

    /** Per-vertex attribute layout. */
    struct TrigVertAttr
    {
        qfloat32 x, y, z;      ///< Position
        qfloat32 nx, ny, nz;   ///< Normal
        qbyte r, g, b, a;      ///< RGBA colour
    };

    /**
     * std140 DrawParamsBlock for the main shading shader (binding=2, 16 bytes).
     * Must match the DrawParamsBlock uniform block in trig_vert.glsl / trig_frag.glsl.
     */
    struct DrawParams
    {
        qfloat32 frag_alpha;        // offset 0  — overall fragment alpha
        qint32   enable_lighting;   // offset 4  — 1 = use lighting, 0 = flat colour
        qint32   u_nodepth;         // offset 8  — 1 = disable depth test
        qfloat32 _pad;              // offset 12 — padding
    };

    /**
     * std140 DrawParamsBlock for the edge shader (binding=2, 32 bytes).
     * Must match the DrawParamsBlock uniform block in trigedge_vert.glsl / trigedge_frag.glsl.
     */
    struct EdgeDrawParams
    {
        qfloat32 frag_alpha;        // offset 0  — overall fragment alpha
        qfloat32 edge_width;        // offset 4  — edge line width in pixels
        qint32   u_silh;            // offset 8  — 1 = silhouette, 0 = crease edges
        qfloat32 _pad;              // offset 12 — padding
        qfloat32 edge_color[4];     // offset 16 — edge RGBA colour
    };

    using TrigMesh = gfx::DrawAttrElems<quint32, TrigVertAttr>;

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    TrigGpuPrim();
    ~TrigGpuPrim() override;

    /** Load the triangle mesh and edge shaders. */
    bool init(DisplayContext *pDC) override;

    /**
     * Allocate GPU storage for nverts vertices and nfaces triangles.
     * Must call init() first. Storage is routed via DisplayContext::allocBuffer.
     */
    void alloc(DisplayContext *pDC, int nverts, int nfaces);

    // ─── Data upload ─────────────────────────────────────────────────────────

    /** Set the position of vertex idx. */
    void setVertex(int idx, const qlib::Vector4D &v);

    /** Set the normal of vertex idx. */
    void setNormal(int idx, const qlib::Vector4D &n);

    /**
     * Set the colour of vertex idx.
     * @param devcode Pre-resolved device RGBA colour code.
     */
    void setColor(int idx, quint32 devcode);

    /** Set triangle face idx with vertex indices v1, v2, v3. */
    void setFace(int idx, int v1, int v2, int v3);

    // ─── Properties ───────────────────────────────────────────────────────────

    /**
     * Set the edge/silhouette rendering mode.
     * Use DisplayContext::ELT_NONE to disable edge rendering.
     */
    void setEdgeLineType(int n) { m_nEdgeLineType = n; }
    /** Return the current edge/silhouette rendering mode. */
    int getEdgeLineType() const { return m_nEdgeLineType; }

    /**
     * Set the polygon rendering mode (DisplayContext::POLY_FILL / POLY_LINE).
     * Must be set before alloc(): in POLY_LINE mode the index buffer is built as
     * triangle edges (GL_LINES) instead of filled triangles.
     */
    void setPolygonMode(int n) { m_nPolygonMode = n; }
    /** Return the current polygon rendering mode. */
    int getPolygonMode() const { return m_nPolygonMode; }

    /** When true, depth testing is disabled during drawing. */
    void setNoDepth(bool f) { m_bNoDepth = f; }
    /** Returns true if depth testing is disabled. */
    bool isNoDepth() const { return m_bNoDepth; }

    /**
     * Mark vertex/index data as updated so the GPU buffer is re-uploaded
     * on the next draw call.
     */
    void setUpdated(bool b)
    {
        if (m_pDrawElems != nullptr) m_pDrawElems->setUpdated(b);
    }

    // ─── Draw / cleanup ───────────────────────────────────────────────────────

    /** Upload draw parameters and issue the triangle draw call (and edge pass if enabled). */
    void draw(DisplayContext *pDC) override;

    /** Delete GPU buffers and reset to uninitialized state. */
    void invalidate() override;

    // ─── State queries ────────────────────────────────────────────────────────

    /** Returns true when the shader and draw elements are ready. */
    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawElems != nullptr;
    }

    /** Returns the number of vertices allocated. */
    int getVertexSize() const
    {
        return (m_pDrawElems != nullptr) ? m_pDrawElems->getSize() : 0;
    }

    /** Returns the number of triangles allocated. */
    int getFaceSize() const
    {
        if (m_pDrawElems == nullptr) return 0;
        // Wireframe mode stores 6 indices per face (3 edges), fill mode stores 3.
        const int nPerFace = (m_nPolygonMode == DisplayContext::POLY_LINE) ? 6 : 3;
        return m_pDrawElems->getIndSize() / nPerFace;
    }

private:
    // Predefined attribute locations (must match layout(location=N) in trig_vert.glsl)
    static constexpr int ATTRLOC_VERTEX = 0;
    static constexpr int ATTRLOC_NORM   = 1;
    static constexpr int ATTRLOC_COLOR  = 2;

    // Edge shader uses the same locations (trigedge_vert.glsl: aVertex=0, aNormal=1)
    static constexpr int ATTRLOC_EVERT  = 0;
    static constexpr int ATTRLOC_ENORM  = 1;

    gfx::ShaderObject *m_pPO;       ///< Main shading program
    gfx::ShaderObject *m_pEdgePO;   ///< Edge/silhouette program
    TrigMesh *m_pDrawElems;
    int m_nEdgeLineType;
    int m_nPolygonMode;
    bool m_bNoDepth;

    void setupAttrs();
    void drawEdges(DisplayContext *pDC);
};

}  // namespace gfx
