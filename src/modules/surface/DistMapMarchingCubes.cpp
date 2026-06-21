// -*-Mode: C++;-*-
//
//  Standalone marching cubes for a plain float scalar grid
//

#include <common.h>

#include "DistMapMarchingCubes.hpp"

#include <gfx/MarchingCubesTables.hpp>
#include <qlib/parallel.hpp>

#include <unordered_map>
#include <vector>

using namespace surface;
using qlib::Vector4D;

DistMapMarchingCubes::DistMapMarchingCubes()
     : m_data(NULL), m_idfield(NULL), m_nx(0), m_ny(0), m_nz(0), m_level(0.0f)
{
}

DistMapMarchingCubes::~DistMapMarchingCubes()
{
}

void DistMapMarchingCubes::setField(const float *data, int nx, int ny, int nz)
{
  m_data = data;
  m_nx = nx;
  m_ny = ny;
  m_nz = nz;
}

Vector4D DistMapMarchingCubes::gradientAt(int i, int j, int k) const
{
  // Central difference, clamped to the grid bounds at borders.
  const int im = (i > 0) ? i - 1 : i;
  const int ip = (i < m_nx - 1) ? i + 1 : i;
  const int jm = (j > 0) ? j - 1 : j;
  const int jp = (j < m_ny - 1) ? j + 1 : j;
  const int km = (k > 0) ? k - 1 : k;
  const int kp = (k < m_nz - 1) ? k + 1 : k;

  // Gradient points toward increasing field value (outward for a signed
  // distance field where positive is outside the surface).
  const double gx = valueAt(ip, j, k) - valueAt(im, j, k);
  const double gy = valueAt(i, jp, k) - valueAt(i, jm, k);
  const double gz = valueAt(i, j, kp) - valueAt(i, j, km);
  return Vector4D(gx, gy, gz);
}

qint64 DistMapMarchingCubes::edgeKey(int ci, int cj, int ck, int iEdge) const
{
  const int c0 = gfx::mctables::cubeEdgeConnection[iEdge][0];
  const int c1 = gfx::mctables::cubeEdgeConnection[iEdge][1];

  const int g0[3] = { ci + gfx::mctables::cubeVertexOffset[c0][0],
                      cj + gfx::mctables::cubeVertexOffset[c0][1],
                      ck + gfx::mctables::cubeVertexOffset[c0][2] };
  const int g1[3] = { ci + gfx::mctables::cubeVertexOffset[c1][0],
                      cj + gfx::mctables::cubeVertexOffset[c1][1],
                      ck + gfx::mctables::cubeVertexOffset[c1][2] };

  // Canonical edge key: lower endpoint plus the axis the edge runs along.
  // Shared by all cubes that touch this edge, so vertices weld together.
  int axis = 2;
  if (g0[0] != g1[0]) axis = 0;
  else if (g0[1] != g1[1]) axis = 1;
  const int lo[3] = { (g0[0] < g1[0]) ? g0[0] : g1[0],
                      (g0[1] < g1[1]) ? g0[1] : g1[1],
                      (g0[2] < g1[2]) ? g0[2] : g1[2] };
  return (((qint64) lo[0] * m_ny + lo[1]) * (qint64) m_nz + lo[2]) * 3 + axis;
}

void DistMapMarchingCubes::decodeEdgeKey(qint64 key, int g0[3], int g1[3]) const
{
  const int axis = (int) (key % 3);
  qint64 rem = key / 3;
  const int lo2 = (int) (rem % m_nz);
  rem /= m_nz;
  const int lo1 = (int) (rem % m_ny);
  rem /= m_ny;
  const int lo0 = (int) rem;
  g0[0] = lo0; g0[1] = lo1; g0[2] = lo2;
  g1[0] = lo0; g1[1] = lo1; g1[2] = lo2;
  g1[axis] += 1;
}

MSVert DistMapMarchingCubes::makeVertex(const int g0[3], const int g1[3]) const
{
  const float v0 = valueAt(g0[0], g0[1], g0[2]);
  const float v1 = valueAt(g1[0], g1[1], g1[2]);
  float t = 0.5f;
  const float d = v1 - v0;
  if (d != 0.0f)
    t = (m_level - v0) / d;

  const Vector4D p0((double) g0[0], (double) g0[1], (double) g0[2]);
  const Vector4D p1((double) g1[0], (double) g1[1], (double) g1[2]);
  const Vector4D pos = p0 + (p1 - p0).scale(t);

  const Vector4D n0 = gradientAt(g0[0], g0[1], g0[2]);
  const Vector4D n1 = gradientAt(g1[0], g1[1], g1[2]);
  Vector4D nrm = n0 + (n1 - n0).scale(t);
  const double len = nrm.length();
  if (len > 1.0e-10)
    nrm = nrm.divide(len);
  else
    nrm = Vector4D(0.0, 0.0, 1.0);

  MSVert vert(pos, nrm);
  if (m_idfield != NULL) {
    // Inherit id from the more "inside" endpoint (smaller field value).
    const int *g = (v0 <= v1) ? g0 : g1;
    vert.info = (quint32) m_idfield[index(g[0], g[1], g[2])];
  }
  return vert;
}

void DistMapMarchingCubes::build()
{
  m_verts.clear();
  m_faces.clear();

  if (m_data == NULL || m_nx < 2 || m_ny < 2 || m_nz < 2)
    return;

  const int ncellI = m_nx - 1;

  // Phase 1 (parallel over the x-axis): classify every cube and record, per
  // i-slab, the marching-cubes triangles as triples of canonical edge keys.
  // This phase only reads the field and writes its own row bucket, so it is
  // race-free; welding is deferred to the serial merge below.
  std::vector<std::vector<qint64>> rowKeys((size_t) ncellI);

  qlib::parallel_for(0, (size_t) ncellI, [&](size_t ii) {
    const int i = (int) ii;
    std::vector<qint64> &keys = rowKeys[ii];
    qint64 ekey[12];
    for (int j = 0; j < m_ny - 1; ++j) {
      for (int k = 0; k < m_nz - 1; ++k) {

        int flag = 0;
        for (int c = 0; c < 8; ++c) {
          const float cval =
              valueAt(i + gfx::mctables::cubeVertexOffset[c][0],
                      j + gfx::mctables::cubeVertexOffset[c][1],
                      k + gfx::mctables::cubeVertexOffset[c][2]);
          if (cval <= m_level)
            flag |= (1 << c);
        }

        // Entirely inside or outside: no surface crossing.
        if (flag == 0 || flag == 255)
          continue;

        const int eflags = gfx::mctables::cubeEdgeFlags[flag];
        if (eflags == 0)
          continue;

        for (int e = 0; e < 12; ++e) {
          if (eflags & (1 << e))
            ekey[e] = edgeKey(i, j, k, e);
        }

        const int *tri = gfx::mctables::triangleConnectionTable[flag];
        for (int t = 0; tri[t] != -1; t += 3) {
          keys.push_back(ekey[tri[t]]);
          keys.push_back(ekey[tri[t + 1]]);
          keys.push_back(ekey[tri[t + 2]]);
        }
      }
    }
  });

  // Phase 2 (serial merge): weld shared edges by their canonical key into the
  // indexed vertex/face arrays. A vertex is created the first time its edge is
  // referenced, so the welding is identical to the serial build (only the
  // vertex ordering differs).
  std::unordered_map<qint64, int> edgeCache;
  int g0[3], g1[3];
  for (int i = 0; i < ncellI; ++i) {
    const std::vector<qint64> &keys = rowKeys[(size_t) i];
    for (size_t t = 0; t + 2 < keys.size(); t += 3) {
      int idx[3];
      for (int c = 0; c < 3; ++c) {
        const qint64 key = keys[t + c];
        std::unordered_map<qint64, int>::const_iterator it =
            edgeCache.find(key);
        if (it != edgeCache.end()) {
          idx[c] = it->second;
        }
        else {
          decodeEdgeKey(key, g0, g1);
          const int vidx = (int) m_verts.size();
          m_verts.push_back(makeVertex(g0, g1));
          edgeCache[key] = vidx;
          idx[c] = vidx;
        }
      }
      m_faces.push_back(
          MSFace((quint32) idx[0], (quint32) idx[1], (quint32) idx[2]));
    }
  }
}
