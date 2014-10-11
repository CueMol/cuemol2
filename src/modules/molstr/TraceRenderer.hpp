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

    ////////////
    
  public:
    TraceRenderer();
    virtual ~TraceRenderer();
    
    virtual const char *getTypeName() const;

    // virtual void propChanged(qlib::LPropEvent &ev);

    //////////////////////////////////////////////////////
    
    virtual void preRender(DisplayContext *pdc);
    virtual void beginRend(DisplayContext *pdl);
    virtual void endRend(DisplayContext *pdl);
    
    virtual void beginSegment(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void rendResid(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void endSegment(DisplayContext *pdl, MolResiduePtr pRes);
    
    //////////////////////////////////////////////////////
    
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
