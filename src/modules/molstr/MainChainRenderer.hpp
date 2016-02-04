// -*-Mode: C++;-*-
//
//  superclass of main-chain molecular renderers
//
//  $Id: MainChainRenderer.hpp,v 1.10 2011/01/08 18:28:29 rishitani Exp $

#ifndef MAIN_CHAIN_RENDERER_HPP_
#define MAIN_CHAIN_RENDERER_HPP_

#include "molstr.hpp"
#include "MolRenderer.hpp"
#include "ColoringScheme.hpp"

class MainChainRenderer_wrap;

namespace molstr {

  class MOLSTR_API MainChainRenderer : public MolRenderer
  {
    MC_SCRIPTABLE;
    friend class ::MainChainRenderer_wrap;

  private:
    //MCINFO: LString m_sPivAtomName => pivotatom
    LString m_sPivAtomName;

    // //MCINFO: double m_dBondBrkDist => autobreak
    // double m_dBondBrkDist;

  public:
    typedef MolRenderer super_t;

    MainChainRenderer();
    virtual ~MainChainRenderer();

    //////////////////////////////////////////////////////
    // overridden methods

    virtual void render(DisplayContext *pdl);

    // virtual void renderHitDL(DisplayContext *phl);

    virtual qlib::Vector4D getCenter() const;

    // virtual void propChanged(qlib::LPropEvent &ev);

    //
    // Hittest implementation
    //

    virtual bool isHitTestSupported() const;
    virtual void renderHit(DisplayContext *phl);

    // hittest data is interpreted by the same routine in MolRenderer
    virtual LString interpHit(const gfx::RawHitData &hdat);

    //////////////////////////////////////////////////////
    // pure virtual methods

    virtual void beginRend(DisplayContext *pdl) =0;
    virtual void endRend(DisplayContext *pdl) =0;
    virtual void beginSegment(DisplayContext *pdl, MolResiduePtr pres) {}
    virtual void rendResid(DisplayContext *pdl, MolResiduePtr pRes) =0;
    virtual void endSegment(DisplayContext *pdl, MolResiduePtr pres) {}

    //////////////////////////////////////////////////////
    // hittest support

    virtual void beginHitRend(DisplayContext *pdl);
    virtual void endHitRend(DisplayContext *pdl);
    virtual void rendHitResid(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void beginHitSegment(DisplayContext *pdl, MolResiduePtr);
    virtual void endHitSegment(DisplayContext *pdl, MolResiduePtr);

    //////////////////////////////////////////////////////

    virtual bool isNewSegment(MolResiduePtr pcur, MolResiduePtr pprev);

    MolAtomPtr getPivotAtom(MolResiduePtr pRes) const;
    Vector4D getPivotPos(MolResiduePtr pRes) const {
      return ensureNotNull(getPivotAtom(pRes))->getPos();
    }

    virtual void setPivAtomName(const LString &aname);
    const LString &getPivAtomName() const { return m_sPivAtomName; }
  
    /// Calculate (and interporate) color between two residues
    gfx::ColorPtr calcColor(double rho, bool bSmoCol,
                            MolResiduePtr pRes1, MolResiduePtr pRes2,
                            bool bRes1Transp=false, bool bRes2Transp=false);

    virtual bool getDiffVec(MolResiduePtr pRes, Vector4D &rpos, Vector4D &rvec);

  };

}

#endif
