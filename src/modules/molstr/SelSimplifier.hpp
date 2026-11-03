// -*-Mode: C++;-*-
//
// SelSimplifier: rewrite a compiled selection into an equivalent, shorter
// expression
//

#ifndef MOLSTR_SEL_SIMPLIFIER_HPP_INCLUDED
#define MOLSTR_SEL_SIMPLIFIER_HPP_INCLUDED

#include "molstr.hpp"

#include <qlib/LString.hpp>

namespace molstr {

  using qlib::LString;
  class SelSuperNode;

  ///
  /// Equivalent rewriting of a selection tree.
  ///
  /// The tree is read into an n-ary form, rewritten by rules that never
  /// change which atoms are selected (flattening, constants, duplicates,
  /// complements, absorption, merging leaves of one kind under "or", ...)
  /// until nothing changes, and written back as selection text that the
  /// selection compiler reads back into the same meaning. The input tree is
  /// not modified. See docs/architecture/selection-simplify.md.
  ///
  class MOLSTR_API SelSimplifier
  {
  public:
    /// What to do to the expression before simplifying it.
    enum Edit {
      /// nothing
      EDIT_NONE,
      /// not (X)
      EDIT_INVERT,
      /// bysidech X, or X when the expression is bysidech X already
      EDIT_TOGGLE_SIDECH,
      /// X around d (byres when asked), replacing an around at the root
      EDIT_AROUND,
    };

    /// Simplified text of pRoot, after the edit. Empty for a null tree.
    static LString rewrite(SelSuperNode *pRoot, int nEdit = EDIT_NONE,
                           double dist = 0.0, bool bByres = false);

    /// Number as selection text that reads back as the same double:
    /// the shortest fixed-point form, no exponent (the scanner has none).
    static LString formatNumber(double value);

    /// A property value as selection text (quoted, so that any value the
    /// scanner can carry reads back unchanged).
    static LString quoteValue(const LString &value);
  };

}

#endif
