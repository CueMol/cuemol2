// -*-Mode: C++;-*-
//
//  coloring class based on the atom properties
//

#ifndef ATOM_PROP_COLORING_HPP_
#define ATOM_PROP_COLORING_HPP_

#include "pseread.hpp"

#include <gfx/AbstractColor.hpp>
#include <qlib/mcutils.hpp>

#include <modules/molstr/ColoringScheme.hpp>

namespace pseread {

  using gfx::ColorPtr;
  using molstr::MolAtomPtr;

  class PSEREAD_API AtomPropColoring : public molstr::ColoringScheme
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;
    
  private:
    qlib::LString m_propname;

  public:

    AtomPropColoring();
    AtomPropColoring(const AtomPropColoring &r);
    virtual ~AtomPropColoring();

    virtual bool getAtomColor(MolAtomPtr pAtom, gfx::ColorPtr &color);
  };

}

#endif
