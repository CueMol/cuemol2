// -*-Mode: C++;-*-
//
//  Distance-field molecular surface builder (ChimeraX gridsurf method)
//

#include <common.h>

#include "DistFieldSurfBuilder.hpp"
#include "DistMapMarchingCubes.hpp"

#include <cmath>

using namespace surface;
using qlib::Vector4D;

namespace {
  /// Large positive value for grid points far outside every sphere.
  const float FAR_OUTSIDE = 1.0e6f;
}

DistFieldSurfBuilder::DistFieldSurfBuilder()
     : m_probeRadius(1.4), m_gridSpacing(0.5), m_nSurfType(SURF_SES),
       m_nx(0), m_ny(0), m_nz(0)
{
}

DistFieldSurfBuilder::~DistFieldSurfBuilder()
{
}

void DistFieldSurfBuilder::clearAtoms()
{
  m_pos.clear();
  m_radius.clear();
  m_id.clear();
}

void DistFieldSurfBuilder::addAtom(const Vector4D &pos, double radius, int id)
{
  m_pos.push_back(pos);
  m_radius.push_back(radius);
  m_id.push_back(id);
}

void DistFieldSurfBuilder::buildSphereDistField(double probeOffset)
{
  const double s = m_gridSpacing;
  const int natoms = (int) m_pos.size();

  // Bounding box over atom centers and the largest effective radius.
  Vector4D cmin = m_pos[0];
  Vector4D cmax = m_pos[0];
  double maxEffR = 0.0;
  for (int a = 0; a < natoms; ++a) {
    const Vector4D &p = m_pos[a];
    if (p.x() < cmin.x()) cmin.x() = p.x();
    if (p.y() < cmin.y()) cmin.y() = p.y();
    if (p.z() < cmin.z()) cmin.z() = p.z();
    if (p.x() > cmax.x()) cmax.x() = p.x();
    if (p.y() > cmax.y()) cmax.y() = p.y();
    if (p.z() > cmax.z()) cmax.z() = p.z();
    const double effR = m_radius[a] + probeOffset;
    if (effR > maxEffR) maxEffR = effR;
  }

  // Pad by the largest sphere plus a few cells for the gradient band.
  const double pad = maxEffR + 3.0 * s;
  m_origin = Vector4D(cmin.x() - pad, cmin.y() - pad, cmin.z() - pad);

  m_nx = (int) std::ceil((cmax.x() - cmin.x() + 2.0 * pad) / s) + 1;
  m_ny = (int) std::ceil((cmax.y() - cmin.y() + 2.0 * pad) / s) + 1;
  m_nz = (int) std::ceil((cmax.z() - cmin.z() + 2.0 * pad) / s) + 1;

  const size_t ntotal = (size_t) m_nx * m_ny * m_nz;
  m_field.assign(ntotal, FAR_OUTSIDE);
  m_idgrid.assign(ntotal, -1);

  // Margin (in Angstrom) around each sphere for a valid gradient band.
  const double margin = 2.0 * s;

  for (int a = 0; a < natoms; ++a) {
    const Vector4D &c = m_pos[a];
    const double R = m_radius[a] + probeOffset;
    const int id = m_id[a];

    const double reach = R + margin;
    int loi = (int) std::floor((c.x() - reach - m_origin.x()) / s);
    int hii = (int) std::ceil((c.x() + reach - m_origin.x()) / s);
    int loj = (int) std::floor((c.y() - reach - m_origin.y()) / s);
    int hij = (int) std::ceil((c.y() + reach - m_origin.y()) / s);
    int lok = (int) std::floor((c.z() - reach - m_origin.z()) / s);
    int hik = (int) std::ceil((c.z() + reach - m_origin.z()) / s);

    if (loi < 0) loi = 0;
    if (loj < 0) loj = 0;
    if (lok < 0) lok = 0;
    if (hii > m_nx - 1) hii = m_nx - 1;
    if (hij > m_ny - 1) hij = m_ny - 1;
    if (hik > m_nz - 1) hik = m_nz - 1;

    for (int i = loi; i <= hii; ++i) {
      const double dx = m_origin.x() + i * s - c.x();
      for (int j = loj; j <= hij; ++j) {
        const double dy = m_origin.y() + j * s - c.y();
        const double dxy2 = dx * dx + dy * dy;
        const int ijbase = (i * m_ny + j) * m_nz;
        for (int k = lok; k <= hik; ++k) {
          const double dz = m_origin.z() + k * s - c.z();
          const double dist = std::sqrt(dxy2 + dz * dz);
          const float val = (float) (dist - R);
          const int idx = ijbase + k;
          if (val < m_field[idx]) {
            m_field[idx] = val;
            m_idgrid[idx] = id;
          }
        }
      }
    }
  }
}

void DistFieldSurfBuilder::build()
{
  m_verts.clear();
  m_faces.clear();
  m_nx = m_ny = m_nz = 0;

  if (m_pos.empty())
    return;

  // VDW: no probe offset. SAS/SES (phase 1): inflate spheres by probe radius
  // and contour the union-of-balls surface.
  const double probeOffset = (m_nSurfType == SURF_VDW) ? 0.0 : m_probeRadius;
  buildSphereDistField(probeOffset);

  DistMapMarchingCubes mc;
  mc.setField(&m_field[0], m_nx, m_ny, m_nz);
  mc.setIdField(&m_idgrid[0]);
  mc.setIsoLevel(0.0f);
  mc.build();

  // Transform marching-cubes vertices from grid index coords to world coords.
  const double s = m_gridSpacing;
  const std::vector<MSVert> &gverts = mc.getVerts();
  m_verts.resize(gverts.size());
  for (size_t i = 0; i < gverts.size(); ++i) {
    MSVert v = gverts[i];
    v.x = (qfloat32) (m_origin.x() + v.x * s);
    v.y = (qfloat32) (m_origin.y() + v.y * s);
    v.z = (qfloat32) (m_origin.z() + v.z * s);
    // Normals are direction-only and the grid is isotropic, so they stay valid.
    m_verts[i] = v;
  }

  m_faces = mc.getFaces();
}
