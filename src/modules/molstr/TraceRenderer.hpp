// -*-Mode: C++;-*-
//
//  backbone trace renderer class
//
//  $Id: TraceRenderer.hpp,v 1.6 2010/01/24 15:23:45 rishitani Exp $

#ifndef TRACE_RENDERER_HPP_
#define TRACE_RENDERER_HPP_

#include "molstr.hpp"
#include "MainChainRenderer.hpp"
//#include "ColoringScheme.hpp"
#include <gfx/DrawElem.hpp>

class TraceRenderer_wrap;

namespace molstr {

  using qlib::Vector4D;

  class MOLSTR_API TraceRenderer : public MainChainRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::TraceRenderer_wrap;
    typedef MainChainRenderer super_t;

  private:
    /// Line width
    double m_lw;
    
    // ColoringSchemePtr m_pcoloring;

    bool m_bUseVBO;

    struct IntBond {
      quint32 aid1, aid2;
    };

    bool m_bPrevAidValid;
    quint32 m_nPrevAid;
    quint32 m_nBonds;
    quint32 m_nVA;

    std::deque<IntBond> m_bonds;
    std::deque<quint32> m_atoms;

    gfx::DrawElemVC *m_pVBO;

    ////////////
    
  public:
    TraceRenderer();
    virtual ~TraceRenderer();
    
    virtual const char *getTypeName() const;

    //////////////////////////////////////////////////////
    // Renderer interface
    
    // new rendering interface (using GL VBO)
    virtual void display(DisplayContext *pdc);
    
    // virtual void invalidateDisplayCache();
    
    //////////////////////////////////////////////////////
    // DispCacheRenderer interface

    virtual void preRender(DisplayContext *pdc);
    
    //////////////////////////////////////////////////////
    // MainChainRenderer interface

    virtual void beginRend(DisplayContext *pdl);
    virtual void beginSegment(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void rendResid(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void endSegment(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void endRend(DisplayContext *pdl);
    
    //////////////////////////////////////////////////////
    
    // virtual void propChanged(qlib::LPropEvent &ev);

    void setLineWidth(double f) {
      m_lw = f;
      super_t::invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }
    
  private:
    void renderSimpleHittest(DisplayContext *phl);
    
    void renderDLSel(DisplayContext *pdl);
    
  };

}

#endif
