// -*-Mode: C++;-*-
//
// Molecular coordinates with animation (trajectory) support
//

#include <common.h>

#include "AnimMol.hpp"
#include "MolAtom.hpp"

using namespace molstr;

AnimMol::~AnimMol()
{
    // A script can hold an atom longer than the molecule that owns it, and a
    // bound atom would then read a coordinate array that no longer exists.
    unbindAtoms();
}

void AnimMol::invalidateCrdArray()
{
    unbindAtoms();
    m_indmap.clear();
    m_aidmap.clear();
    m_crdarray.clear();
}

void AnimMol::ensureIndexMap()
{
    const int natoms = getCrdArrayAtomCount();
    if (static_cast<int>(m_indmap.size()) != natoms ||
        static_cast<int>(m_aidmap.size()) != natoms) {
        // The slots the atoms point at are about to mean something else.
        unbindAtoms();
        createIndexMapImpl(m_indmap, m_aidmap);
    }
    // Binding waits for the array to exist: a renderer resolving array indices
    // at build time can get here before the first update() has filled it.
    bindAtoms();
}

quint32 AnimMol::getCrdArrayInd(int aid) const
{
    AnimMol *pthis = const_cast<AnimMol *>(this);
    pthis->ensureIndexMap();

    const quint32 ind = m_indmap.lookup(aid);
    if (ind == CrdIndexMap::npos) {
        MB_THROW(qlib::RuntimeException, "getCrdArrayInd failed");
        return static_cast<quint32>(-1);
    }

    return ind;
}

void AnimMol::allocCrdArray()
{
    m_crdarray.resize(static_cast<size_t>(getCrdArrayAtomCount()) * 3);
}

void AnimMol::commitCrdArray()
{
    ensureIndexMap();
    fireAtomsMoved();
}

void AnimMol::bindAtoms()
{
    if (m_bAtomsBound) return;
    // The array has to exist before an atom can point into it.
    if (m_aidmap.empty() || m_crdarray.size() < m_aidmap.size() * 3) return;

    const quint32 natoms = static_cast<quint32>(m_aidmap.size());
    for (quint32 i = 0; i < natoms; ++i) {
        MolAtomPtr pAtom = getAtom(m_aidmap[i]);
        if (pAtom.isnull()) continue;
        pAtom->bindCrdArray(this, i);
    }
    m_bAtomsBound = true;
}

void AnimMol::unbindAtoms()
{
    if (!m_bAtomsBound) return;

    const quint32 natoms = static_cast<quint32>(m_aidmap.size());
    for (quint32 i = 0; i < natoms; ++i) {
        MolAtomPtr pAtom = getAtom(m_aidmap[i]);
        if (pAtom.isnull()) continue;
        pAtom->unbindCrdArray();
    }
    m_bAtomsBound = false;
}
