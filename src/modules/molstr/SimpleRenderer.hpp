// -*-Mode: C++;-*-
//
//  Simple renderer class
//
//  $Id: SimpleRenderer.hpp,v 1.9 2011/03/29 11:03:44 rishitani Exp $

#ifndef SIMPLE_RENDERER_H__
#define SIMPLE_RENDERER_H__

#include <gfx/GpuPrim.hpp>
#include <gfx/LineValIdxGpuPrim.hpp>

#include "MolAtomRenderer.hpp"
#include "CoordTexSupport.hpp"
#include "molstr.hpp"

#include <vector>
#include <unordered_map>

namespace gfx { class FloatDataTexture; }

class SimpleRenderer_wrap;

namespace molstr {

class MOLSTR_API SimpleRenderer : public MolAtomRenderer,
                                  public CoordTexSupport
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
    /// The pick pass reuses display(): every draw path (coordinate-texture
    /// primitives, the display-list fallback) switches to its pick program
    /// while DisplayContext::isPickDraw() is set.
    void displayPick(DisplayContext *pdc) override { display(pdc); }


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

    /// shader draw object for lines (fallback path, no coordinate texture)
    gfx::LineGpuPrim m_lineGpuPrim;

    bool m_bUseShader;
    bool m_bCheckShaderOK;

    //////////////////////////////////////////////////////

public:
    SimpleRenderer();
    ~SimpleRenderer() override;

    const char *getTypeName() const override;

    //////////////////////////////////////////////////////

    // old rendering interface (using GL compatible prof)

    bool isRendBond() const override;

    void preRender(DisplayContext *pdc) override;

    void beginRend(DisplayContext *pdl) override;
    void endRend(DisplayContext *pdl) override;

    void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded) override;
    void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                          MolBond *pMB) override;

private:
    void drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB,
                           DisplayContext *pdl);
    void drawAtom(MolAtomPtr pAtom, DisplayContext *pdl);

    //////////////////////////////////////////////////////

public:
    // new rendering interface (using LineGpuPrim)
    void display(DisplayContext *pdc) override;

    void invalidateDisplayCache() override;

    /// object changed event (--> invalidate shader cache if required)
    void objectChanged(qsys::ObjectEvent &ev) override;

private:
    /// Build and upload line geometry to LineGpuPrim (fallback path)
    void renderShaderImpl(gfx::DisplayContext *pdc);

    //////////////////////////////////////////////////////
    // coordinate texture path (direct update)


    /// Valence-aware line primitive with texture-fetched endpoints
    gfx::LineValIdxGpuPrim m_lineValGpuPrim;


    /// Build the immutable VBO (indices/params/colour) and the coordinate
    /// texture. Clears m_bUseCoordTex when the backend cannot provide one.
    void renderCoordTexImpl(gfx::DisplayContext *pdc);

    /// Re-gather atom positions into the coordinate texture. Called from
    /// display() when m_bCoordDirty.
    bool updateCoordTex();
};

}  // namespace molstr

#endif
