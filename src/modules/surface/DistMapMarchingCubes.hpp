// -*-Mode: C++;-*-
//
//  Standalone marching cubes for a plain float scalar grid
//

#ifndef SURFACE_DIST_MAP_MARCHING_CUBES_HPP_INCLUDED
#define SURFACE_DIST_MAP_MARCHING_CUBES_HPP_INCLUDED

#include "surface.hpp"
#include "MSGeomTypes.hpp"

#include <qlib/Vector4D.hpp>
#include <unordered_map>
#include <vector>

namespace surface {

  using qlib::Vector4D;

  /// Marching cubes that contours a plain float scalar grid into a welded,
  /// indexed triangle mesh (shared vertices) with gradient-based normals.
  /// The field is borrowed, not owned. Output vertex positions are in grid
  /// index coordinates (caller transforms to world coordinates).
  ///
  /// Uses the shared lookup tables in gfx/MarchingCubesTables.hpp. The corner
  /// inside-mask convention is: corner inside when value <= isolevel.
  class DistMapMarchingCubes
  {
  public:
    DistMapMarchingCubes();
    ~DistMapMarchingCubes();

    /// Set the scalar field. Layout: index(i,j,k) = (i*ny + j)*nz + k.
    void setField(const float *data, int nx, int ny, int nz);

    /// Optional per-grid-point id field (same layout). Default id source = -1.
    void setIdField(const int *idfield) { m_idfield = idfield; }

    /// Iso level to contour (default 0).
    void setIsoLevel(float lev) { m_level = lev; }

    /// Run marching cubes. Results via getVerts()/getFaces().
    void build();

    const std::vector<MSVert> &getVerts() const { return m_verts; }
    const std::vector<MSFace> &getFaces() const { return m_faces; }

  private:
    inline int index(int i, int j, int k) const
    {
      return (i * m_ny + j) * m_nz + k;
    }
    inline float valueAt(int i, int j, int k) const
    {
      return m_data[index(i, j, k)];
    }
    Vector4D gradientAt(int i, int j, int k) const;
    int getEdgeVertex(int ci, int cj, int ck, int iEdge);

    const float *m_data;
    const int *m_idfield;
    int m_nx, m_ny, m_nz;
    float m_level;

    std::vector<MSVert> m_verts;
    std::vector<MSFace> m_faces;

    /// Maps a canonical grid-edge key to an emitted vertex index (welding).
    std::unordered_map<qint64, int> m_edgeCache;
  };

}  // namespace surface

#endif  // SURFACE_DIST_MAP_MARCHING_CUBES_HPP_INCLUDED
