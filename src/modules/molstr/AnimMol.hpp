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
/// MolCoord that exposes its coordinates as a flat, index-addressable array.
///
/// Abstract base for animated molecules (MD trajectories, morphing). The
/// derived class owns the coordinate float storage (getCrdArrayImpl) and
/// defines the mapping between atom IDs and array indices (createIndexMapImpl).
/// The coordinate-texture renderers use getCrdArrayInd() at build time to
/// address atoms by array index.
///
/// This keeps no MolAtom/array validity flag: the derived update() writes both
/// the coordinate array and the MolAtom positions, so MolAtom::getPos() stays a
/// plain field read (no per-call indirection on the hot path).
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

public:
    AnimMol() {}

    /// Coordinate array (xyz interleaved, natom*3). Storage owned by the
    /// derived class.
    virtual qfloat32 *getCrdArrayImpl() = 0;

    /// Build the AID<->array-index maps for this implementation's layout.
    virtual void createIndexMapImpl(CrdIndexMap &indmap, AidIndexMap &aidmap) = 0;

    /// Discard the index maps (call when the topology changes).
    virtual void invalidateCrdArray();

    /// AID -> CrdArray index (builds the maps lazily). Throws if not found.
    quint32 getCrdArrayInd(int aid) const;

    /// CrdArray index -> AID. The maps must already be built (ensureIndexMap()).
    int getAtomIDByArrayInd(quint32 idx) const { return m_aidmap[idx]; }

    /// The current coordinate array.
    qfloat32 *getAtomCrdArray() { return getCrdArrayImpl(); }

protected:
    /// Ensure the index maps match the current atom count, rebuilding if not.
    void ensureIndexMap();
};

}  // namespace molstr

#endif
