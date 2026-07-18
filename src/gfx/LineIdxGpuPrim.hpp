// -*-Mode: C++;-*-
//
// LineIdxGpuPrim: Wide-line draw primitive with texture-fetched endpoints
//

#pragma once

#include "GpuPrim.hpp"
#include "DrawAttrElems.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

class FloatDataTexture;

/**
 * Wide-line draw primitive with texture-fetched endpoints.
 *
 * Same instanced screen-space width-quad expansion as LineGpuPrim, but each
 * endpoint is not stored as a position. Instead it carries an index into a
 * coordinate texture (bound via setCoordTex()) plus a static model-space
 * offset. The vertex shader computes the endpoint as fetched_atom_pos + offset.
 *
 * The offset makes the primitive general enough to express, with one shader:
 *   - a bond line:            (idx1, 0), (idx2, 0)
 *   - an isolated-atom aster: 3 segments, same idx on both ends, +-axis offset
 *   - a static double-bond:   (idx1, dir*scale), (idx2, dir*scale)
 *
 * Only the coordinate texture needs re-uploading when positions change; this
 * VBO stays immutable.
 */
class GFX_API LineIdxGpuPrim : public GpuPrim
{
public:
    /** Per-instance vertex attribute layout (one segment = 1 instance). */
    struct LineIdxElem
    {
        qfloat32 ox1, oy1, oz1, idx1;  ///< a_p1: xyz = model-space offset, w = index
        qfloat32 ox2, oy2, oz2, idx2;  ///< a_p2: xyz = model-space offset, w = index
        qbyte r1, g1, b1, a1;          ///< Start point RGBA colour
        qbyte r2, g2, b2, a2;          ///< End point RGBA colour
    };

    /**
     * std140 DrawParamsBlock layout (binding=2, 48 bytes).
     * Must match the DrawParamsBlock uniform block in linew2idx_vert.glsl /
     * linew_frag.glsl. Identical to LineGpuPrim::DrawParams.
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

    using LineIdxArray = gfx::DrawAttrElems<quint32, LineIdxElem>;

    // ---- Lifecycle ----

    LineIdxGpuPrim();
    ~LineIdxGpuPrim() override;

    /** Load the wide-line (coordinate texture) shader. */
    bool init(DisplayContext *pDC) override;

    /** Allocate GPU storage for nlines line segments. Must call init() first. */
    void alloc(DisplayContext *pDC, int nlines);

    // ---- Data upload ----

    /**
     * Set line segment data at the given instance index.
     * @param idx1,idx2 coordinate-texture indices of the two endpoints.
     * @param off1,off2 static model-space offset added to each fetched position.
     * @param devcode1,devcode2 pre-resolved device RGBA colours.
     */
    void setData(int i, int idx1, const qlib::Vector4D &off1, quint32 devcode1,
                 int idx2, const qlib::Vector4D &off2, quint32 devcode2);

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
    // linew2idx_vert.glsl).
    static constexpr int ATTRLOC_P1     = 0;
    static constexpr int ATTRLOC_P2     = 1;
    static constexpr int ATTRLOC_COLOR1 = 2;
    static constexpr int ATTRLOC_COLOR2 = 3;
    static constexpr int COORD_TEX_UNIT = 0;

    gfx::ShaderObject *m_pPO;
    LineIdxArray *m_pDrawAry;
    FloatDataTexture *m_pCoordTex;   ///< non-owning
    int m_nCoordTexUnit;

    float m_linew;
    bool m_bStipple;
    bool m_bNoDepth;

    void setupAttrs();
};

}  // namespace gfx
