// -*-Mode: C++;-*-
//
// Molecular coordinates with animation support
//

#ifndef MOLSTR_ANIMMOL_HPP_INCLUDED
#define MOLSTR_ANIMMOL_HPP_INCLUDED

#include "molstr.hpp"
#include "MolCoord.hpp"

namespace molstr {

  ///
  /// Molecular coordinates with animation support
  ///
  class MOLSTR_API AnimMol : public MolCoord
  {
    // MC_SCRIPTABLE;

  private:
    /// MolAtom/CrdArray validity flag
    char m_nValidFlag;

    // MolArrayMap m_indmap;
    typedef std::map<int, quint32> CrdIndexMap;

    /// Atom ID --> CrdArray index mapping
    CrdIndexMap m_indmap;
    
    std::vector<float> m_crdarray;

  public:
    AnimMol() : m_nValidFlag(CRD_ATOM_VALID), MolCoord()
    {
    }

    virtual char getCrdValidFlag() const
    {
      return m_nValidFlag;
    }

    Vector4D getAtomArray(int aid) const;

    void setAtomArray(int aid, const Vector4D &pos);

    qfloat32 *getAtomArray();

    void updateCrdArray();

    void crdArrayChanged() {
      m_nValidFlag = CRD_ARRAY_VALID;
    }

    quint32 getCrdArrayInd(int aid) const;

    virtual void invalidateCrdArray();


  };

}

#endif

