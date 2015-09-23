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

    //////////////
    // Properties

  private:
    /// drawing line width
    double m_lw;

  public:
    void setLineWidth(double f) {
      m_lw = f;
      super_t::invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }

  private:
    /// display valency bond
    bool m_bValBond;

  public:
    void setValBond(bool val) {
      m_bValBond = val;
      super_t::invalidateDisplayCache();
    }
    bool getValBond() const { return m_bValBond; }

  private:
    double m_dCvScl1;
    double m_dCvScl2;

  public:
    /// Set valence bond scaling factor 1 (for double/triple bond drawing)
    void setVBScl1(double f) {
      m_dCvScl1 = f;
      super_t::invalidateDisplayCache();
    }
    double getVBScl1() const { return m_dCvScl1; }

    /// Set valence bond scaling factor 2 (for double bond drawing)
    void setVBScl2(double f) {
      m_dCvScl2 = f;
      super_t::invalidateDisplayCache();
    }
    double getVBScl2() const { return m_dCvScl2; }

    ////////////
    // workarea

    int m_nAtomDrawn, m_nBondDrawn;

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

    // virtual void propChanged(qlib::LPropEvent &ev);

  private:
    void drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                           MolBond *pMB,
			   DisplayContext *pdl);
    void drawAtom(MolAtomPtr pAtom, DisplayContext *pdl);

  };
}

#endif
