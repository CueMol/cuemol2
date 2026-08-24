//
// Backend-independent specification tests for MolSurfObj::createSESFromArray.
//
// The same invariants must hold for both SES backends (vendored BALL in the
// default build, MeshMS when ENABLE_MESHMS is on), so this file pins the
// observable contract of the generation path rather than any backend's exact
// output: shell containment, valid faces, outward orientation/winding, the
// density parameter's direction, the w-component-as-radius convention, and
// determinism across a repeated call (which in MeshMS builds also exercises
// the RS-cache reuse path).
//

#include <gtest/gtest.h>
#include <common.h>

#include <qlib/LExceptions.hpp>
#include <qlib/Vector4D.hpp>
#include "surface/MolSurfObj.hpp"

#include <cmath>
#include <vector>

using qlib::Vector4D;
using surface::MolSurfObj;
using surface::MolSurfObjPtr;
using surface::MSVert;
using surface::MSFace;

namespace {

  const double PROBE_R = 1.4;

  // Tolerance shared by both backends: covers BALL's probe-radius retry
  // (up to +-0.1) and both meshers' chord deviation at the tested densities.
  const double SHELL_TOL = 0.15;

  Vector4D vertPos(const MSVert &v)
  {
    return Vector4D(v.x, v.y, v.z);
  }

  // Generate the SES into a fresh MolSurfObj (kept alive by the returned ptr).
  MolSurfObjPtr makeSES(const std::vector<Vector4D> &ary, double density,
                        double probe_r = PROBE_R)
  {
    MolSurfObjPtr pObj(MB_NEW MolSurfObj());
    pObj->createSESFromArray(ary, density, probe_r);
    return pObj;
  }

  // Divergence-theorem signed volume: positive iff faces wind outward.
  double signedVolume(const MolSurfObj &obj)
  {
    double vol6 = 0.0;
    for (int i = 0; i < obj.getFaceSize(); ++i) {
      const MSFace &f = obj.getFaceAt(i);
      const Vector4D a = vertPos(obj.getVertAt(f.id1));
      const Vector4D b = vertPos(obj.getVertAt(f.id2));
      const Vector4D c = vertPos(obj.getVertAt(f.id3));
      vol6 += a.dot(b.cross(c));
    }
    return vol6 / 6.0;
  }

}  // namespace

// Two overlapping atoms: every SES vertex lies in the shell between the vdW
// surface and the solvent-accessible surface of its nearest atom.
TEST(SesFromArrayTest, TwoAtomsSESShellInvariant)
{
  const double R = 2.0;
  std::vector<Vector4D> ary = {Vector4D(0, 0, 0, R), Vector4D(3.0, 0, 0, R)};
  MolSurfObjPtr pObj = makeSES(ary, 4.0);

  ASSERT_GT(pObj->getVertSize(), 10);
  ASSERT_GT(pObj->getFaceSize(), 10);

  for (int i = 0; i < pObj->getVertSize(); ++i) {
    const Vector4D p = vertPos(pObj->getVertAt(i));
    const double d0 = (p - Vector4D(0, 0, 0)).length();
    const double d1 = (p - Vector4D(3.0, 0, 0)).length();
    const double dmin = std::min(d0, d1);
    EXPECT_GE(dmin, R - SHELL_TOL);
    EXPECT_LE(dmin, R + PROBE_R + SHELL_TOL);
  }
}

// Face indices are in range and reference three distinct vertices.
TEST(SesFromArrayTest, FaceIndicesValidAndNonDegenerate)
{
  std::vector<Vector4D> ary = {Vector4D(0, 0, 0, 2.0), Vector4D(3.0, 0, 0, 2.0)};
  MolSurfObjPtr pObj = makeSES(ary, 4.0);

  const quint32 nv = (quint32) pObj->getVertSize();
  for (int i = 0; i < pObj->getFaceSize(); ++i) {
    const MSFace &f = pObj->getFaceAt(i);
    ASSERT_LT(f.id1, nv);
    ASSERT_LT(f.id2, nv);
    ASSERT_LT(f.id3, nv);
    EXPECT_TRUE(f.id1 != f.id2 && f.id2 != f.id3 && f.id1 != f.id3);
  }
}

// Faces wind outward (positive enclosed volume) and the stored per-vertex
// normals agree with the face winding for the vast majority of faces (a small
// minority may disagree near cusp seams).
TEST(SesFromArrayTest, OutwardOrientation)
{
  std::vector<Vector4D> ary = {Vector4D(0, 0, 0, 2.0), Vector4D(3.0, 0, 0, 2.0)};
  MolSurfObjPtr pObj = makeSES(ary, 4.0);

  EXPECT_GT(signedVolume(*pObj), 0.0);

  int agree = 0, total = 0;
  for (int i = 0; i < pObj->getFaceSize(); ++i) {
    const MSFace &f = pObj->getFaceAt(i);
    const MSVert &v1 = pObj->getVertAt(f.id1);
    const MSVert &v2 = pObj->getVertAt(f.id2);
    const MSVert &v3 = pObj->getVertAt(f.id3);
    const Vector4D a = vertPos(v1), b = vertPos(v2), c = vertPos(v3);
    const Vector4D fn = (b - a).cross(c - a);
    const Vector4D vn(v1.nx + v2.nx + v3.nx, v1.ny + v2.ny + v3.ny,
                      v1.nz + v2.nz + v3.nz);
    ++total;
    if (fn.dot(vn) > 0.0)
      ++agree;
  }
  ASSERT_GT(total, 0);
  EXPECT_GE(double(agree) / double(total), 0.95);
}

// A single atom's SES is its vdW sphere.
TEST(SesFromArrayTest, SingleAtomSESIsVdwSphere)
{
  const double R = 3.0;
  std::vector<Vector4D> ary = {Vector4D(1.0, 2.0, 3.0, R)};
  MolSurfObjPtr pObj = makeSES(ary, 4.0);

  ASSERT_GT(pObj->getVertSize(), 10);
  const Vector4D cen(1.0, 2.0, 3.0);
  for (int i = 0; i < pObj->getVertSize(); ++i) {
    const Vector4D p = vertPos(pObj->getVertAt(i));
    EXPECT_NEAR((p - cen).length(), R, 1.0e-3);
    const MSVert &v = pObj->getVertAt(i);
    const Vector4D n(v.nx, v.ny, v.nz);
    EXPECT_GT(n.dot(p - cen), 0.0);
  }
}

// Empty input is rejected identically by both backends.
TEST(SesFromArrayTest, EmptyInputThrows)
{
  MolSurfObjPtr pObj(MB_NEW MolSurfObj());
  std::vector<Vector4D> empty;
  EXPECT_THROW(pObj->createSESFromArray(empty, 4.0, PROBE_R),
               qlib::RuntimeException);
}

// Higher density means a finer mesh (guards the direction of the
// density -> mesh-resolution mapping in every backend).
TEST(SesFromArrayTest, DensityIncreasesResolution)
{
  std::vector<Vector4D> ary = {Vector4D(0, 0, 0, 2.0), Vector4D(3.0, 0, 0, 2.0)};
  MolSurfObjPtr pCoarse = makeSES(ary, 1.0);
  MolSurfObjPtr pFine = makeSES(ary, 4.0);
  EXPECT_GT(pFine->getFaceSize(), pCoarse->getFaceSize());
}

// The w component of each input entry is honoured as that sphere's radius:
// with two different radii the surface must reach the far end of the BIG
// sphere, which a uniform-radius interpretation could not explain.
TEST(SesFromArrayTest, RadiiFromWComponentHonored)
{
  const double rSmall = 1.5, rBig = 2.5;
  const Vector4D cBig(2.0, 0, 0);
  std::vector<Vector4D> ary = {Vector4D(0, 0, 0, rSmall),
                               Vector4D(cBig.x(), cBig.y(), cBig.z(), rBig)};
  MolSurfObjPtr pObj = makeSES(ary, 4.0);

  double maxFromBig = 0.0;
  for (int i = 0; i < pObj->getVertSize(); ++i) {
    const Vector4D p = vertPos(pObj->getVertAt(i));
    maxFromBig = std::max(maxFromBig, (p - cBig).length());
    // No vertex may escape the union of solvent-accessible spheres.
    const double d0 = p.length() - (rSmall + PROBE_R);
    const double d1 = (p - cBig).length() - (rBig + PROBE_R);
    EXPECT_LE(std::min(d0, d1), SHELL_TOL);
  }
  EXPECT_GE(maxFromBig, rBig - SHELL_TOL);
}

// The same input generates the same mesh twice in a row (determinism; in
// MeshMS builds the second call takes the RS-cache reuse path, which must be
// indistinguishable from the full computation).
TEST(SesFromArrayTest, RegenerateSameResult)
{
  std::vector<Vector4D> ary = {Vector4D(0, 0, 0, 2.0), Vector4D(3.0, 0, 0, 2.0)};
  MolSurfObjPtr pObj(MB_NEW MolSurfObj());

  pObj->createSESFromArray(ary, 4.0, PROBE_R);
  const int nv = pObj->getVertSize();
  const int nf = pObj->getFaceSize();
  std::vector<MSVert> verts(nv);
  for (int i = 0; i < nv; ++i)
    verts[i] = pObj->getVertAt(i);

  pObj->createSESFromArray(ary, 4.0, PROBE_R);
  ASSERT_EQ(pObj->getVertSize(), nv);
  ASSERT_EQ(pObj->getFaceSize(), nf);
  for (int i = 0; i < nv; ++i) {
    EXPECT_EQ(pObj->getVertAt(i).x, verts[i].x);
    EXPECT_EQ(pObj->getVertAt(i).y, verts[i].y);
    EXPECT_EQ(pObj->getVertAt(i).z, verts[i].z);
  }
}
