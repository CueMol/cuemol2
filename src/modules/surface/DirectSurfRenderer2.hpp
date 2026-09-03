// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer v2 (distance-field method)
//

#ifndef DIRECT_SURF_RENDERER2_HPP_INCLUDED
#define DIRECT_SURF_RENDERER2_HPP_INCLUDED

#include "DirectSurfRendererBase.hpp"

#include <gfx/TrigGpuPrim.hpp>

#include <vector>

class DirectSurfRenderer2_wrap;

namespace surface {

  /////////////////////////////////
  // Direct molecular surface renderer v2
  //
  // Generates VDW / SAS / SES surfaces from a signed distance field contoured
  // by marching cubes (see DistFieldSurfBuilder). Replaces the EDTSurf-based
  // DirectSurfRenderer for higher mesh quality, and draws through a GPU
  // triangle primitive coloured by the resolver shared with the DL path.

  class DirectSurfRenderer2 : public DirectSurfRendererBase
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::DirectSurfRenderer2_wrap;

    typedef DirectSurfRendererBase super_t;

  public:

    DirectSurfRenderer2();
    ~DirectSurfRenderer2() override;

    const char *getTypeName() const override;

    ///////////////////////////////////////////

    void display(DisplayContext *pdc) override;

    void invalidateDisplayCache() override;

    void unloading() override;

    /// Geometry changed: drop the GPU primitive and the CPU mesh cache.
    void invalidateMeshCache() override;

  protected:
    /// Build the cached surface mesh using the distance-field builder.
    void buildMeshCache() override;

    /// Visibility changed: rebuild the GPU primitive, keep the geometry cache.
    void onShowSelChanged() override;

    /// Compute per-vertex device colours and the showsel visibility mask.
    /// Fills vidmap (compacted index, or -1 if hidden) and vcol (device
    /// colour), and returns the number of shown vertices. Colours come from
    /// the resolver the display-list path uses, so both paths agree.
    int computeShownColors(std::vector<int> &vidmap, std::vector<quint32> &vcol);

  private:
    /// Build and upload the GPU triangle primitive directly from the mesh
    /// cache (bypasses the gfx::Mesh / display-list intermediates).
    void buildGpuMesh(DisplayContext *pdc);

    /// Rewrite only the colours of the existing GPU primitive in place.
    /// Returns false when a full rebuild is required (e.g. visibility changed).
    bool updateGpuColors();

    /// Drop the GPU primitive only (keeps the CPU mesh cache m_verts/m_faces).
    void invalidateGpuMesh();

    /// VDW radius for an atom from the element-keyed radius properties.
    double getVdwRadius(MolAtomPtr pAtom) const;

    /// Map the integer detail level to a grid spacing (Angstrom).
    double detailToSpacing(int detail) const;

    ////////////////////////////////
    // GPU triangle primitive (direct draw path, bypasses display-list cache)
    gfx::TrigGpuPrim m_trigGpuPrim;
    bool m_bCheckShaderOK;
    bool m_bUseShader;
    /// True when only colours changed: refresh GPU colours in place, keep geom.
    bool m_bColorDirty;

  };

}

#endif // DIRECT_SURF_RENDERER2_HPP_INCLUDED
