// -*-Mode: C++;-*-
//
//  Simple renderer class
//
//  $Id: SimpleRenderer.hpp,v 1.9 2011/03/29 11:03:44 rishitani Exp $

#ifndef SIMPLE_RENDERER_H__
#define SIMPLE_RENDERER_H__

#include "molstr.hpp"
#include "MolAtomRenderer.hpp"

class SimpleRenderer_wrap;

namespace molstr {

  class MOLSTR_API SimpleRenderer : public MolAtomRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::SimpleRenderer_wrap;

    typedef MolAtomRenderer super_t;

  private:
    /// drawing line width
    double m_lw;

    // /// default color
    // gfx::SolidColor m_color;

    // /// Coloring scheme
    // ColoringSchemePtr m_pcoloring;

    int m_nAtomDrawn, m_nBondDrawn;

    /// display valency bond
    bool m_bValBond;

  public:
    SimpleRenderer();
    virtual ~SimpleRenderer();

    virtual const char *getTypeName() const;

    //////////////////////////////////////////////////////

    virtual bool isRendBond() const;

    virtual void preRender(DisplayContext *pdc);

    virtual void beginRend(DisplayContext *pdl);
    virtual void endRend(DisplayContext *pdl);

    virtual void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded);
    virtual void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB);

    //////////////////////////////////////////////////////

    void setLineWidth(double f) {
      m_lw = f;
      super_t::invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }

    void setValBond(bool val) {
      m_bValBond = val;
      super_t::invalidateDisplayCache();
    }
    bool getValBond() const { return m_bValBond; }

    // virtual void propChanged(qlib::LPropEvent &ev);

  private:
    void drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                           int nBondType,
			   DisplayContext *pdl);
    void drawAtom(MolAtomPtr pAtom, DisplayContext *pdl);

  };
}

#endif
