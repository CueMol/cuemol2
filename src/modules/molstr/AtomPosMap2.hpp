// -*-Mode: C++;-*-
//
//  Atom position <--> ID mapping (ver. 2; using CGAL Kd-tree)
//
// $Id$

#ifndef ATOM_POS_MAP2_HPP_INCLUDED_
#define ATOM_POS_MAP2_HPP_INCLUDED_

#include "molstr.hpp"
#include <qlib/Vector4D.hpp>

namespace molstr {

  class MolCoord;
  using qlib::Vector4D;
  using std::valarray;

  class MOLSTR_API AtomPosMap2
  {
  private:
    /// target molecule
    MolCoordPtr m_pMol;

    void *m_pKdTree;

  public:
    AtomPosMap2() : m_pKdTree(NULL) {}
    ~AtomPosMap2();

    void setTarget(MolCoordPtr pMol) { m_pMol = pMol; }

    void generate(SelectionPtr pSel = SelectionPtr());

    int searchNearestAtom(const Vector4D &pos);

  private:

  };

}

#endif // ATOM_POS_MAP_HPP_INCLUDED_


