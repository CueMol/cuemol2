// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer ("dsurface")
//

#ifndef DIRECT_SURF_RENDERER_HPP_INCLUDED
#define DIRECT_SURF_RENDERER_HPP_INCLUDED

#include "DirectSurfRendererBase.hpp"

#include <gfx/TrigGpuPrim.hpp>

#include <vector>

class DirectSurfRenderer_wrap;

namespace surface {

  /////////////////////////////////////////////////
  // Direct molecular surface renderer
  //
  // Builds the surface mesh with the algorithm the surfalgor property
  // selects and draws it through a GPU triangle primitive coloured by the
  // resolver shared with the display-list path:
  //
  //   edtsurf   voxelized solid contoured by EDTSurf (vendored)
  //   distfield signed distance field contoured by marching cubes
  //   meshms    analytic SES from libMeshMS (SES only; see buildMeshCache)
  //
  // The detail property means the same mesh density for all three: it is the
  // EDTSurf voxel size, which the other two are calibrated against (see
  // docs/architecture/direct-surface-renderer.md).

  class DirectSurfRenderer : public DirectSurfRendererBase
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::DirectSurfRenderer_wrap;

    typedef DirectSurfRendererBase super_t;

  public:

    DirectSurfRenderer();
    ~DirectSurfRenderer() override;

    const char *getTypeName() const override;

    ///////////////////////////////////////////

    void display(DisplayContext *pdc) override;

    /// GPU ID-buffer picking. The fill draw mode uploads every vertex's
    /// owning atom id as its hit name, so a click or hover on the surface
    /// reports that atom (MolRenderer::interpHit). The line and point modes
    /// draw through the display list, which carries one name per mesh, and
    /// are not pickable.
    bool isPickSupported() const override;

    /// The pick pass reuses display(): TrigGpuPrim switches to its pick
    /// program while DisplayContext::isPickDraw() is set. Draws nothing when
    /// the shader is unavailable (the display-list fallback cannot name).
    void displayPick(DisplayContext *pdc) override;

    void invalidateDisplayCache() override;

    void unloading() override;

    /// Geometry changed: drop the GPU primitive and the CPU mesh cache.
    void invalidateMeshCache() override;

    ////////////////////////////////
    // surface calculation algorithm

  private:
    int m_nSurfAlgor;

  public:
    enum {
      DS_EDTSURF = 0,
      DS_DISTFIELD = 1,
      DS_MESHMS = 2
    };

    void setSurfAlgor(int n) {
      if (n==m_nSurfAlgor)
        return;
      m_nSurfAlgor = n;
      invalidateDisplayCache();
      invalidateMeshCache();
    }
    int getSurfAlgor() const { return m_nSurfAlgor; }

  protected:
    /// Build the cached surface mesh with the selected algorithm.
    void buildMeshCache() override;

    /// Visibility changed: rebuild the GPU primitive, keep the geometry cache.
    void onShowSelChanged() override;

    /// Compute per-vertex device colours and the showsel visibility mask.
    /// Fills vidmap (compacted index, or -1 if hidden) and vcol (device
    /// colour), and returns the number of shown vertices. Colours come from
    /// the resolver the display-list path uses, so both paths agree.
    int computeShownColors(std::vector<int> &vidmap, std::vector<quint32> &vcol);

    /// The GPU primitive the fill draw mode uploads (tests read its hit names).
    const gfx::TrigGpuPrim &getTrigGpuPrim() const { return m_trigGpuPrim; }

  private:
    /// One atom handed to the mesh builders.
    struct SurfAtom
    {
      Vector4D pos;
      double rad;
      /// EDTSurf radius-table index (see getRadiusIndex).
      int radIdx;
      /// CueMol atom id, stored in MSVert::info.
      int aid;
    };

    /// Collect the drawn atoms of the client molecule.
    void collectAtoms(std::vector<SurfAtom> &atoms) const;

    void buildMeshEdtSurf(const std::vector<SurfAtom> &atoms);
    void buildMeshDistField(const std::vector<SurfAtom> &atoms);
#ifdef HAVE_MESHMS
    /// Throws std::exception on failure; the caller falls back to distfield.
    void buildMeshMeshMS(const std::vector<SurfAtom> &atoms);
#endif

    /// Give vertices left at NO_ATOM_ID the atom id of a face neighbour, so
    /// that every vertex the colouring sees names a real atom.
    void assignMissingAtomIds();

    /// Load the triangle shader once; false when this context cannot draw
    /// through the GPU primitive (display() then takes the display-list path).
    bool ensureShader(DisplayContext *pdc);

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

    /// EDTSurf radius-table index for an atom's element.
    static int getRadiusIndex(MolAtomPtr pAtom);

    ////////////////////////////////
    // GPU triangle primitive (direct draw path, bypasses display-list cache)
    gfx::TrigGpuPrim m_trigGpuPrim;
    bool m_bCheckShaderOK;
    bool m_bUseShader;
    /// True when only colours changed: refresh GPU colours in place, keep geom.
    bool m_bColorDirty;

  };

}

#endif // DIRECT_SURF_RENDERER_HPP_INCLUDED
