// -*-Mode: C++;-*-
//
//  coloring class based on the atom properties
//

#include <common.h>

#include "AtomPropColoring.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/SolidColor.hpp>

#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/MolResidue.hpp>

using namespace pseread;
using gfx::SolidColor;

AtomPropColoring::AtomPropColoring()
{
  m_propname = "col";
  resetAllProps();
  MB_DPRINTLN("AtomPropColoring: new obj(%p) is created.", this);
}

AtomPropColoring::AtomPropColoring(const AtomPropColoring &r)
{
  MB_DPRINTLN("AtomPropColoring: copy obj(%p) of %p is created.", this, &r);
}

AtomPropColoring::~AtomPropColoring()
{
  MB_DPRINTLN("AtomPropColoring: destructing (%p).", this);
}

bool AtomPropColoring::getAtomColor(MolAtomPtr pAtom, gfx::ColorPtr &col)
{
  MB_DPRINTLN("***** AtomPropCol getAtomColor called");
  try {
    int ccode = pAtom->getAtomPropInt(m_propname);
    col = gfx::SolidColorPtr(new gfx::SolidColor(ccode)); 
  }
  catch (...) {
    col = SolidColor::createRGB(0.5,0.5,0.5);
    //return false;
  }
  return true;
}

