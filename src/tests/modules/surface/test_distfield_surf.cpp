//
// Unit tests for the distance-field molecular surface builder (dsurf2 core).
//

#include <gtest/gtest.h>
#include <common.h>

#include <qlib/Vector4D.hpp>
#include "surface/DistFieldSurfBuilder.hpp"
#include "surface/DistMapMarchingCubes.hpp"

#include <cmath>
#include <vector>

using qlib::Vector4D;
using surface::DistFieldSurfBuilder;
using surface::DistMapMarchingCubes;
using surface::MSVert;
using surface::MSFace;

namespace {

  Vector4D vertPos(const MSVert &v)
  {
    return Vector4D(v.x, v.y, v.z);
  }

  // Smallest (|vertex - center_a| - effRadius_a) over all atoms. For a point
  // on the union-of-balls surface this should be close to zero.
  double minSphereResidual(const Vector4D &p,
                           const std::vector<Vector4D> &centers,
                           const std::vector<double> &effRadii)
  {
    double best = 1.0e30;
    for (size_t a = 0; a < centers.size(); ++a) {
      const double d = (p - centers[a]).length() - effRadii[a];
      if (std::fabs(d) < std::fabs(best))
        best = d;
    }
    return best;
  }

}  // namespace

// A single sphere SAS surface: every vertex lies on a sphere of radius
// (atomRadius + probeRadius), with outward-pointing normals.
TEST(DistFieldSurfTest, SingleSphereSAS)
{
  const double R = 3.0;
  const double probe = 1.4;
  const double spacing = 0.25;

  DistFieldSurfBuilder b;
  b.setSurfType(DistFieldSurfBuilder::SURF_SAS);
  b.setProbeRadius(probe);
  b.setGridSpacing(spacing);
  b.addAtom(Vector4D(0, 0, 0), R, 0);
  b.build();

  const std::vector<MSVert> &verts = b.getVerts();
  const std::vector<MSFace> &faces = b.getFaces();
  ASSERT_GT(verts.size(), 100u);
  ASSERT_GT(faces.size(), 100u);

  const double effR = R + probe;
  const double tol = 2.0 * spacing;
  for (size_t i = 0; i < verts.size(); ++i) {
    const Vector4D p = vertPos(verts[i]);
    const double r = p.length();
    EXPECT_NEAR(r, effR, tol);

    // Outward normal: points away from the sphere center.
    const Vector4D n(verts[i].nx, verts[i].ny, verts[i].nz);
    EXPECT_GT(n.dot(p), 0.0);
  }
}

// VDW surface uses the atom radius directly (no probe inflation).
TEST(DistFieldSurfTest, SingleSphereVDW)
{
  const double R = 2.0;
  const double spacing = 0.2;

  DistFieldSurfBuilder b;
  b.setSurfType(DistFieldSurfBuilder::SURF_VDW);
  b.setProbeRadius(1.4);  // ignored for VDW
  b.setGridSpacing(spacing);
  b.addAtom(Vector4D(0, 0, 0), R, 0);
  b.build();

  const std::vector<MSVert> &verts = b.getVerts();
  ASSERT_GT(verts.size(), 100u);

  const double tol = 2.0 * spacing;
  for (size_t i = 0; i < verts.size(); ++i) {
    const double r = vertPos(verts[i]).length();
    EXPECT_NEAR(r, R, tol);
  }
}

// Two atoms: every surface vertex lies on the union-of-balls boundary, i.e.
// it sits on the nearest atom sphere and outside (or on) all the others.
TEST(DistFieldSurfTest, TwoAtomsUnionSurface)
{
  const double R = 2.0;
  const double probe = 1.4;
  const double spacing = 0.25;
  const double effR = R + probe;

  std::vector<Vector4D> centers;
  std::vector<double> effRadii;
  centers.push_back(Vector4D(0, 0, 0));
  centers.push_back(Vector4D(3.0, 0, 0));  // overlapping spheres
  effRadii.push_back(effR);
  effRadii.push_back(effR);

  DistFieldSurfBuilder b;
  b.setSurfType(DistFieldSurfBuilder::SURF_SAS);
  b.setProbeRadius(probe);
  b.setGridSpacing(spacing);
  b.addAtom(centers[0], R, 0);
  b.addAtom(centers[1], R, 1);
  b.build();

  const std::vector<MSVert> &verts = b.getVerts();
  ASSERT_GT(verts.size(), 200u);

  const double tol = 2.0 * spacing;
  for (size_t i = 0; i < verts.size(); ++i) {
    const double resid = minSphereResidual(vertPos(verts[i]), centers, effRadii);
    EXPECT_NEAR(resid, 0.0, tol);
  }
}

// SES of a single isolated atom equals its VDW sphere (radius R): the probe
// cannot create any reentrant region, and the outer probe shell is pruned.
TEST(DistFieldSurfTest, SingleSphereSES)
{
  const double R = 3.0;
  const double probe = 1.4;
  const double spacing = 0.25;

  DistFieldSurfBuilder b;
  b.setSurfType(DistFieldSurfBuilder::SURF_SES);
  b.setProbeRadius(probe);
  b.setGridSpacing(spacing);
  b.addAtom(Vector4D(0, 0, 0), R, 0);
  b.build();

  const std::vector<MSVert> &verts = b.getVerts();
  ASSERT_GT(verts.size(), 100u);

  const double tol = 2.0 * spacing;
  for (size_t i = 0; i < verts.size(); ++i) {
    const Vector4D p = vertPos(verts[i]);
    // Inner SES sheet sits on the VDW sphere; outer shell (R+2*probe) pruned.
    EXPECT_NEAR(p.length(), R, tol);

    // Outward normal points away from the molecule (here, away from center).
    const Vector4D n(verts[i].nx, verts[i].ny, verts[i].nz);
    EXPECT_GT(n.dot(p), 0.0);
  }
}

// SES of two atoms: every vertex lies in the shell between the VDW surface and
// the SAS surface (outer probe shell pruned, nothing inside the VDW volume).
TEST(DistFieldSurfTest, TwoAtomsSES)
{
  const double R = 2.0;
  const double probe = 1.4;
  const double spacing = 0.25;

  std::vector<Vector4D> centers;
  centers.push_back(Vector4D(0, 0, 0));
  centers.push_back(Vector4D(3.0, 0, 0));

  DistFieldSurfBuilder b;
  b.setSurfType(DistFieldSurfBuilder::SURF_SES);
  b.setProbeRadius(probe);
  b.setGridSpacing(spacing);
  b.addAtom(centers[0], R, 0);
  b.addAtom(centers[1], R, 1);
  b.build();

  const std::vector<MSVert> &verts = b.getVerts();
  ASSERT_GT(verts.size(), 200u);

  const double tol = 2.0 * spacing;
  for (size_t i = 0; i < verts.size(); ++i) {
    const Vector4D p = vertPos(verts[i]);
    double dmin = 1.0e30;
    for (size_t a = 0; a < centers.size(); ++a) {
      const double d = (p - centers[a]).length();
      if (d < dmin) dmin = d;
    }
    // Not inside the VDW volume, and within the SAS shell (outer shell pruned).
    EXPECT_GT(dmin, R - tol);
    EXPECT_LT(dmin, R + probe + tol);
  }
}

// Marching cubes welds shared edge vertices: a closed surface has every face
// index in range and (for a manifold) twice as many faces as vertices minus a
// small Euler-characteristic offset. Here we just pin the welding/indexing.
TEST(DistMapMarchingCubesTest, IndicesInRangeAndWelded)
{
  const double R = 3.0;
  const double spacing = 0.3;

  DistFieldSurfBuilder b;
  b.setSurfType(DistFieldSurfBuilder::SURF_VDW);
  b.setGridSpacing(spacing);
  b.addAtom(Vector4D(0, 0, 0), R, 0);
  b.build();

  const std::vector<MSVert> &verts = b.getVerts();
  const std::vector<MSFace> &faces = b.getFaces();
  ASSERT_GT(verts.size(), 0u);
  ASSERT_GT(faces.size(), 0u);

  const quint32 nv = (quint32) verts.size();
  for (size_t i = 0; i < faces.size(); ++i) {
    EXPECT_LT(faces[i].id1, nv);
    EXPECT_LT(faces[i].id2, nv);
    EXPECT_LT(faces[i].id3, nv);
    // Degenerate triangles should not be produced.
    EXPECT_NE(faces[i].id1, faces[i].id2);
    EXPECT_NE(faces[i].id2, faces[i].id3);
    EXPECT_NE(faces[i].id1, faces[i].id3);
  }

  // Closed manifold sphere: V - E + F = 2, E = 3F/2  ->  V = F/2 + 2.
  // Welding makes vertices shared, so V is far below 3*F (the unwelded count).
  EXPECT_LT(verts.size(), faces.size() * 2u);
}
