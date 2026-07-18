// -*-Mode: C++;-*-
//
// Molecular coordinates with animation (trajectory) support
//

#include <common.h>

#include "AnimMol.hpp"
#include "MolAtom.hpp"

using namespace molstr;

void AnimMol::invalidateCrdArray()
{
    m_indmap.clear();
    m_aidmap.clear();
}

void AnimMol::ensureIndexMap()
{
    const int natoms = getAtomSize();
    if (static_cast<int>(m_indmap.size()) != natoms ||
        static_cast<int>(m_aidmap.size()) != natoms) {
        createIndexMapImpl(m_indmap, m_aidmap);
    }
}

quint32 AnimMol::getCrdArrayInd(int aid) const
{
    AnimMol *pthis = const_cast<AnimMol *>(this);
    pthis->ensureIndexMap();

    CrdIndexMap::const_iterator iter = m_indmap.find(aid);
    if (iter == m_indmap.end()) {
        MB_THROW(qlib::RuntimeException, "getCrdArrayInd failed");
        return static_cast<quint32>(-1);
    }

    return iter->second;
}
