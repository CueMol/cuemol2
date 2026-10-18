// -*-Mode: C++;-*-
//
// SphereGpuPrim: Sphere impostor draw primitive
//

#pragma once

#include "GpuPrim.hpp"
#include "DrawAttrElems.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

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
        quint32 hitName;            ///< Encoded hit name (pick pass only)
    };

    /**
     * std140 DrawParamsBlock for the pick program (binding=2, 48 bytes):
     * DrawParams followed by the pick tail (sphere2_pick_vertex.glsl /
     * sphere_pick_frag.glsl).
     */
    struct PickDrawParams
    {
        qfloat32 frag_alpha;        // offset 0
        qfloat32 u_edge;            // offset 4  (0 in the pick pass)
        qint32   u_bsilh;           // offset 8
        qfloat32 _pad;              // offset 12
        qfloat32 u_edgecolor[4];    // offset 16
        quint32  u_rend_idx;        // R channel (1-based renderer index)
        quint32  u_outer_name;      // B channel (encoded outer name)
        quint32  _pp0;
        quint32  _pp1;
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
    ~SphereGpuPrim() override;

    /** Load the sphere impostor shader. */
    bool init(DisplayContext *pDC) override;

    /**
     * Allocate GPU storage for nsph spheres (nsph*4 vertices, nsph*6 indices).
     * Must call init() first. Storage is allocated via the display context's
     * allocBuffer() so the backend (e.g. WebGL) can route to V8 cage memory.
     */
    void alloc(DisplayContext *pDC, int nsph);

    // ─── Data upload ─────────────────────────────────────────────────────────

    /**
     * Set sphere data at the given index.
     * @param devcode Pre-resolved device RGBA colour code.
     * @param hitName Encoded hit name (gfx::encodeHitName) for the pick pass.
     */
    void setData(int idx, const qlib::Vector4D &pos, float rad, quint32 devcode,
                 quint32 hitName = 0);

    /**
     * Mark the vertex data as updated so that the GPU buffer is re-uploaded
     * on the next draw call (in-place update after setData()).
     */
    void setUpdated(bool b)
    {
        if (m_pDrawElem != nullptr) m_pDrawElem->setUpdated(b);
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
    // Integer attribute read by sphere2_pick_vertex.glsl only
    static constexpr int ATTRLOC_HITNAME = 4;

    gfx::ShaderObject *m_pPO;
    gfx::ShaderObject *m_pPickPO;   ///< ID-buffer pick program (lazy)
    SphElemAry32 *m_pDrawElem;

    /** Load the pick program (once). Returns false if unavailable. */
    bool initPick(DisplayContext *pDC);
    /** Draw the spheres into the integer pick target (DisplayContext::isPickDraw). */
    void drawPick(DisplayContext *pDC);

    qfloat32 m_dsps[4][2];  ///< Billboard corner displacements (±1, ±1)
};

}  // namespace gfx
