// -*-Mode: C++;-*-
//
//  Ball & stick version of the backbone trace renderer
//

#ifndef TRACE_STICK_RENDERER_HPP_INCLUDED
#define TRACE_STICK_RENDERER_HPP_INCLUDED

#include "molvis.hpp"
#include <modules/molstr/MainChainRenderer.hpp>
#include <modules/molstr/CoordTexSupport.hpp>
#include <gfx/SphereIdxGpuPrim.hpp>
#include <gfx/CylinderIdxGpuPrim.hpp>

#include <vector>
#include <utility>
#include <unordered_map>

class TraceStickRenderer_wrap;

namespace molvis {

  using namespace molstr;
  using gfx::DisplayContext;

  ///
  /// Draws the pivot atoms of the main chain (CA, P, ...) as spheres and
  /// connects consecutive residues of a segment with cylinders.
  ///
  class MOLVIS_API TraceStickRenderer : public MainChainRenderer,
                                        public molstr::CoordTexSupport
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::TraceStickRenderer_wrap;
    typedef MainChainRenderer super_t;

  private:
    /////////////
    // Properties

    /// Cylinder radius
    double m_bondw;

    /// Sphere radius at the pivot atoms
    double m_sphr;

    /// Tessellation detail
    int m_nDetail;

  public:
    double getBondw() const { return m_bondw; }
    void setBondw(double s) { m_bondw = s; }

    double getSphr() const { return m_sphr; }
    void setSphr(double s) { m_sphr = s; }

    int getDetail() const { return m_nDetail; }
    void setDetail(int n) { m_nDetail = n; }

    /// The pick pass reuses display(): every draw path (coordinate-texture
    /// primitives, the display-list fallback) switches to its pick program
    /// while DisplayContext::isPickDraw() is set.
    void displayPick(DisplayContext *pdc) override { display(pdc); }

  public:
    TraceStickRenderer();
    ~TraceStickRenderer() override;

    const char *getTypeName() const override;

    //////////////////////////////////////////////////////
    // Renderer interface

    void display(DisplayContext *pdc) override;

    void invalidateDisplayCache() override;

    void objectChanged(qsys::ObjectEvent &ev) override;

    void propChanged(qlib::LPropEvent &ev) override;

    //////////////////////////////////////////////////////
    // DispCacheRenderer interface

    void preRender(DisplayContext *pdc) override;
    void postRender(DisplayContext *pdc) override;

    //////////////////////////////////////////////////////
    // MainChainRenderer interface

    void beginRend(DisplayContext *pdl) override;
    void beginSegment(DisplayContext *pdl, MolResiduePtr pRes) override;
    void rendResid(DisplayContext *pdl, MolResiduePtr pRes) override;
    void endRend(DisplayContext *pdl) override;

    //////////////////////////////////////////////////////
    // Topology collection

    ///
    /// Walk the selected residues and gather the pivot atoms and the pivot
    /// pairs of consecutive residues, without drawing anything. The results
    /// are available from getPivotAids() / getStickPairs() afterwards.
    ///
    void collectTopology();

    /// Pivot AIDs in traversal order (one sphere each).
    const std::vector<int> &getPivotAids() const { return m_pivots; }

    /// Pivot AID pairs of consecutive residues within a segment (one stick each).
    const std::vector<std::pair<int, int>> &getStickPairs() const { return m_sticks; }

  private:
    void clearTopology();

    /// Build the coordinate texture and the immutable sphere/cylinder VBOs.
    void renderCoordTexImpl(DisplayContext *pdc);

    bool m_bUseShader;
    bool m_bCheckShaderOK;

    gfx::SphereIdxGpuPrim m_sphIdxGpuPrim;
    gfx::CylinderIdxGpuPrim m_cylIdxGpuPrim;

    // ---- collection state (filled during a collect-mode traversal) ----

    /// True while render() is being run only to gather the topology.
    bool m_bCollecting;

    std::vector<int> m_pivots;
    std::vector<std::pair<int, int>> m_sticks;

    /// pivot AID -> residue colour
    std::unordered_map<int, gfx::ColorPtr> m_aidColor;

    /// Previous residue of the current segment (collect and display-list modes)
    MolResiduePtr m_pPrevRes;

    int m_nDetailOld;
  };

}

#endif
