// -*-Mode: C++;-*-
//
// Coordinate-texture support for molecular renderers
//

#ifndef MOLSTR_COORDTEXSUPPORT_HPP_INCLUDED
#define MOLSTR_COORDTEXSUPPORT_HPP_INCLUDED

#include "molstr.hpp"
#include "MolCoord.hpp"

#include <unordered_map>
#include <vector>

namespace gfx {
class DisplayContext;
class FloatDataTexture;
}  // namespace gfx

namespace molstr {

///
/// Holds the per-atom coordinate texture a GPU renderer draws from.
///
/// A renderer that puts atom positions in a texture draws a fixed vertex
/// buffer -- indices, radii, colours -- and sends only the positions again
/// when the atoms move. This carries that texture, the atoms it stands for,
/// and the two operations around it: building the layout once, and re-sending
/// the positions per frame.
///
/// Where the positions come from depends on what kind of molecule it is. An
/// AnimMol keeps its coordinates in a flat array, so the atoms are resolved to
/// array indices when the layout is built and each frame is a strided copy.
/// Any other molecule owns its coordinates atom by atom and is read through
/// MolAtom::getPos(), one std::map lookup apiece -- slower, but that is the
/// right way to read a structure that can be edited, and one that can be
/// edited is not being re-sent every frame anyway.
///
/// A host renderer inherits this next to its renderer base, calls ctAlloc()
/// from its build path and ctUpdate() from display(), and forwards its
/// invalidateDisplayCache() to ctInvalidate().
///
class MOLSTR_API CoordTexSupport
{
public:
    /// Texture width in texels; must match TEX2D_WIDTH in lib_atoms.glsl.
    static const int TEX2D_WIDTH = 1024;

    CoordTexSupport();
    virtual ~CoordTexSupport();

    /// Start a new layout, dropping the previous one.
    void ctBegin();

    ///
    /// Add an atom to the layout and return its texel index.
    ///
    /// An atom offered twice keeps the index it got the first time, which is
    /// what lets a renderer walk bonds or residues without having to work out
    /// beforehand which atoms it will end up touching.
    ///
    int ctAddAtom(int aid);

    /// Texel index of an atom already in the layout, or -1.
    int ctIndexOf(int aid) const;

    /// AID at a texel index, for a second pass that fills the per-atom vertex
    /// data (radius, colour, hit name) the layout pass only counted.
    int ctAtomIDAt(int idx) const
    {
        return m_aidcache[idx];
    }

    /// How many atoms the layout holds.
    int ctAtomCount() const
    {
        return static_cast<int>(m_aidcache.size());
    }

    ///
    /// Create the texture for the current layout and fill it.
    ///
    /// False means nothing will be drawn: either the layout is empty, or the
    /// backend has no float textures and the renderer should fall back. The
    /// two are told apart by ctNothingToDraw().
    ///
    bool ctAlloc(gfx::DisplayContext *pdc, const MolCoordPtr &pMol);

    ///
    /// Re-send the atom positions.
    ///
    /// False means the layout no longer matches the molecule (an atom has gone)
    /// and the caller should rebuild from scratch.
    ///
    bool ctUpdate(const MolCoordPtr &pMol);

    /// Drop the texture and the layout.
    void ctInvalidate();

    /// The texture, for handing to the GPU primitives that sample it.
    gfx::FloatDataTexture *ctTexture() const
    {
        return m_pCoordTex;
    }

    ///
    /// Whether the last build found nothing to draw.
    ///
    /// Distinct from "not built yet": a renderer whose selection matches no
    /// atoms would otherwise rebuild its whole layout every frame, walking the
    /// molecule and evaluating the selection to produce nothing, for as long
    /// as the selection stayed empty. Cleared by ctInvalidate(), which is
    /// where a selection or topology change ends up.
    ///
    bool ctNothingToDraw() const
    {
        return m_bNothingToDraw;
    }

    /// Whether the backend could provide a coordinate texture at all.
    bool ctUsable() const
    {
        return m_bUseCoordTex;
    }

    /// Give up on the coordinate texture for good: the backend has no float
    /// textures, or the host renderer could not load the shader that samples
    /// them.
    void ctDisable()
    {
        m_bUseCoordTex = false;
    }

    void ctMarkDirty()
    {
        m_bCoordDirty = true;
    }

    bool ctIsDirty() const
    {
        return m_bCoordDirty;
    }

    void ctClearDirty()
    {
        m_bCoordDirty = false;
    }

private:
    /// Fill the upload buffer (the backend's own, or m_coordbuf) from the
    /// molecule and upload it.
    bool ctGather(const MolCoordPtr &pMol);

    /// Resolve the layout to AnimMol array indices, or leave it empty when the
    /// molecule is not one (or has changed under us).
    void ctResolveCrdIndices(const MolCoordPtr &pMol);

    /// The coordinate texture (owned).
    gfx::FloatDataTexture *m_pCoordTex;

    /// Positions staged for upload (xyz interleaved, one texel per atom).
    /// Empty when the texture backend exposes its own staging memory.
    std::vector<qfloat32> m_coordbuf;

    /// Texel index -> AID.
    std::vector<int> m_aidcache;

    /// AID -> texel index.
    std::unordered_map<int, int> m_aid2idx;

    /// Texel index -> AnimMol coordinate-array index. Empty for a molecule
    /// that is not an AnimMol, which is what selects the getPos() path.
    std::vector<quint32> m_crdidx;

    int m_nTexW, m_nTexH;

    /// False when the backend has no float textures.
    bool m_bUseCoordTex;

    /// Set when the atoms have moved and the texture has not caught up.
    bool m_bCoordDirty;

    /// Set when a build found no atoms.
    bool m_bNothingToDraw;
};

}  // namespace molstr

#endif
