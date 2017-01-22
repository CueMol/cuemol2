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

    /// Line width property
  private:
    double m_lw;
    
  public:
    void setLineWidth(double f) {
      m_lw = f;
      super_t::invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }
    
    ////////////
    // workarea

  public:
    TraceRenderer();
    virtual ~TraceRenderer();
    
    //////////////////////////////////////////////////////
    // Renderer interface
    
    virtual const char *getTypeName() const;

    virtual void display(DisplayContext *pdc);
    
    //////////////////////////////////////////////////////
    // DispCacheRenderer interface

    virtual void preRender(DisplayContext *pdc);
    
    void invalidateDisplayCache();

    //////////////////////////////////////////////////////
    // MainChainRenderer interface

    virtual void beginRend(DisplayContext *pdl);
    virtual void beginSegment(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void rendResid(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void endSegment(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void endRend(DisplayContext *pdl);
    
    //////////////////////////////////////////////////////
    
    // virtual void propChanged(qlib::LPropEvent &ev);
    void objectChanged(qsys::ObjectEvent &ev);

  private:
    
    typedef std::vector<quint32> IDArray;

    int m_nBonds, m_nAtoms;

    /// Bond AID array
    IDArray m_bondAids;

    /// Bond CrdArray index array
    IDArray m_bondInds;

    /// Isolated atom AID array
    IDArray m_atomAids;

    /// Isolated atom CrdArray index array
    IDArray m_atomInds;

    /// cached vertex array/VBO
    gfx::DrawElemVC *m_pVBO;

    void createVBO();
    void updateDynamicVBO();
    void updateStaticVBO();
    void updateVBOColor();

  };

}

#endif
