// -*-Mode: C++;-*-
//
//  abstract class for molecular renderers
//
//  $Id: MolAtomRenderer.hpp,v 1.6 2011/03/29 11:03:44 rishitani Exp $

#ifndef MOL_ATOM_RENDERER_H__
#define MOL_ATOM_RENDERER_H__

#include "molstr.hpp"
#include "MolRenderer.hpp"

namespace molstr {

  class MOLSTR_API MolAtomRenderer : public MolRenderer
  {
  private:
    /// max number of verteces in the GLU rendering mode
    int m_nGluVertMax;

  public:
    void setGluVertMax(int n) {
      invalidateDisplayCache();
      m_nGluVertMax = n;
    }
    int getGluVertMax() const { return m_nGluVertMax; }

  public:
    MolAtomRenderer();
    ~MolAtomRenderer() override;

    //////////////////////////////////////////////////////
    // interface implementations

    void render(DisplayContext *pdl) override;

    // Hittest implementation

    bool isHitTestSupported() const override;
    void renderHit(DisplayContext *phl) override;

    // hittest data is interpreted by the same routine in MolRenderer
    // virtual LString interpHit(const gfx::RawHitData &hdat);

    //////////////////////////////////////////////////////
    // pure virtual methods

    virtual void beginRend(DisplayContext *pdl) =0;
    virtual void endRend(DisplayContext *pdl) =0;
    virtual void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded) =0;
    virtual void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB) =0;
    virtual bool isRendBond() const =0;

    // hittest pattern rendering
    virtual void beginHitRend(DisplayContext *pdl);
    virtual void endHitRend(DisplayContext *pdl);
    virtual void rendHitAtom(DisplayContext *pdl, MolAtomPtr pAtom);
    virtual void rendHitBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2);
    virtual bool isRendHitBond() const;

    //////////////////////////////////////////////////////

    bool countAtomBond(int &ratoms, int &rbonds);
    void setupDetail(DisplayContext *pdl, int nDetail);

  };

}

#endif
