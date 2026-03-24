// -*-Mode: C++;-*-
//
//  Simple renderer class
//
//  $Id: SimpleRenderer.hpp,v 1.9 2011/03/29 11:03:44 rishitani Exp $

#ifndef SIMPLE_RENDERER_H__
#define SIMPLE_RENDERER_H__

#include <gfx/DrawObj2.hpp>

#include "MolAtomRenderer.hpp"
#include "molstr.hpp"

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
    void setLineWidth(double f)
    {
        m_lw = f;
        invalidateDisplayCache();
    }
    double getLineWidth() const
    {
        return m_lw;
    }

private:
    /// display valency bond
    bool m_bValBond;

public:
    void setValBond(bool val)
    {
        m_bValBond = val;
        invalidateDisplayCache();
    }
    bool getValBond() const
    {
        return m_bValBond;
    }

private:
    double m_dCvScl1;
    double m_dCvScl2;

public:
    /// Set valence bond scaling factor 1 (for double/triple bond drawing)
    void setVBScl1(double f)
    {
        m_dCvScl1 = f;
        invalidateDisplayCache();
    }
    double getVBScl1() const
    {
        return m_dCvScl1;
    }

    /// Set valence bond scaling factor 2 (for double bond drawing)
    void setVBScl2(double f)
    {
        m_dCvScl2 = f;
        invalidateDisplayCache();
    }
    double getVBScl2() const
    {
        return m_dCvScl2;
    }

    //////////////////////////////////////////////////////
    //
    // workarea
    //

    int m_nAtomDrawn, m_nBondDrawn;

    /// shader draw object for lines
    gfx::LineDrawObj2 m_slLine;

    bool m_bUseShader;
    bool m_bCheckShaderOK;

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
    virtual void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                          MolBond *pMB);

private:
    void drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB,
                           DisplayContext *pdl);
    void drawAtom(MolAtomPtr pAtom, DisplayContext *pdl);

    //////////////////////////////////////////////////////

public:
    // new rendering interface (using LineDrawObj2)
    virtual void display(DisplayContext *pdc);

    virtual void invalidateDisplayCache();

    /// object changed event (--> invalidate shader cache if required)
    virtual void objectChanged(qsys::ObjectEvent &ev);

private:
    /// Build and upload line geometry to LineDrawObj2
    void renderShaderImpl();
};

}  // namespace molstr

#endif
