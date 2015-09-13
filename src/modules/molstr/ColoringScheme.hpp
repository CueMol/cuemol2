// -*-Mode: C++;-*-
//
//  Coloring Scheme
//
//  $Id: ColoringScheme.hpp,v 1.14 2011/03/30 14:17:36 rishitani Exp $

#ifndef COLORING_SCHEME_HPP_
#define COLORING_SCHEME_HPP_

#include "molstr.hpp"

#include <gfx/gfx.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/DisplayContext.hpp>

#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>

#include "MolAtom.hpp"
#include "MolResidue.hpp"

namespace qsys { class Renderer; }

namespace molstr {
  
  using gfx::ColorPtr;
  using qsys::Renderer;
  
  class MOLSTR_API ColoringScheme : public qlib::LSimpleCopyScrObject
  {
    MC_SCRIPTABLE;

  private:
    virtual void init(MolCoordPtr pMol, Renderer *pRend) {}

  public:
    virtual ~ColoringScheme();

    /// Initialization (called before the start of rendering)
    virtual bool start(MolCoordPtr pMol, Renderer *pRend);

    /// Get color of atom
    virtual bool getAtomColor(MolAtomPtr pAtom, ColorPtr &pcol) =0;

    /// Get residue color (default impl is in CPKColoring.hpp returning the pivot's color)
    virtual bool getResidColor(MolResiduePtr pResid, ColorPtr &color);

    /// finalization (called after the end of the rendering)
    virtual void end();

    // utility method for creating default value
    static ColoringSchemePtr createDefaultS();
  };

  /////////////////////////////////////

  class MOLSTR_API SolidColoring : public ColoringScheme
  {
  private:
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  public:
    SolidColoring() {}
    virtual ~SolidColoring();

    /// dummy method: always returns false
    virtual bool getAtomColor(MolAtomPtr pAtom, ColorPtr &pcol);

  };

}


class MolRenderer_wrap;

namespace molstr {

  class MOLSTR_API ColSchmHolder
  {
  private:

    friend class ::MolRenderer_wrap;

    /// Coloring scheme
    ColoringSchemePtr m_pcoloring;
  
    /// default color (used when m_pcoloring is null)
    // gfx::SolidColor m_defaultColor;
    ColorPtr m_defaultColor;

  public:
    /// Default ctor
    ColSchmHolder() : m_defaultColor(gfx::SolidColor::createRGB(1.0, 1.0, 1.0)) {}
  
    ///

    void setColSchm(const ColoringSchemePtr &pp) {
      m_pcoloring = pp;
    }

    ColoringSchemePtr getColSchm() const {
      return m_pcoloring;
    }

    /// Wrapper func / get atom color
    ColorPtr getColor(MolAtomPtr pAtom, bool bRslvMol = true) const;

    ColorPtr getColor(MolResiduePtr pRes, bool bRslvMol = true) const;

    ColorPtr getDefaultColor() const {
      return m_defaultColor;
    }
    void setDefaultColor(const ColorPtr &rc) {
      m_defaultColor = rc;
    }

  };

}

#endif // COLORING_SCHEME_HPP_

