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
        quint32 hitNameA;           ///< Encoded hit name of the pos1 half (pick pass)
        quint32 hitNameB;           ///< Encoded hit name of the pos2 half (pick pass)
    };

    /**
     * std140 DrawParamsBlock for the pick program (binding=2, 48 bytes):
     * DrawParams followed by the pick tail (cylinder_pick_vertex.glsl /
     * cylinder_pick_frag.glsl).
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
    ~CylinderGpuPrim() override;

    /** Load the cylinder impostor shader. */
    bool init(DisplayContext *pDC) override;

    /**
     * Allocate GPU storage for ncyl cylinders (ncyl*4 vertices, ncyl*6 indices).
     * Must call init() first. Storage is routed via DisplayContext::allocBuffer.
     */
    void alloc(DisplayContext *pDC, int ncyl);

    // ─── Data upload ─────────────────────────────────────────────────────────

    /**
     * Set cylinder data at the given index.
     * @param pos1    First endpoint.
     * @param pos2    Second endpoint.
     * @param devcode Pre-resolved device RGBA colour code.
     */
    void setData(int idx, const qlib::Vector4D &pos1, const qlib::Vector4D &pos2,
                 float rad, quint32 devcode, quint32 hitNameA = 0,
                 quint32 hitNameB = 0);

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
    // Integer attributes read by cylinder_pick_vertex.glsl only
    static constexpr int ATTRLOC_HITNAME_A = 5;
    static constexpr int ATTRLOC_HITNAME_B = 6;

    gfx::ShaderObject *m_pPO;
    gfx::ShaderObject *m_pPickPO;   ///< ID-buffer pick program (lazy)
    CylElemAry32 *m_pDrawElem;

    /** Load the pick program (once). Returns false if unavailable. */
    bool initPick(DisplayContext *pDC);
    /** Draw the cylinders into the integer pick target (DisplayContext::isPickDraw). */
    void drawPick(DisplayContext *pDC);

    qfloat32 m_dsps[4][2];  ///< Billboard corner displacements (±1, ±1)
};

}  // namespace gfx
