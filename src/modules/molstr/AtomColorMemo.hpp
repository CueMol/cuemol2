// -*-Mode: C++;-*-
//
//  Per-atom colour and visibility memo for colouring many points by atom
//

#ifndef MOLSTR_ATOM_COLOR_MEMO_HPP_INCLUDED
#define MOLSTR_ATOM_COLOR_MEMO_HPP_INCLUDED

#include "molstr.hpp"
#include "ColoringScheme.hpp"

#include <vector>

namespace molstr {

  /// Colour and show-selection visibility of the atoms of one molecule,
  /// resolved once per atom id and reused, for a pass that colours many
  /// points (the vertices of a surface) by the atom each one belongs to.
  ///
  /// Valid for one colouring pass: the caller brackets the pass with
  /// ColSchmHolder::startColoring() / endColoring(), as the colours come from
  /// ColSchmHolder::getColor().
  class MOLSTR_API AtomColorMemo
  {
  public:
    struct Entry
    {
      /// The id names an atom of the molecule.
      bool bAtom = false;
      /// Not left out by the show selection (an unknown atom is shown).
      bool bShown = true;
      /// The atom's colour, resolved only for a shown atom and only when the
      /// memo resolves colours (null otherwise).
      ColorPtr pCol;
      /// pCol's device code in the scene (0 when pCol is null).
      quint32 nDevCode = 0;
    };

    /// pHolder resolves the colours; pShowSel null or empty shows every atom.
    /// With bColor false only the visibility is resolved (no scheme is
    /// asked, so the pass needs no startColoring()).
    AtomColorMemo(MolCoordPtr pMol, const ColSchmHolder *pHolder,
                  SelectionPtr pShowSel, qlib::uid_t nSceneID, bool bColor = true);

    /// The entry of atom aid. A negative id, or one that names no atom,
    /// gives an unknown atom (shown, no colour). The reference is valid until
    /// the next get().
    const Entry &get(int aid);

  private:
    Entry resolve(int aid) const;

    MolCoordPtr m_pMol;
    const ColSchmHolder *m_pHolder;
    SelectionPtr m_pShowSel;
    qlib::uid_t m_nSceneID;
    bool m_bColor;

    /// Entries indexed by atom id (ids are dense pool indices)
    std::vector<Entry> m_memo;
    std::vector<char> m_bResolved;

    /// Returned for ids outside the memo
    Entry m_unknown;
    Entry m_scratch;
  };

}

#endif
