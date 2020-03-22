// -*-Mode: C++;-*-
//
//  (Covalent) Bond object for molecule
//

#ifndef MOLSTR_MOLBOND_HPP_INCLUDED
#define MOLSTR_MOLBOND_HPP_INCLUDED

#include "molstr.hpp"

#include "MolAtom.hpp"

namespace molstr {

  using qlib::Vector4D;
  using qlib::LScrVector4D;
  using qlib::LString;

  ///
  /// Covalent bond between two atoms
  ///
  class MOLSTR_API MolBond
  {
  private:
    /// Atom-IDs of bonded atoms
    int id1, id2;

    /// Persistence flag
    bool bPersist;

    /// Bond type (valence)
    int nType;

  public:
    enum {
      SINGLE=10,
      DELOC=15,
      DOUBLE=20,
      TRIPLE=30,
    };
    
    MolBond() :id1(-1), id2(-1), bPersist(false), nType(SINGLE) {}

    int getAtom1() const { return id1; }
    void setAtom1(int id) { id1 = id; }

    int getAtom2() const { return id2; }
    void setAtom2(int id) { id2 = id; }

    bool isPersist() { return bPersist; }
    void setPersist(bool val) { bPersist = val; }

    int getType() const { return nType; }
    void setType(int val) { nType = val; }

    Vector4D getDblBondDir(MolCoordPtr pMol) const;

    int getDistalAtomID(MolCoordPtr pMol, int &nbonds) const;
  };
}

#endif

