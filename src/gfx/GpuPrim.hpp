// -*-Mode: C++;-*-
//
// GpuPrim: OpenGL-independent GPU primitive draw classes
//

#pragma once

#include "gfx.hpp"
#include "DrawAttrArray.hpp"
#include "DisplayContext.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

class ShaderObject;

/**
 * Base interface for all GpuPrim classes.
 *
 * A GpuPrim encapsulates a shader program together with its vertex/instance
 * data and the logic to upload draw parameters and issue draw calls.
 * Typical usage: init() → alloc() → set*() → draw() per frame → invalidate().
 */
class GFX_API GpuPrim
{
public:
    GpuPrim() = default;
    virtual ~GpuPrim() = default;

    /** Load shaders and allocate GPU resources. Must be called before alloc()/draw(). */
    virtual bool init(DisplayContext *pDC) = 0;

    /** Issue the draw call using the given display context. */
    virtual void draw(DisplayContext *pDC) = 0;

    /** Release all GPU resources (shader program, draw elements). */
    virtual void invalidate() = 0;

    /** Returns true when init() and alloc() have both completed successfully. */
    virtual bool isValid() const = 0;
};

//////////////////////////////////////////////////////////////////////////

/**
 * Sphere impostor draw primitive.
 *
 * Uses instanced quad rendering: each SphElem encodes one sphere as a
 * billboard quad (4 vertices) that is ray-cast in the fragment shader.
 */
class GFX_API SphereGpuPrim : public GpuPrim
{
public:
    // ─── Data structures ─────────────────────────────────────────────────────

    /** Per-instance vertex attribute layout (one sphere = 4 vertices). */
    struct SphElem
    {
        qfloat32 cenx, ceny, cenz;  ///< Sphere centre position
        qfloat32 dspx, dspy;        ///< Billboard corner displacement (±1)
        qfloat32 rad;               ///< Sphere radius
        qbyte r, g, b, a;           ///< RGBA colour
    };

    /**
     * std140 DrawParamsBlock layout (binding=2, 32 bytes).
     * Must match the DrawParamsBlock uniform block in sphere2_vertex.glsl / sphere_frag.glsl.
     */
    struct DrawParams
    {
        qfloat32 frag_alpha;        // offset 0  — overall fragment alpha
        qfloat32 u_edge;            // offset 4  — edge/silhouette line width
        qint32   u_bsilh;           // offset 8  — silhouette mode flag (1=silhouette, 0=edge)
        qfloat32 _pad;              // offset 12 — padding
        qfloat32 u_edgecolor[4];    // offset 16 — edge line RGBA colour
    };

    using SphElemAry32 = gfx::DrawAttrElems<quint32, SphElem>;

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    SphereGpuPrim();
    virtual ~SphereGpuPrim();

    /** Load the sphere impostor shader. */
    bool init(DisplayContext *pDC) override;

    /**
     * Allocate GPU storage for nsph spheres (nsph×4 vertices, nsph×6 indices).
     * Must call init() first.
     */
    void alloc(int nsph);

    // ─── Data upload ─────────────────────────────────────────────────────────

    /**
     * Set sphere data at the given index.
     * @param devcode Pre-resolved device RGBA colour code.
     */
    void setData(int idx, const qlib::Vector4D &pos, float rad, quint32 devcode);

    // ─── Draw / cleanup ───────────────────────────────────────────────────────

    /** Upload draw parameters and issue the instanced draw call. */
    void draw(DisplayContext *pDC) override;

    /** Delete GPU buffers and reset to uninitialized state. */
    void invalidate() override;

    // ─── State queries ────────────────────────────────────────────────────────

    /** Returns true when the shader and draw elements are ready. */
    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawElem != nullptr;
    }

    /** Returns the number of spheres allocated. */
    int getSize() const
    {
        return (m_pDrawElem != nullptr) ? (m_pDrawElem->getSize() / 4) : 0;
    }

private:
    // Predefined attribute locations (must match layout(location=N) in sphere2_vertex.glsl)
    static constexpr int ATTRLOC_VERTEX = 0;
    static constexpr int ATTRLOC_IMPOS  = 1;
    static constexpr int ATTRLOC_RAD    = 2;
    static constexpr int ATTRLOC_COLOR  = 3;

    gfx::ShaderObject *m_pPO;
    SphElemAry32 *m_pDrawElem;

    qfloat32 m_dsps[4][2];  ///< Billboard corner displacements (±1, ±1)
};

//////////////////////////////////////////////////////////////////////////

/**
 * Cylinder impostor draw primitive.
 *
 * Uses instanced quad rendering: each CylElem encodes one cylinder as a
 * billboard quad that is ray-cast in the fragment shader.
 */
class GFX_API CylinderGpuPrim : public GpuPrim
{
public:
    // ─── Data structures ─────────────────────────────────────────────────────

    /** Per-instance vertex attribute layout (one cylinder = 4 vertices). */
    struct CylElem
    {
        qfloat32 cenx, ceny, cenz;  ///< Endpoint position (alternates between pos1/pos2)
        qfloat32 dirx, diry, dirz;  ///< Cylinder axis direction vector
        qfloat32 dspx, dspy;        ///< Billboard corner displacement (±1)
        qfloat32 rad;               ///< Cylinder radius
        qbyte r, g, b, a;           ///< RGBA colour
    };

    /**
     * std140 DrawParamsBlock layout (binding=2, 32 bytes).
     * Must match the DrawParamsBlock uniform block in cylinder_vertex.glsl / cylinder_frag.glsl.
     * Layout is identical to SphereGpuPrim::DrawParams.
     */
    struct DrawParams
    {
        qfloat32 frag_alpha;        // offset 0  — overall fragment alpha
        qfloat32 u_edge;            // offset 4  — edge/silhouette line width
        qint32   u_bsilh;           // offset 8  — silhouette mode flag (1=silhouette, 0=edge)
        qfloat32 _pad;              // offset 12 — padding
        qfloat32 u_edgecolor[4];    // offset 16 — edge line RGBA colour
    };

    using CylElemAry32 = gfx::DrawAttrElems<quint32, CylElem>;

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    CylinderGpuPrim();
    virtual ~CylinderGpuPrim();

    /** Load the cylinder impostor shader. */
    bool init(DisplayContext *pDC) override;

    /**
     * Allocate GPU storage for ncyl cylinders (ncyl×4 vertices, ncyl×6 indices).
     * Must call init() first.
     */
    void alloc(int ncyl);

    // ─── Data upload ─────────────────────────────────────────────────────────

    /**
     * Set cylinder data at the given index.
     * @param pos1    First endpoint.
     * @param pos2    Second endpoint.
     * @param devcode Pre-resolved device RGBA colour code.
     */
    void setData(int idx, const qlib::Vector4D &pos1, const qlib::Vector4D &pos2,
                 float rad, quint32 devcode);

    // ─── Draw / cleanup ───────────────────────────────────────────────────────

    /** Upload draw parameters and issue the instanced draw call. */
    void draw(DisplayContext *pDC) override;

    /** Delete GPU buffers and reset to uninitialized state. */
    void invalidate() override;

    // ─── State queries ────────────────────────────────────────────────────────

    /** Returns true when the shader and draw elements are ready. */
    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawElem != nullptr;
    }

    /** Returns the number of cylinders allocated. */
    int getSize() const
    {
        return (m_pDrawElem != nullptr) ? (m_pDrawElem->getSize() / 4) : 0;
    }

private:
    // Predefined attribute locations (must match layout(location=N) in cylinder_vertex.glsl)
    static constexpr int ATTRLOC_VERTEX = 0;
    static constexpr int ATTRLOC_DIR    = 1;
    static constexpr int ATTRLOC_IMPOS  = 2;
    static constexpr int ATTRLOC_RAD    = 3;
    static constexpr int ATTRLOC_COLOR  = 4;

    gfx::ShaderObject *m_pPO;
    CylElemAry32 *m_pDrawElem;

    qfloat32 m_dsps[4][2];  ///< Billboard corner displacements (±1, ±1)
};

//////////////////////////////////////////////////////////////////////////

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
    virtual ~TrigGpuPrim();

    /** Load the triangle mesh and edge shaders. */
    bool init(DisplayContext *pDC) override;

    /**
     * Allocate GPU storage for nverts vertices and nfaces triangles.
     * Must call init() first.
     */
    void alloc(int nverts, int nfaces);

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
        return (m_pDrawElems != nullptr) ? (m_pDrawElems->getIndSize() / 3) : 0;
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
    bool m_bNoDepth;

    void setupAttrs();
    void drawEdges(DisplayContext *pDC);
};


//////////////////////////////////////////////////////////////////////////

/**
 * Wide-line draw primitive using instanced impostor quads.
 *
 * Each LineElem encodes one line segment. The geometry is expanded into a
 * screen-aligned quad in the vertex shader to achieve sub-pixel-accurate
 * line width and optional stippling.
 */
class GFX_API LineGpuPrim : public GpuPrim
{
public:
    // ─── Data structures ─────────────────────────────────────────────────────

    /** Per-instance vertex attribute layout (one segment = 1 instance). */
    struct LineElem
    {
        qfloat32 x1, y1, z1;       ///< Start point position
        qfloat32 x2, y2, z2;       ///< End point position
        qbyte r1, g1, b1, a1;      ///< Start point RGBA colour
        qbyte r2, g2, b2, a2;      ///< End point RGBA colour
    };

    /**
     * std140 DrawParamsBlock layout (binding=2, 48 bytes).
     * Must match the DrawParamsBlock uniform block in linew2_vert.glsl / linew_frag.glsl.
     */
    struct DrawParams
    {
        qfloat32 frag_alpha;        // offset 0  — overall fragment alpha
        qfloat32 lineWidth;         // offset 4  — line width in pixels
        qfloat32 stippleLen;        // offset 8  — stipple dash length (0 = solid)
        qint32   u_nodepth;         // offset 12 — 1 = disable depth test
        qfloat32 screenSize[2];     // offset 16 — viewport width and height in pixels
        qint32   use_u_color;       // offset 24 — 1 = use u_color, 0 = use per-vertex colour
        qfloat32 _pad;              // offset 28 — padding
        qfloat32 u_color[4];        // offset 32 — uniform RGBA colour (when use_u_color=1)
    };

    using LineArray = gfx::DrawAttrElems<quint32, LineElem>;

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    LineGpuPrim();
    virtual ~LineGpuPrim();

    /** Load the wide-line shader. */
    bool init(DisplayContext *pDC) override;

    /**
     * Allocate GPU storage for nlines line segments.
     * Must call init() first.
     */
    void alloc(int nlines);

    // ─── Data upload ─────────────────────────────────────────────────────────

    /**
     * Set line segment data at the given index.
     * @param devcode1 Pre-resolved device RGBA colour for the start point.
     * @param devcode2 Pre-resolved device RGBA colour for the end point.
     */
    void setLine(int idx, const qlib::Vector4D &v1, quint32 devcode1,
                 const qlib::Vector4D &v2, quint32 devcode2);

    // ─── Properties ───────────────────────────────────────────────────────────

    /** Set the rendered line width in pixels. */
    void setLineWidth(float lw) { m_linew = lw; }
    /** Return the rendered line width in pixels. */
    float getLineWidth() const { return m_linew; }

    /** Enable or disable stipple (dashed) rendering. */
    void setStipple(bool f) { m_bStipple = f; }
    /** Returns true if stipple rendering is enabled. */
    bool isStipple() const { return m_bStipple; }

    /** When true, depth testing is disabled during drawing. */
    void setNoDepth(bool f) { m_bNoDepth = f; }
    /** Returns true if depth testing is disabled. */
    bool isNoDepth() const { return m_bNoDepth; }

    /**
     * When true (default), per-vertex colours from LineElem are used.
     * When false, the display context's current colour is used for all vertices.
     */
    void setUseVertColor(bool f) { m_bUseVertColor = f; }
    /** Returns true if per-vertex colouring is active. */
    bool isUseVertColor() const { return m_bUseVertColor; }

    /**
     * Mark vertex data as updated so the GPU buffer is re-uploaded
     * on the next draw call.
     */
    void setUpdated(bool b)
    {
        if (m_pDrawAry != nullptr) m_pDrawAry->setUpdated(b);
    }

    // ─── Draw / cleanup ───────────────────────────────────────────────────────

    /** Upload draw parameters and issue the instanced draw call. */
    void draw(DisplayContext *pDC) override;

    /** Delete GPU buffers and reset to uninitialized state. */
    void invalidate() override;

    // ─── State queries ────────────────────────────────────────────────────────

    /** Returns true when the shader and draw elements are ready. */
    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawAry != nullptr;
    }

    /** Returns the number of line segments allocated. */
    int getSize() const
    {
        return (m_pDrawAry != nullptr) ? m_pDrawAry->getSize() : 0;
    }

private:
    // Predefined attribute locations (must match layout(location=N) in linew2_vert.glsl)
    static constexpr int ATTRLOC_VERTEX1 = 0;
    static constexpr int ATTRLOC_VERTEX2 = 1;
    static constexpr int ATTRLOC_COLOR1  = 2;
    static constexpr int ATTRLOC_COLOR2  = 3;

    gfx::ShaderObject *m_pPO;
    LineArray *m_pDrawAry;

    float m_linew;          ///< Line width in pixels
    bool m_bStipple;        ///< Enable stipple (dashed) rendering
    bool m_bNoDepth;        ///< Disable depth testing when drawing
    bool m_bUseVertColor;   ///< Use per-vertex colour (true) or uniform colour (false)

    void setupAttrs();
};

}  // namespace gfx
