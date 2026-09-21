// -*-Mode: C++;-*-
//
// Molecular coordinates with animation (trajectory) support
//

#ifndef MOLSTR_ANIMMOL_HPP_INCLUDED
#define MOLSTR_ANIMMOL_HPP_INCLUDED

#include "molstr.hpp"
#include "MolCoord.hpp"

#include <unordered_map>
#include <vector>

namespace molstr {

///
/// MolCoord whose coordinates live in a flat, index-addressable array.
///
/// Abstract base for animated molecules (MD trajectories, morphing). Where
/// MolCoord is built for structures that can be edited atom by atom, this is
/// built for the opposite case: the topology is fixed once loaded and only the
/// coordinates change, frame after frame. The array is the source of truth for
/// those coordinates -- the derived update() fills it from the frame data, and
/// everything else reads it.
///
/// Consumers get at it two ways. Code that needs speed (the coordinate-texture
/// renderers) resolves an atom to an array index once at build time with
/// getCrdArrayInd() and then reads the array directly, which is what makes a
/// per-frame update cost a strided copy rather than one std::map lookup per
/// atom. Everything else keeps using MolAtom::getPos(), which reads the same
/// array through a binding installed on each atom; that path is slower but it
/// is what the rest of the codebase already speaks.
///
/// Because the array is the source of truth, the atoms of an AnimMol cannot be
/// moved individually: MolAtom::setPos() throws on a bound atom, and
/// isCoordEditable() returns false so callers can refuse before starting. The
/// object-level xformMat property still moves the molecule as a whole.
///
class MOLSTR_API AnimMol : public MolCoord
{
    MC_SCRIPTABLE;

public:
    typedef std::unordered_map<int, quint32> CrdIndexMap;  ///< AID -> array index
    typedef std::vector<quint32> AidIndexMap;              ///< array index -> AID

private:
    /// AID -> CrdArray index
    CrdIndexMap m_indmap;

    /// CrdArray index -> AID
    AidIndexMap m_aidmap;

    /// Coordinates of the current frame (xyz interleaved, natom*3).
    std::vector<qfloat32> m_crdarray;

    /// Whether the atoms currently read their positions from m_crdarray.
    bool m_bAtomsBound = false;

public:
    AnimMol() {}

    virtual ~AnimMol();

    /// Build the AID<->array-index maps for this implementation's layout.
    virtual void createIndexMapImpl(CrdIndexMap &indmap, AidIndexMap &aidmap) = 0;

    ///
    /// How many atoms the coordinate array has a slot for.
    ///
    /// Usually every atom, but not necessarily: MorphMol addresses its frames
    /// by chain/residue/atom name, which collapses alternate conformations
    /// onto one slot. Atoms without a slot keep their own position and are
    /// simply not animated. This has to agree with what createIndexMapImpl()
    /// produces, or the maps would be rebuilt on every access.
    ///
    virtual int getCrdArrayAtomCount() const
    {
        return getAtomSize();
    }

    /// Discard the index maps and the coordinate array, and unbind the atoms
    /// from it (call when the topology changes).
    virtual void invalidateCrdArray();

    /// AID -> CrdArray index (builds the maps lazily). Throws if not found.
    quint32 getCrdArrayInd(int aid) const;

    /// CrdArray index -> AID. The maps must already be built (ensureIndexMap()).
    int getAtomIDByArrayInd(quint32 idx) const { return m_aidmap[idx]; }

    /// The current coordinate array, read-only: it is written by update() and
    /// by nothing else.
    const qfloat32 *getAtomCrdArray() const
    {
        return m_crdarray.empty() ? NULL : &m_crdarray[0];
    }

    /// Number of coordinate values (natom*3), or 0 before the array is set up.
    size_t getCrdArraySize() const
    {
        return m_crdarray.size();
    }

    /// Position of the atom at an array index. Called by MolAtom::getPos() on a
    /// bound atom; the index came from the binding, so it is in range.
    qlib::Vector4D getAtomPos(quint32 idx) const
    {
        const qfloat32 *p = &m_crdarray[idx * 3];
        return qlib::Vector4D(p[0], p[1], p[2]);
    }

    /// An AnimMol's coordinates come from its frames, so individual atoms
    /// cannot be moved once the array is in place.
    virtual bool isCoordEditable() const override
    {
        return m_crdarray.empty();
    }

protected:
    /// Ensure the index maps match the current atom count, rebuilding (and
    /// rebinding the atoms) if not.
    void ensureIndexMap();

    /// Size the coordinate array to the current atom count. Call before
    /// filling it for the first time.
    void allocCrdArray();

    /// The coordinate array, for the derived update() to fill.
    qfloat32 *mutableCrdArray()
    {
        return m_crdarray.empty() ? NULL : &m_crdarray[0];
    }

    /// Finish an update(): make sure the maps and atom bindings are in place,
    /// then tell the scene the atoms moved.
    void commitCrdArray();

private:
    /// Point every atom at its slot in the coordinate array.
    void bindAtoms();

    /// Detach the atoms from the array, leaving each holding its last position.
    void unbindAtoms();
};

}  // namespace molstr

#endif
