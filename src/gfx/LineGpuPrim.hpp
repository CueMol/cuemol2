// -*-Mode: C++;-*-
//
// LineGpuPrim: Wide-line draw primitive
//

#pragma once

#include "GpuPrim.hpp"
#include "DrawAttrElems.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

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
     * Must call init() first. Storage is routed via DisplayContext::allocBuffer.
     */
    void alloc(DisplayContext *pDC, int nlines);

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
