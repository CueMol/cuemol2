// -*-Mode: C++;-*-
//
// SphereIdxGpuPrim: Sphere impostor draw primitive with texture-fetched positions
//

#pragma once

#include "GpuPrim.hpp"
#include "DrawAttrElems.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

class FloatDataTexture;

/**
 * Sphere impostor draw primitive with texture-fetched positions.
 *
 * Same billboard-quad layout as SphereGpuPrim, but the sphere centre is not
 * stored per vertex. Instead each vertex carries an index into a coordinate
 * texture that the caller binds via setCoordTex(). Only the texture needs
 * re-uploading when positions change; this VBO stays immutable.
 */
class GFX_API SphereIdxGpuPrim : public GpuPrim
{
public:
    /** Per-vertex attribute layout (one sphere = 4 vertices). */
    struct SphIdxElem
    {
        qfloat32 index;             ///< Index into the coordinate texture
        qfloat32 dspx, dspy;        ///< Billboard corner displacement (+-1)
        qfloat32 rad;               ///< Sphere radius
        qbyte r, g, b, a;           ///< RGBA colour
    };

    /**
     * std140 DrawParamsBlock layout (binding=2, 32 bytes).
     * Must match the DrawParamsBlock uniform block in sphere2idx_vertex.glsl /
     * sphere_frag.glsl. Identical to SphereGpuPrim::DrawParams.
     */
    struct DrawParams
    {
        qfloat32 frag_alpha;        // offset 0  - overall fragment alpha
        qfloat32 u_edge;            // offset 4  - edge/silhouette line width
        qint32   u_bsilh;           // offset 8  - silhouette mode flag (1=silhouette, 0=edge)
        qfloat32 _pad;              // offset 12 - padding
        qfloat32 u_edgecolor[4];    // offset 16 - edge line RGBA colour
    };

    using SphIdxElemAry32 = gfx::DrawAttrElems<quint32, SphIdxElem>;

    // ---- Lifecycle ----

    SphereIdxGpuPrim();
    ~SphereIdxGpuPrim() override;

    /** Load the sphere impostor (coordinate texture) shader. */
    bool init(DisplayContext *pDC) override;

    /**
     * Allocate GPU storage for nsph spheres (nsph*4 vertices, nsph*6 indices).
     * Must call init() first.
     */
    void alloc(DisplayContext *pDC, int nsph);

    // ---- Data upload ----

    /**
     * Set the per-sphere invariant data at the given index.
     * @param idx Index into the coordinate texture (the sphere centre lookup).
     * @param devcode Pre-resolved device RGBA colour code.
     */
    void setData(int i, int idx, float rad, quint32 devcode);

    /** Bind the coordinate texture to this unit before draw(). Non-owning. */
    void setCoordTex(FloatDataTexture *pTex, int texUnit);

    // ---- Draw / cleanup ----

    /** Upload draw parameters, bind the coordinate texture, and draw. */
    void draw(DisplayContext *pDC) override;

    /** Delete GPU buffers and reset to uninitialized state. */
    void invalidate() override;

    // ---- State queries ----

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
    // Predefined attribute locations (must match layout(location=N) in
    // sphere2idx_vertex.glsl / sphere2_body_vert.glsl).
    static constexpr int ATTRLOC_INDEX  = 0;
    static constexpr int ATTRLOC_IMPOS  = 1;
    static constexpr int ATTRLOC_RAD    = 2;
    static constexpr int ATTRLOC_COLOR  = 3;
    static constexpr int COORD_TEX_UNIT = 0;

    gfx::ShaderObject *m_pPO;
    SphIdxElemAry32 *m_pDrawElem;
    FloatDataTexture *m_pCoordTex;   ///< non-owning
    int m_nCoordTexUnit;

    qfloat32 m_dsps[4][2];  ///< Billboard corner displacements (+-1, +-1)
};

}  // namespace gfx
