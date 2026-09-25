// -*-Mode: C++;-*-
//
// Molecular coordinates with animation (trajectory) support
//

#ifndef MOLSTR_ANIMMOL_HPP_INCLUDED
#define MOLSTR_ANIMMOL_HPP_INCLUDED

#include "molstr.hpp"
#include "MolCoord.hpp"

#include <memory>
#include <utility>
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
    /// AID -> array index. A plain array indexed by AID: MolCoord hands AIDs
    /// out from 0 without gaps (until atoms are removed), so this costs 4
    /// bytes per atom where a hash map cost ten times that.
    class CrdIndexMap
    {
    public:
        typedef std::pair<int, quint32> value_type;
        static constexpr quint32 npos = 0xFFFFFFFFu;

        void clear()
        {
            m_ind.clear();
            m_nsize = 0;
        }

        /// Maps value.first to value.second unless it is mapped already
        /// (the insert semantics of the std maps).
        void insert(const value_type &value)
        {
            if (value.first < 0) return;
            const size_t aid = static_cast<size_t>(value.first);
            if (aid >= m_ind.size()) m_ind.resize(aid + 1, npos);
            if (m_ind[aid] != npos) return;
            m_ind[aid] = value.second;
            ++m_nsize;
        }

        /// Number of mapped AIDs
        size_t size() const { return m_nsize; }

        /// Array index of aid, or npos when it has none
        quint32 lookup(int aid) const
        {
            if (aid < 0 || static_cast<size_t>(aid) >= m_ind.size()) return npos;
            return m_ind[aid];
        }

    private:
        std::vector<quint32> m_ind;
        size_t m_nsize = 0;
    };

    typedef std::vector<quint32> AidIndexMap;  ///< array index -> AID

private:
    /// AID -> CrdArray index
    CrdIndexMap m_indmap;

    /// CrdArray index -> AID
    AidIndexMap m_aidmap;

    /// Coordinates of the current frame (xyz interleaved, natom*3).
    std::vector<qfloat32> m_crdarray;

    /// Whether the atoms currently read their positions from m_crdarray.
    bool m_bAtomsBound = false;

    /// The xformMat the bound atoms apply, or NULL when it is the identity.
    /// Held once here instead of copied into every atom.
    std::unique_ptr<qlib::Matrix4D> m_pAtomXform;

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

    /// The transform MolAtom::getPos() applies to a bound atom, or NULL for
    /// the identity.
    const qlib::Matrix4D *getAtomXform() const { return m_pAtomXform.get(); }

    /// Keeps a single copy for the bound atoms rather than giving each atom
    /// its own; atoms not bound yet get the per-atom copy as in MolCoord.
    void setXformMatrix(const qlib::Matrix4D &m) override;

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
