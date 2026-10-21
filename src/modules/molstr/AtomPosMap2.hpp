// -*-Mode: C++;-*-
//
//  Atom position <--> ID mapping (ver. 2; using CGAL Kd-tree)
//
// $Id$

#ifndef ATOM_POS_MAP2_HPP_INCLUDED_
#define ATOM_POS_MAP2_HPP_INCLUDED_

#include "molstr.hpp"
#include <qlib/Vector4D.hpp>

#include <cstddef>
#include <functional>
#include <vector>

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

    /// Force the lazy CGAL Kd-tree build (const_build is not thread-safe).
    /// After this returns, concurrent searchNearestAtom() calls are safe.
    void ensureBuilt();

    int searchNearestAtom(const Vector4D &pos);

    /// aids[i] = searchNearestAtom(posAt(i)) for i in [0, n), run in parallel;
    /// posAt must be safe to call concurrently.
    void searchNearestAtoms(std::size_t n,
                            const std::function<Vector4D (std::size_t)> &posAt,
                            std::vector<int> &aids);

  private:

  };

}

#endif // ATOM_POS_MAP_HPP_INCLUDED_


