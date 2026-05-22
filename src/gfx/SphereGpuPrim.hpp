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
     * Allocate GPU storage for nsph spheres (nsph*4 vertices, nsph*6 indices).
     * Must call init() first. Storage is allocated via the display context's
     * allocBuffer() so the backend (e.g. WebGL) can route to V8 cage memory.
     */
    void alloc(DisplayContext *pDC, int nsph);

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

}  // namespace gfx
