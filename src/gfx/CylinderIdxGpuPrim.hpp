// -*-Mode: C++;-*-
//
// CylinderIdxGpuPrim: Cylinder impostor draw primitive with texture-fetched endpoints
//

#pragma once

#include "GpuPrim.hpp"
#include "DrawAttrElems.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

class FloatDataTexture;

/**
 * Cylinder impostor draw primitive with texture-fetched endpoints.
 *
 * Same billboard-quad layout as CylinderGpuPrim, but the two endpoints are not
 * stored per vertex. Instead each vertex carries the two endpoint indices into
 * a coordinate texture (bound via setCoordTex()) plus an endpoint selector; the
 * vertex shader fetches both positions, picks this vertex's centre and computes
 * the axis direction. Only the texture needs re-uploading when positions
 * change; this VBO stays immutable.
 */
class GFX_API CylinderIdxGpuPrim : public GpuPrim
{
public:
    /** Per-vertex attribute layout (one cylinder = 4 vertices). */
    struct CylIdxElem
    {
        qfloat32 idx1, idx2;    ///< a_cyl.xy: endpoint indices into the coord texture
        qfloat32 tthis, tother; ///< a_cyl.zw: this / other end parameter (0=pos1,1=pos2,0.5=mid)
        qfloat32 dspx, dspy;    ///< Billboard corner displacement (+-1)
        qfloat32 rad;           ///< Cylinder radius
        qbyte r, g, b, a;       ///< RGBA colour
    };

    /**
     * std140 DrawParamsBlock layout (binding=2, 32 bytes).
     * Must match the DrawParamsBlock uniform block in cylinder_idx_vertex.glsl /
     * cylinder_frag.glsl. Identical to CylinderGpuPrim::DrawParams.
     */
    struct DrawParams
    {
        qfloat32 frag_alpha;        // offset 0
        qfloat32 u_edge;            // offset 4
        qint32   u_bsilh;           // offset 8
        qfloat32 _pad;              // offset 12
        qfloat32 u_edgecolor[4];    // offset 16
    };

    using CylIdxElemAry32 = gfx::DrawAttrElems<quint32, CylIdxElem>;

    // ---- Lifecycle ----

    CylinderIdxGpuPrim();
    ~CylinderIdxGpuPrim() override;

    /** Load the cylinder impostor (coordinate texture) shader. */
    bool init(DisplayContext *pDC) override;

    /** Allocate GPU storage for ncyl cylinders. Must call init() first. */
    void alloc(DisplayContext *pDC, int ncyl);

    // ---- Data upload ----

    /**
     * Set cylinder data at the given index.
     * @param idx1,idx2 coordinate-texture indices of the bond's two atoms.
     * @param ta,tb parameters of the cylinder's two ends along the bond
     *        (0 = idx1, 1 = idx2, 0.5 = midpoint). Use (0,1) for a full bond,
     *        (0,0.5) / (0.5,1) for the two halves of a bicolour bond.
     * @param devcode Pre-resolved device RGBA colour code.
     */
    void setData(int i, int idx1, int idx2, float ta, float tb, float rad,
                 quint32 devcode);

    /** Bind the coordinate texture to this unit before draw(). Non-owning. */
    void setCoordTex(FloatDataTexture *pTex, int texUnit);

    // ---- Draw / cleanup ----

    /** Upload draw parameters, bind the coordinate texture, and draw. */
    void draw(DisplayContext *pDC) override;

    /** Delete GPU buffers and reset to uninitialized state. */
    void invalidate() override;

    // ---- State queries ----

    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawElem != nullptr;
    }

    int getSize() const
    {
        return (m_pDrawElem != nullptr) ? (m_pDrawElem->getSize() / 4) : 0;
    }

private:
    // Predefined attribute locations (must match layout(location=N) in
    // cylinder_idx_vertex.glsl / cylinder_body_vert.glsl). Location 1 (a_dir)
    // is unused in the index variant.
    static constexpr int ATTRLOC_CYL    = 0;
    static constexpr int ATTRLOC_IMPOS  = 2;
    static constexpr int ATTRLOC_RAD    = 3;
    static constexpr int ATTRLOC_COLOR  = 4;
    static constexpr int COORD_TEX_UNIT = 0;

    gfx::ShaderObject *m_pPO;
    CylIdxElemAry32 *m_pDrawElem;
    FloatDataTexture *m_pCoordTex;   ///< non-owning
    int m_nCoordTexUnit;

    qfloat32 m_dsps[4][2];  ///< Billboard corner displacements (+-1, +-1)
};

}  // namespace gfx
