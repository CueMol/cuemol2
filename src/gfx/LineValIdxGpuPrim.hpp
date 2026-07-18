// -*-Mode: C++;-*-
//
// LineValIdxGpuPrim: valence-aware wide-line primitive with texture-fetched
// endpoints and shader-computed double/triple-bond displacement.
//

#pragma once

#include "GpuPrim.hpp"
#include "DrawAttrElems.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

class FloatDataTexture;

/**
 * Valence-aware wide-line draw primitive with texture-fetched endpoints.
 *
 * A superset of LineIdxGpuPrim tailored to the stick (SimpleRenderer) model.
 * Each endpoint is expressed parametrically along a bond plus a static offset:
 *
 *     endpoint = mix(pos(idx1), pos(idx2), t) + offset + dir * dispScale
 *
 * where pos() is fetched from the coordinate texture (bound via setCoordTex()).
 * This lets one shader express, animation-correctly:
 *   - a single bond:        idx1..idx2, t=0..1, dispScale=0
 *   - a bicolour half:      t=0..0.5 / 1..0.5 (midpoint follows the atoms)
 *   - a double / triple bond parallel line: dispScale != 0 -- the displacement
 *     direction dir is recomputed per frame in the vertex shader from a
 *     reference (distal) atom, or a view-facing fallback when the reference is
 *     absent or collinear (isolated double bonds, triple bonds).
 *   - an isolated-atom aster: idx1==idx2, +-axis static offsets.
 *
 * Only the coordinate texture needs re-uploading when positions change; this
 * VBO stays immutable.
 */
class GFX_API LineValIdxGpuPrim : public GpuPrim
{
public:
    /** Per-instance vertex attribute layout (one segment = 1 instance). */
    struct LineValElem
    {
        qfloat32 ox1, oy1, oz1, idx1;  ///< a_p1: xyz = model offset, w = index1
        qfloat32 ox2, oy2, oz2, idx2;  ///< a_p2: xyz = model offset, w = index2
        qfloat32 t1, t2, dispScale, idxd;  ///< a_val: params, disp scale, ref idx
        qbyte r1, g1, b1, a1;          ///< Start point RGBA colour
        qbyte r2, g2, b2, a2;          ///< End point RGBA colour
    };

    /**
     * std140 DrawParamsBlock layout (binding=2, 48 bytes).
     * Must match the DrawParamsBlock uniform block in linevalidx_vert.glsl /
     * linew_frag.glsl. Identical to LineIdxGpuPrim::DrawParams.
     */
    struct DrawParams
    {
        qfloat32 frag_alpha;        // offset 0
        qfloat32 lineWidth;         // offset 4
        qfloat32 stippleLen;        // offset 8
        qint32   u_nodepth;         // offset 12
        qfloat32 screenSize[2];     // offset 16
        qint32   use_u_color;       // offset 24
        qfloat32 _pad;              // offset 28
        qfloat32 u_color[4];        // offset 32
    };

    using LineValArray = gfx::DrawAttrElems<quint32, LineValElem>;

    // ---- Lifecycle ----

    LineValIdxGpuPrim();
    ~LineValIdxGpuPrim() override;

    /** Load the valence wide-line (coordinate texture) shader. */
    bool init(DisplayContext *pDC) override;

    /** Allocate GPU storage for nlines line segments. Must call init() first. */
    void alloc(DisplayContext *pDC, int nlines);

    // ---- Data upload ----

    /**
     * Plain line segment between two atoms (no displacement).
     * @param t1,t2 endpoint parameters along the bond (0=idx1, 1=idx2,
     *        0.5=midpoint). Use (0,1) for a full bond, (0,0.5)/(1,0.5) for the
     *        two halves of a bicolour bond.
     */
    void setLine(int i, int idx1, int idx2, float t1, float t2, quint32 dc1,
                 quint32 dc2);

    /**
     * Displaced (double/triple bond parallel) line between two atoms.
     * @param dispScale signed displacement magnitude along the perpendicular.
     * @param idxd coordinate-texture index of the reference (distal) atom that
     *        defines the in-plane perpendicular, or -1 to use the view-facing
     *        fallback (isolated double bonds / collinear triple bonds).
     */
    void setValLine(int i, int idx1, int idx2, float t1, float t2,
                    float dispScale, int idxd, quint32 dc1, quint32 dc2);

    /**
     * Isolated-atom aster arm: both endpoints reference the same atom, with
     * static model-space offsets (e.g. -axis .. +axis).
     */
    void setAster(int i, int idx, const qlib::Vector4D &off1,
                  const qlib::Vector4D &off2, quint32 dc);

    /** Bind the coordinate texture to this unit before draw(). Non-owning. */
    void setCoordTex(FloatDataTexture *pTex, int texUnit);

    // ---- Properties ----

    void setLineWidth(float lw) { m_linew = lw; }
    float getLineWidth() const { return m_linew; }

    void setStipple(bool f) { m_bStipple = f; }
    bool isStipple() const { return m_bStipple; }

    void setNoDepth(bool f) { m_bNoDepth = f; }
    bool isNoDepth() const { return m_bNoDepth; }

    // ---- Draw / cleanup ----

    /** Upload draw parameters, bind the coordinate texture, and draw. */
    void draw(DisplayContext *pDC) override;

    /** Delete GPU buffers and reset to uninitialized state. */
    void invalidate() override;

    // ---- State queries ----

    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawAry != nullptr;
    }

    int getSize() const
    {
        return (m_pDrawAry != nullptr) ? m_pDrawAry->getSize() : 0;
    }

private:
    // Predefined attribute locations (must match layout(location=N) in
    // linevalidx_vert.glsl).
    static constexpr int ATTRLOC_P1     = 0;
    static constexpr int ATTRLOC_P2     = 1;
    static constexpr int ATTRLOC_VAL    = 2;
    static constexpr int ATTRLOC_COLOR1 = 3;
    static constexpr int ATTRLOC_COLOR2 = 4;
    static constexpr int COORD_TEX_UNIT = 0;

    gfx::ShaderObject *m_pPO;
    LineValArray *m_pDrawAry;
    FloatDataTexture *m_pCoordTex;   ///< non-owning
    int m_nCoordTexUnit;

    float m_linew;
    bool m_bStipple;
    bool m_bNoDepth;

    void setupAttrs();
};

}  // namespace gfx
