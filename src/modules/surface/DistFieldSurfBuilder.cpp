// -*-Mode: C++;-*-
//
//  Distance-field molecular surface builder
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

void DistFieldSurfBuilder::setupGrid(double probeForPad)
{
  const double s = m_gridSpacing;
  const int natoms = (int) m_pos.size();

  Vector4D cmin = m_pos[0];
  Vector4D cmax = m_pos[0];
  double maxAtomR = 0.0;
  for (int a = 0; a < natoms; ++a) {
    const Vector4D &p = m_pos[a];
    if (p.x() < cmin.x()) cmin.x() = p.x();
    if (p.y() < cmin.y()) cmin.y() = p.y();
    if (p.z() < cmin.z()) cmin.z() = p.z();
    if (p.x() > cmax.x()) cmax.x() = p.x();
    if (p.y() > cmax.y()) cmax.y() = p.y();
    if (p.z() > cmax.z()) cmax.z() = p.z();
    if (m_radius[a] > maxAtomR) maxAtomR = m_radius[a];
  }

  // Pad to cover the largest probe reach (atom radius + twice the probe for
  // the SES pass) plus a few cells for the gradient band.
  const double pad = maxAtomR + 2.0 * probeForPad + 3.0 * s;
  m_origin = Vector4D(cmin.x() - pad, cmin.y() - pad, cmin.z() - pad);

  m_nx = (int) std::ceil((cmax.x() - cmin.x() + 2.0 * pad) / s) + 1;
  m_ny = (int) std::ceil((cmax.y() - cmin.y() + 2.0 * pad) / s) + 1;
  m_nz = (int) std::ceil((cmax.z() - cmin.z() + 2.0 * pad) / s) + 1;
}

void DistFieldSurfBuilder::fillField(const std::vector<Vector4D> &centers,
                                     const std::vector<double> &radii,
                                     const std::vector<int> &ids)
{
  const double s = m_gridSpacing;
  const size_t ntotal = (size_t) m_nx * m_ny * m_nz;
  m_field.assign(ntotal, FAR_OUTSIDE);
  m_idgrid.assign(ntotal, -1);

  // Margin (in Angstrom) around each sphere for a valid gradient band.
  const double margin = 2.0 * s;
  const int nc = (int) centers.size();

  for (int a = 0; a < nc; ++a) {
    const Vector4D &c = centers[a];
    const double R = radii[a];
    const int id = ids[a];

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

void DistFieldSurfBuilder::emitMesh(const DistMapMarchingCubes &mc,
                                    bool negateNormals)
{
  const double s = m_gridSpacing;
  const std::vector<MSVert> &gverts = mc.getVerts();
  m_verts.resize(gverts.size());
  const float nsign = negateNormals ? -1.0f : 1.0f;
  for (size_t i = 0; i < gverts.size(); ++i) {
    MSVert v = gverts[i];
    // Grid index coordinates -> world coordinates (isotropic grid).
    v.x = (qfloat32) (m_origin.x() + v.x * s);
    v.y = (qfloat32) (m_origin.y() + v.y * s);
    v.z = (qfloat32) (m_origin.z() + v.z * s);
    v.nx *= nsign;
    v.ny *= nsign;
    v.nz *= nsign;
    m_verts[i] = v;
  }
  m_faces = mc.getFaces();
}

double DistFieldSurfBuilder::nearestAtomResidual(const Vector4D &p) const
{
  double best = 1.0e30;
  const int natoms = (int) m_pos.size();
  for (int a = 0; a < natoms; ++a) {
    const double d = (p - m_pos[a]).length() - m_radius[a];
    if (d < best)
      best = d;
  }
  return best;
}

namespace {
  int ufFind(std::vector<int> &parent, int x)
  {
    while (parent[x] != x) {
      parent[x] = parent[parent[x]];  // path halving
      x = parent[x];
    }
    return x;
  }
  void ufUnion(std::vector<int> &parent, int a, int b)
  {
    const int ra = ufFind(parent, a);
    const int rb = ufFind(parent, b);
    if (ra != rb)
      parent[ra] = rb;
  }
}

void DistFieldSurfBuilder::pruneComponents(double maxResidual)
{
  const int nv = (int) m_verts.size();
  if (nv == 0)
    return;

  std::vector<int> parent(nv);
  for (int i = 0; i < nv; ++i)
    parent[i] = i;
  for (size_t f = 0; f < m_faces.size(); ++f) {
    ufUnion(parent, (int) m_faces[f].id1, (int) m_faces[f].id2);
    ufUnion(parent, (int) m_faces[f].id2, (int) m_faces[f].id3);
  }

  // Decide keep/drop per component, using the first vertex seen as its
  // representative (a component is entirely near atoms or entirely far).
  std::vector<char> rootDecided(nv, 0);
  std::vector<char> rootKeep(nv, 0);
  for (int i = 0; i < nv; ++i) {
    const int r = ufFind(parent, i);
    if (!rootDecided[r]) {
      rootDecided[r] = 1;
      rootKeep[r] =
          (nearestAtomResidual(m_verts[i].v3d()) < maxResidual) ? 1 : 0;
    }
  }

  // Compact the kept vertices and remap faces.
  std::vector<int> vmap(nv, -1);
  std::vector<MSVert> newVerts;
  newVerts.reserve(nv);
  for (int i = 0; i < nv; ++i) {
    if (rootKeep[ufFind(parent, i)]) {
      vmap[i] = (int) newVerts.size();
      newVerts.push_back(m_verts[i]);
    }
  }

  std::vector<MSFace> newFaces;
  newFaces.reserve(m_faces.size());
  for (size_t f = 0; f < m_faces.size(); ++f) {
    const int v1 = vmap[m_faces[f].id1];
    const int v2 = vmap[m_faces[f].id2];
    const int v3 = vmap[m_faces[f].id3];
    if (v1 >= 0 && v2 >= 0 && v3 >= 0)
      newFaces.push_back(MSFace((quint32) v1, (quint32) v2, (quint32) v3));
  }

  m_verts.swap(newVerts);
  m_faces.swap(newFaces);
}

void DistFieldSurfBuilder::build()
{
  m_verts.clear();
  m_faces.clear();
  m_nx = m_ny = m_nz = 0;

  if (m_pos.empty())
    return;

  const double probe = m_probeRadius;
  const double probeForPad = (m_nSurfType == SURF_VDW) ? 0.0 : probe;
  setupGrid(probeForPad);

  // --- Pass 1: union of atom spheres (VDW) or atom+probe spheres (SAS). ---
  const double offset = (m_nSurfType == SURF_VDW) ? 0.0 : probe;
  std::vector<double> radii1((size_t) m_pos.size());
  for (size_t a = 0; a < m_pos.size(); ++a)
    radii1[a] = m_radius[a] + offset;
  fillField(m_pos, radii1, m_id);

  DistMapMarchingCubes mc1;
  mc1.setField(&m_field[0], m_nx, m_ny, m_nz);
  mc1.setIdField(&m_idgrid[0]);
  mc1.setIsoLevel(0.0f);
  mc1.build();

  if (m_nSurfType != SURF_SES) {
    // VDW / SAS: the pass-1 contour is the surface. Gradient points outward.
    emitMesh(mc1, false);
    return;
  }

  // --- Pass 2 (SES): roll the probe by placing probe spheres at the SAS
  // surface vertices, then contour the union. The inner boundary of that
  // union is the solvent-excluded surface. ---
  const std::vector<MSVert> &sasv = mc1.getVerts();
  if (sasv.empty())
    return;

  const double s = m_gridSpacing;
  std::vector<Vector4D> centers(sasv.size());
  std::vector<double> radii2(sasv.size(), probe);
  std::vector<int> ids2(sasv.size());
  for (size_t i = 0; i < sasv.size(); ++i) {
    centers[i] = Vector4D(m_origin.x() + sasv[i].x * s,
                          m_origin.y() + sasv[i].y * s,
                          m_origin.z() + sasv[i].z * s);
    ids2[i] = (int) sasv[i].info;
  }
  fillField(centers, radii2, ids2);

  DistMapMarchingCubes mc2;
  mc2.setField(&m_field[0], m_nx, m_ny, m_nz);
  mc2.setIdField(&m_idgrid[0]);
  mc2.setIsoLevel(0.0f);
  mc2.build();

  // For the SES the probe-covered region is negative, so the gradient points
  // into the molecule; negate to get outward (solvent-facing) normals.
  emitMesh(mc2, true);

  // Keep only the inner SES sheet (near atoms); drop the outer probe shell.
  pruneComponents(1.5 * probe);
}
