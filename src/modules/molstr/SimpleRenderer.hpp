// -*-Mode: C++;-*-
//
//  Simple renderer class
//
//  $Id: SimpleRenderer.hpp,v 1.9 2011/03/29 11:03:44 rishitani Exp $

#ifndef SIMPLE_RENDERER_H__
#define SIMPLE_RENDERER_H__

#include "molstr.hpp"
#include "MolAtomRenderer.hpp"
#include <gfx/DrawElem.hpp>

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
      // super_t::invalidateDisplayCache();
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

    //////////////////////////////////////////////////////
    //
    // workarea
    //

    int m_nAtomDrawn, m_nBondDrawn;

    /// one color - single valence
    static const int IBON_1C_1V = 0;
    /// two color - single valence
    static const int IBON_2C_1V = 1;

    /// one color - double valence
    static const int IBON_1C_2V = 2;
    /// two color - double valence
    static const int IBON_2C_2V = 3;

    /// one color - triple valence
    static const int IBON_1C_3V = 4;
    /// two color - triple valence
    static const int IBON_2C_3V = 5;

    // single valence bonds
    struct IntBond
    {
      quint32 itype;
      quint32 aid1, aid2;
      quint32 vaind, nelems;
    };

    typedef std::vector<IntBond> IntBondArray;
    
    IntBondArray m_sbonds;

    // multivalence bonds
    struct IntMBond
    {
      quint32 itype;
      quint32 aid1, aid2;
      quint32 vaind, nelems;
      qfloat32 nx, ny, nz;
    };
    
    typedef std::vector<IntMBond> IntMBondArray;
    
    IntMBondArray m_mbonds;

    // isolated atoms
    struct IntAtom
    {
      quint32 aid1;
      quint32 vaind;
    };

    typedef std::vector<IntAtom> IntAtomArray;
    
    IntAtomArray m_atoms;

    /// cached vertex array/VBO
    gfx::DrawElemVC *m_pVBO;

    //////////////////////////////////////////////////////

  public:
    SimpleRenderer();
    virtual ~SimpleRenderer();

    virtual const char *getTypeName() const;

    //////////////////////////////////////////////////////

    // old rendering interface (using GL compatible prof)

    virtual bool isRendBond() const;

    virtual void preRender(DisplayContext *pdc);

    virtual void beginRend(DisplayContext *pdl);
    virtual void endRend(DisplayContext *pdl);

    virtual void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded);
    virtual void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB);

  private:
    void drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                           MolBond *pMB,
			   DisplayContext *pdl);
    void drawAtom(MolAtomPtr pAtom, DisplayContext *pdl);

    //////////////////////////////////////////////////////

  public:
    // new rendering interface (using GL VBO)
    virtual void display(DisplayContext *pdc);

    virtual void invalidateDisplayCache();

  private:
    /// Rendering using VBO (builds sbonds, mbonds, and atoms data structure)
    void renderVBO();

    /// update VBO using m_sbonds, m_mbonds, m_atoms and MolCoord's data
    void updateVBO(bool bUpdateColor);

    //////////////////////////////////////////////////////
    // Event handling
  public:

    /// object changed event (--> update vertex positions if required)
    virtual void objectChanged(qsys::ObjectEvent &ev);

  };
}

#endif
