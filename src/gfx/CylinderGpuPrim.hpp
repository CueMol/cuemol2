// -*-Mode: C++;-*-
//
// CylinderGpuPrim: Cylinder impostor draw primitive
//

#pragma once

#include "GpuPrim.hpp"
#include "DrawAttrElems.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

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

}  // namespace gfx
