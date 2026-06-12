// -*-Mode: C++;-*-
//
//  Distance-field molecular surface builder
//

#ifndef SURFACE_DIST_FIELD_SURF_BUILDER_HPP_INCLUDED
#define SURFACE_DIST_FIELD_SURF_BUILDER_HPP_INCLUDED

#include "surface.hpp"
#include "MSGeomTypes.hpp"

#include <qlib/Vector4D.hpp>
#include <vector>

namespace surface {

  using qlib::Vector4D;

  class DistMapMarchingCubes;

  /// Builds a molecular surface mesh from atom spheres using a signed
  /// distance field contoured by marching cubes. Decoupled from qsys so the
  /// core geometry can be unit-tested by feeding atom positions/radii
  /// directly.
  ///
  /// Phase 1: VDW and SAS (single distance-field pass). SES (the second
  /// probe-sphere pass) is added in a later phase; for now SES falls back to
  /// the SAS field.
  class DistFieldSurfBuilder
  {
  public:
    enum {
      SURF_VDW = 0,
      SURF_SAS = 1,
      SURF_SES = 2,
    };

    DistFieldSurfBuilder();
    ~DistFieldSurfBuilder();

    void setProbeRadius(double r) { m_probeRadius = r; }
    double getProbeRadius() const { return m_probeRadius; }

    void setGridSpacing(double s) { m_gridSpacing = s; }
    double getGridSpacing() const { return m_gridSpacing; }

    void setSurfType(int t) { m_nSurfType = t; }
    int getSurfType() const { return m_nSurfType; }

    void clearAtoms();
    void addAtom(const Vector4D &pos, double radius, int id);
    int getAtomCount() const { return (int) m_pos.size(); }

    /// Run the surface build. Fills the result vertex/face arrays (world
    /// coordinates).
    void build();

    const std::vector<MSVert> &getVerts() const { return m_verts; }
    const std::vector<MSFace> &getFaces() const { return m_faces; }

    // Grid accessors (valid after build(); mainly for tests/diagnostics).
    int getGridDimX() const { return m_nx; }
    int getGridDimY() const { return m_ny; }
    int getGridDimZ() const { return m_nz; }

  private:
    /// Establish the grid (origin and dimensions) covering all atoms, padded
    /// for the largest sphere plus probe reach.
    void setupGrid(double probeForPad);

    /// Fill the (already-sized) distance field as a union-of-balls signed
    /// distance field min(|p - center| - radius), tracking the source id.
    void fillField(const std::vector<Vector4D> &centers,
                   const std::vector<double> &radii,
                   const std::vector<int> &ids);

    /// Copy a marching-cubes result into the world-coordinate result arrays.
    void emitMesh(const DistMapMarchingCubes &mc, bool negateNormals);

    /// Drop connected components whose representative vertex is farther than
    /// maxResidual from every atom surface (removes the SES outer shell and
    /// spurious pieces).
    void pruneComponents(double maxResidual);

    /// min over atoms of (|p - center| - radius).
    double nearestAtomResidual(const Vector4D &p) const;

    // params
    double m_probeRadius;
    double m_gridSpacing;
    int m_nSurfType;

    // atoms
    std::vector<Vector4D> m_pos;
    std::vector<double> m_radius;
    std::vector<int> m_id;

    // distance field grid
    std::vector<float> m_field;
    std::vector<int> m_idgrid;
    int m_nx, m_ny, m_nz;
    Vector4D m_origin;

    // result (world coordinates)
    std::vector<MSVert> m_verts;
    std::vector<MSFace> m_faces;
  };

}  // namespace surface

#endif  // SURFACE_DIST_FIELD_SURF_BUILDER_HPP_INCLUDED
