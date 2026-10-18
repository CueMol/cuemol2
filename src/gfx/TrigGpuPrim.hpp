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

    /** Per-vertex attribute layout (LAYOUT_INTERLEAVED). */
    struct TrigVertAttr
    {
        qfloat32 x, y, z;      ///< Position
        qfloat32 nx, ny, nz;   ///< Normal
        qbyte r, g, b, a;      ///< RGBA colour
        quint32 hitName;       ///< Encoded hit name (pick pass only)
    };

    /**
     * Vertex storage layouts (see setLayout()).
     *
     * LAYOUT_INTERLEAVED: one TrigVertAttr (32 bytes) per vertex.
     *
     * LAYOUT_PACKED: one block per attribute, in this order: positions
     * (float x3, 12 bytes per vertex), normals (one GL_INT_2_10_10_10_REV
     * word, 4 bytes), colours (RGBA bytes, 4 bytes) and hit names (4 bytes).
     * Positions and normals come first and adjoin, so a coordinate update
     * re-uploads 16 bytes per vertex (markUpdated(UPD_GEOM)) and a colour
     * update 4 bytes.
     */
    static constexpr int LAYOUT_INTERLEAVED = 0;
    static constexpr int LAYOUT_PACKED = 1;

    /** Storage unit of LAYOUT_PACKED: the buffer holds one per vertex (24
     *  bytes), but laid out by attribute blocks, not per vertex. */
    struct PackedUnit
    {
        quint32 w[6];
    };

    /** Writable attribute blocks of a LAYOUT_PACKED primitive. */
    struct PackedArrays
    {
        qfloat32 *pos;     ///< 3 floats per vertex
        quint32 *norm;     ///< packed normal (packNormal()) per vertex
        qbyte *color;      ///< RGBA bytes per vertex
        quint32 *hitName;  ///< encoded hit name per vertex
    };

    /** Which data markUpdated() re-uploads. */
    static constexpr int UPD_GEOM = 1;   ///< positions and normals
    static constexpr int UPD_COLOR = 2;  ///< colours

    /**
     * Pack a normal into a GL_INT_2_10_10_10_REV word: x, y, z as signed
     * normalized 10-bit values (x in the low bits) and w = 1, which is what
     * a three-component float normal reads as in the vec4 shader input.
     */
    static quint32 packNormal(float x, float y, float z)
    {
        return packSnorm10(x) | (packSnorm10(y) << 10) | (packSnorm10(z) << 20) |
               (quint32(1) << 30);
    }

    /** Inverse of packNormal() (x, y, z only), as the GPU decodes it. */
    static qlib::Vector4D unpackNormal(quint32 w);

    /**
     * std140 DrawParamsBlock for the pick program (binding=2, 32 bytes):
     * the DrawParams fields followed by the pick tail. Must match
     * trig_pick_vert.glsl / trig_pick_frag.glsl.
     */
    struct PickDrawParams
    {
        qfloat32 frag_alpha;        // offset 0  (unused)
        qint32   enable_lighting;   // offset 4  (always 0)
        qint32   u_nodepth;         // offset 8
        qfloat32 _pad;              // offset 12
        quint32  u_rend_idx;        // offset 16 -- R channel (1-based renderer index)
        quint32  u_outer_name;      // offset 20 -- B channel (encoded outer name)
        quint32  _pp0;              // offset 24
        quint32  _pp1;              // offset 28
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
    using PackedMesh = gfx::DrawAttrElems<quint32, PackedUnit>;

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    TrigGpuPrim();
    ~TrigGpuPrim() override;

    /** Load the triangle mesh and edge shaders. */
    bool init(DisplayContext *pDC) override;

    /**
     * Set the vertex storage layout (LAYOUT_INTERLEAVED, the default, or
     * LAYOUT_PACKED). Must be set before alloc().
     */
    void setLayout(int n) { m_nLayout = n; }
    int getLayout() const { return m_nLayout; }

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

    /** Set the encoded hit name (gfx::encodeHitName) of vertex idx. */
    void setHitName(int idx, quint32 name);

    // Vertex data of either layout, as stored (exposed for inspection/testing)

    /** Position of vertex idx. */
    qlib::Vector4D getVertex(int idx) const;
    /** Normal of vertex idx (after packing in LAYOUT_PACKED). */
    qlib::Vector4D getNormal(int idx) const;
    /** Colour of vertex idx as (r << 24) | (g << 16) | (b << 8) | a. */
    quint32 getColorRGBA(int idx) const;
    /** Encoded hit name of vertex idx. */
    quint32 getHitName(int idx) const;

    /**
     * The vertex array (getVertexSize() elements, contiguous) of a
     * LAYOUT_INTERLEAVED primitive for writing the vertex data in place
     * (nullptr in LAYOUT_PACKED). Call setUpdated(true) afterwards.
     */
    TrigVertAttr *getVertexArray()
    {
        return (m_pDrawElems != nullptr && m_pDrawElems->getSize() > 0)
                   ? &m_pDrawElems->at(0)
                   : nullptr;
    }
    const TrigVertAttr *getVertexArray() const
    {
        return (m_pDrawElems != nullptr && m_pDrawElems->getSize() > 0)
                   ? &m_pDrawElems->at(0)
                   : nullptr;
    }

    /**
     * The attribute blocks of a LAYOUT_PACKED primitive for writing the
     * vertex data in place (all nullptr in LAYOUT_INTERLEAVED or before
     * alloc()). Call markUpdated() afterwards.
     */
    PackedArrays getPackedArrays();

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
        if (attrs() != nullptr) attrs()->setUpdated(b);
    }

    /**
     * Mark only the data in nFlags (UPD_GEOM / UPD_COLOR) as updated, so
     * that a LAYOUT_PACKED primitive re-uploads only those attribute blocks
     * (LAYOUT_INTERLEAVED re-uploads everything).
     */
    void markUpdated(int nFlags);

    // ─── Draw / cleanup ───────────────────────────────────────────────────────

    /** Upload draw parameters and issue the triangle draw call (and edge pass if enabled). */
    void draw(DisplayContext *pDC) override;

    /** Delete GPU buffers and reset to uninitialized state. */
    void invalidate() override;

    // ─── State queries ────────────────────────────────────────────────────────

    /** Returns true when the shader and draw elements are ready. */
    bool isValid() const override
    {
        return m_pPO != nullptr && attrs() != nullptr;
    }

    /** Returns the number of vertices allocated. */
    int getVertexSize() const
    {
        // one storage element per vertex in either layout
        return (attrs() != nullptr) ? attrs()->getSize() : 0;
    }

    /** Returns the number of triangles allocated. */
    int getFaceSize() const
    {
        if (attrs() == nullptr) return 0;
        // Wireframe mode stores 6 indices per face (3 edges), fill mode stores 3.
        const int nPerFace = (m_nPolygonMode == DisplayContext::POLY_LINE) ? 6 : 3;
        return int(attrs()->getIndSize()) / nPerFace;
    }

private:
    // Predefined attribute locations (must match layout(location=N) in trig_vert.glsl)
    static constexpr int ATTRLOC_VERTEX = 0;
    static constexpr int ATTRLOC_NORM   = 1;
    static constexpr int ATTRLOC_COLOR  = 2;
    // Integer attribute read by trig_pick_vert.glsl only
    static constexpr int ATTRLOC_HITNAME = 3;

    // Edge shader uses the same locations (trigedge_vert.glsl: aVertex=0, aNormal=1)
    static constexpr int ATTRLOC_EVERT  = 0;
    static constexpr int ATTRLOC_ENORM  = 1;

    gfx::ShaderObject *m_pPO;       ///< Main shading program
    gfx::ShaderObject *m_pEdgePO;   ///< Edge/silhouette program
    gfx::ShaderObject *m_pPickPO;   ///< ID-buffer pick program (lazy)
    TrigMesh *m_pDrawElems;         ///< storage in LAYOUT_INTERLEAVED
    PackedMesh *m_pPackedElems;     ///< storage in LAYOUT_PACKED
    int m_nLayout;
    int m_nEdgeLineType;
    int m_nPolygonMode;
    bool m_bNoDepth;

    /** The allocated storage of either layout (nullptr before alloc()). */
    AbstDrawAttrs *attrs() const
    {
        if (m_pDrawElems != nullptr) return m_pDrawElems;
        return m_pPackedElems;
    }

    /** Start of the LAYOUT_PACKED block that begins nWordsBefore 4-byte
     *  words per vertex into the storage (positions 0, normals 3, colours 4,
     *  hit names 5). */
    qbyte *packedBlock(int nWordsBefore) const;

    static quint32 packSnorm10(float c)
    {
        if (c > 1.0f) c = 1.0f;
        if (c < -1.0f) c = -1.0f;
        const int i = int(c * 511.0f + (c >= 0.0f ? 0.5f : -0.5f));
        return quint32(i) & 0x3FFu;
    }

    void setupAttrs();
    void drawEdges(DisplayContext *pDC);

    /** Load the pick program (once). Returns false if unavailable. */
    bool initPick(DisplayContext *pDC);
    /** Draw the mesh into the integer pick target (DisplayContext::isPickDraw). */
    void drawPick(DisplayContext *pDC);
};

}  // namespace gfx
