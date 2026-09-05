// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer v2 (distance-field method)
//

#include <common.h>

#include "DirectSurfRenderer2.hpp"
#include "DistFieldSurfBuilder.hpp"

#include <qlib/parallel.hpp>

#include <chrono>

#include <gfx/DisplayContext.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>

using namespace surface;
using gfx::DisplayContext;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::AtomIterator;

DirectSurfRenderer2::DirectSurfRenderer2()
{
  m_bCheckShaderOK = false;
  m_bUseShader = false;
  m_bColorDirty = false;
}

DirectSurfRenderer2::~DirectSurfRenderer2()
{
}

const char *DirectSurfRenderer2::getTypeName() const
{
  return "dsurf2";
}

void DirectSurfRenderer2::invalidateMeshCache()
{
  // Geometry changed: drop the GPU primitive and the CPU mesh cache so the
  // surface is fully recomputed.
  invalidateGpuMesh();
  super_t::invalidateMeshCache();
}

void DirectSurfRenderer2::onShowSelChanged()
{
  // Visibility (drawn subset) changes -> rebuild the GPU primitive, but
  // keep the surface geometry cache (no distance-field recompute).
  invalidateGpuMesh();
  super_t::invalidateDisplayCache();
}

void DirectSurfRenderer2::invalidateGpuMesh()
{
  m_trigGpuPrim.invalidate();
  m_bColorDirty = false;
}

double DirectSurfRenderer2::getVdwRadius(MolAtomPtr pAtom) const
{
  switch (pAtom->getElement()) {
  case molstr::ElemSym::H: return m_vdwr_H;
  case molstr::ElemSym::C: return m_vdwr_C;
  case molstr::ElemSym::N: return m_vdwr_N;
  case molstr::ElemSym::O: return m_vdwr_O;
  case molstr::ElemSym::S: return m_vdwr_S;
  case molstr::ElemSym::P: return m_vdwr_P;
  default: return m_vdwr_X;
  }
}

double DirectSurfRenderer2::detailToSpacing(int detail) const
{
  // Higher detail -> finer grid. Clamp to a sane range (Angstrom).
  const int d = qlib::trunc<int>(detail, 0, 20);
  double spacing = 1.0 / (1.0 + d * 0.3);
  if (spacing < 0.15) spacing = 0.15;
  if (spacing > 1.0) spacing = 1.0;
  return spacing;
}

void DirectSurfRenderer2::buildMeshCache()
{
  MolCoordPtr pmol = getClientMol();

  AtomIterator aiter(pmol, getSelection());

  DistFieldSurfBuilder builder;
  builder.setProbeRadius(m_probeRadius);
  builder.setGridSpacing(detailToSpacing(m_nDetail));

  switch (m_nSurfType) {
  case DS_VDW:
    builder.setSurfType(DistFieldSurfBuilder::SURF_VDW);
    break;
  case DS_SAS:
    builder.setSurfType(DistFieldSurfBuilder::SURF_SAS);
    break;
  case DS_SES:
  default:
    builder.setSurfType(DistFieldSurfBuilder::SURF_SES);
    break;
  }

  for (aiter.first(); aiter.hasMore(); aiter.next()) {
    MolAtomPtr pAtom = aiter.get();
    if (pAtom.isnull()) continue;
    builder.addAtom(pAtom->getPos(), getVdwRadius(pAtom), pAtom->getID());
  }

  if (builder.getAtomCount()==0) {
    // no atoms to be rendered
    return;
  }

  // Always-on log (visible in the GUI log, release builds included) reporting
  // whether the distance-field/marching-cubes build runs on oneTBB and how many
  // worker threads it will try to use.
  LOG_DPRINTLN("DirectSurfRend2> building dsurf2 surface: atoms=%d, "
               "CPU parallel backend=%s, threads=%d",
               builder.getAtomCount(),
               qlib::parallel_enabled() ? "oneTBB" : "serial",
               qlib::parallel_max_concurrency());

  // Time the distance-field + marching-cubes build so the parallel speedup can
  // be compared against a serial run (CUEMOL_TBB_THREADS=1).
  const std::chrono::steady_clock::time_point t0 =
      std::chrono::steady_clock::now();
  builder.build();
  const double build_ms = std::chrono::duration<double, std::milli>(
                              std::chrono::steady_clock::now() - t0)
                              .count();

  const std::vector<MSVert> &bverts = builder.getVerts();
  const std::vector<MSFace> &bfaces = builder.getFaces();
  const int nverts = (int) bverts.size();
  const int nfaces = (int) bfaces.size();

  LOG_DPRINTLN("DirectSurfRend2> dsurf2 surface built in %.1f ms: "
               "verts=%d, faces=%d",
               build_ms, nverts, nfaces);

  m_verts.resize(nverts);
  m_faces.resize(nfaces);

  for (int i=0; i<nverts; ++i)
    m_verts.at(i) = bverts[i];
  for (int i=0; i<nfaces; ++i)
    m_faces.at(i) = bfaces[i];
}

void DirectSurfRenderer2::display(DisplayContext *pdc)
{
  // File (non-GL) export and non-fill draw modes (line/point) use the legacy
  // display-list path (render() -> drawMesh).
  if (pdc->isFile() || getDrawMode()!=SFDRAW_FILL) {
    super_t::display(pdc);
    return;
  }

  if (!m_bCheckShaderOK) {
    m_bUseShader = m_trigGpuPrim.init(pdc);
    if (m_bUseShader)
      MB_DPRINTLN("DirectSurfRend2> triangle shader OK");
    m_bCheckShaderOK = true;
  }

  if (!m_bUseShader) {
    // shader unavailable --> legacy path
    super_t::display(pdc);
    return;
  }

  if (!m_trigGpuPrim.isValid()) {
    // Full (re)build: geometry + colors.
    buildGpuMesh(pdc);
    m_bColorDirty = false;
    if (!m_trigGpuPrim.isValid())
      return; // nothing to draw
  }
  else if (m_bColorDirty) {
    // Color-only change: rewrite colors in place; rebuild if topology moved.
    if (!updateGpuColors())
      buildGpuMesh(pdc);
    m_bColorDirty = false;
    if (!m_trigGpuPrim.isValid())
      return;
  }

  preRender(pdc);
  m_trigGpuPrim.setEdgeLineType(pdc->getEdgeLineType());
  m_trigGpuPrim.draw(pdc);
  postRender(pdc);
}

void DirectSurfRenderer2::invalidateDisplayCache()
{
  // Color/appearance change: keep the GPU geometry and refresh only the
  // vertex colors in place on the next draw. Geometry changes drop the
  // primitive via invalidateMeshCache(); visibility via setShowSel().
  m_bColorDirty = true;
  super_t::invalidateDisplayCache();
}

void DirectSurfRenderer2::unloading()
{
  m_trigGpuPrim.invalidate();
  super_t::unloading();
}

int DirectSurfRenderer2::computeShownColors(std::vector<int> &vidmap,
                                            std::vector<quint32> &vcol)
{
  const int nverts = m_verts.size();
  vidmap.resize(nverts);
  vcol.resize(nverts);

  const qlib::uid_t nSceneID = getSceneID();

  VertexColorEnv env;
  beginVertexColors(env);

  const quint32 defDev = getDefaultColor()->getDevCode(nSceneID);
  ColorPtr pcol;

  // Decide shown vertices (showsel mask), assign compact indices and resolve
  // per-vertex device colors through the resolver shared with render().
  int j = 0;
  for (int i=0; i<nverts; ++i) {
    const MSVert &v = m_verts[i];

    MolAtomPtr pAtom;
    if (!isVertexShown(env, v, pAtom)) {
      vidmap[i] = -1;
      continue; // not shown
    }

    vidmap[i] = j;
    vcol[i] = resolveVertexColor(env, v, pAtom, pcol) ? pcol->getDevCode(nSceneID) : defDev;
    ++j;
  }

  endVertexColors(env);

  return j;
}

void DirectSurfRenderer2::buildGpuMesh(DisplayContext *pdc)
{
  int nverts = m_verts.size();
  int nfaces = m_faces.size();
  if (nverts==0||nfaces==0) {
    buildMeshCache();
    nverts = m_verts.size();
    nfaces = m_faces.size();
  }
  if (nverts==0||nfaces==0)
    return;

  std::vector<int> vidmap;
  std::vector<quint32> vcol;
  const int nv2 = computeShownColors(vidmap, vcol);

  // Count shown faces (all three vertices visible)
  int nf2 = 0;
  for (int i=0; i<nfaces; ++i) {
    if (vidmap[m_faces[i].id1]>=0 &&
        vidmap[m_faces[i].id2]>=0 &&
        vidmap[m_faces[i].id3]>=0)
      ++nf2;
  }

  if (nv2==0||nf2==0)
    return;

  // Fill the GPU primitive directly (no gfx::Mesh / GrowMesh intermediates).
  m_trigGpuPrim.alloc(pdc, nv2, nf2);

  for (int i=0; i<nverts; ++i) {
    const int vj = vidmap[i];
    if (vj<0) continue;
    m_trigGpuPrim.setVertex(vj, m_verts[i].v3d());
    m_trigGpuPrim.setNormal(vj, m_verts[i].n3d());
    m_trigGpuPrim.setColor(vj, vcol[i]);
  }

  int f = 0;
  for (int i=0; i<nfaces; ++i) {
    const int a = vidmap[m_faces[i].id1];
    const int b = vidmap[m_faces[i].id2];
    const int c = vidmap[m_faces[i].id3];
    if (a<0||b<0||c<0) continue;
    m_trigGpuPrim.setFace(f, a, b, c);
    ++f;
  }

  m_trigGpuPrim.setUpdated(true);
}

bool DirectSurfRenderer2::updateGpuColors()
{
  if (!m_trigGpuPrim.isValid())
    return false;

  std::vector<int> vidmap;
  std::vector<quint32> vcol;
  const int nv2 = computeShownColors(vidmap, vcol);

  // If the shown-vertex count no longer matches the allocated primitive, the
  // visibility/topology changed --> caller falls back to a full rebuild.
  if (nv2 != m_trigGpuPrim.getVertexSize())
    return false;

  const int nverts = (int) vidmap.size();
  for (int i=0; i<nverts; ++i) {
    const int vj = vidmap[i];
    if (vj<0) continue;
    m_trigGpuPrim.setColor(vj, vcol[i]);
  }
  m_trigGpuPrim.setUpdated(true);
  return true;
}
