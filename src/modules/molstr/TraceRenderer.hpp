// -*-Mode: C++;-*-
//
//  backbone trace renderer class
//
//  $Id: TraceRenderer.hpp,v 1.6 2010/01/24 15:23:45 rishitani Exp $

#ifndef TRACE_RENDERER_HPP_
#define TRACE_RENDERER_HPP_

#include "molstr.hpp"
#include "MainChainRenderer.hpp"
#include <gfx/LineIdxGpuPrim.hpp>

#include <vector>
#include <utility>
#include <unordered_map>

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

    //////////////////////////////////////////////////////
    // coordinate texture path (direct update)

    bool m_bUseShader;
    bool m_bCheckShaderOK;

    /// Line primitive with texture-fetched endpoints (used when available)
    gfx::LineIdxGpuPrim m_lineIdxGpuPrim;

    /// Coordinate texture (owned). Null when the backend does not support it.
    gfx::FloatDataTexture *m_pCoordTex;

    /// CPU-side staging buffer for the coordinate texture (w*h*3 floats)
    std::vector<qfloat32> m_coordbuf;

    /// Pivot AIDs in the same order as the coordinate texture texels
    std::vector<int> m_aidcache;

    /// pivot AID -> texel index
    std::unordered_map<int, int> m_aid2idx;

    int m_nTexW, m_nTexH;

    bool m_bUseCoordTex;
    bool m_bCoordDirty;

    // ---- collection state (filled during a collect-mode traversal) ----

    /// True while render() is being run only to gather the trace topology.
    bool m_bCollecting;

    /// Pivot AID pairs of consecutive residues within a segment.
    std::vector<std::pair<int, int>> m_traceBonds;

    /// Pivot AIDs of single-residue (isolated) segments.
    std::vector<int> m_traceIso;

    /// pivot AID -> device colour code
    std::unordered_map<int, quint32> m_aidColor;

    bool m_bHavePrev;
    int m_prevAid;
    int m_curSegFirstAid;
    int m_curSegCount;

    // struct IntBond {
    //   quint32 aid1, aid2;
    // };

    // bool m_bPrevAidValid;
    // quint32 m_nPrevAid;
    // quint32 m_nBonds;
    // quint32 m_nVA;

    // std::deque<IntBond> m_bonds;
    // std::deque<quint32> m_atoms;

    // gfx::DrawElemVC *m_pVBO;

    ////////////
    
  public:
    TraceRenderer();
    ~TraceRenderer() override;
    
    const char *getTypeName() const override;

    //////////////////////////////////////////////////////
    // Renderer interface

    void display(DisplayContext *pdc) override;

    void invalidateDisplayCache() override;

    void objectChanged(qsys::ObjectEvent &ev) override;

    //////////////////////////////////////////////////////
    // DispCacheRenderer interface

    void preRender(DisplayContext *pdc) override;
    
    //////////////////////////////////////////////////////
    // MainChainRenderer interface

    void beginRend(DisplayContext *pdl) override;
    void beginSegment(DisplayContext *pdl, MolResiduePtr pRes) override;
    void rendResid(DisplayContext *pdl, MolResiduePtr pRes) override;
    void endSegment(DisplayContext *pdl, MolResiduePtr pRes) override;
    void endRend(DisplayContext *pdl) override;
    
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

    /// Gather trace topology (collect-mode traversal), build the coordinate
    /// texture, the AID->index map, and the immutable line VBO. Falls back
    /// (clears m_bUseCoordTex) when no float data texture is available.
    void renderCoordTexImpl(DisplayContext *pdc);

    /// Re-gather pivot positions into the coordinate texture. Called from
    /// display() when m_bCoordDirty.
    bool updateCoordTex();

  };

}

#endif
