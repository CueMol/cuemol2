// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer ("dsurface")
//

#include <common.h>

#include "DirectSurfRenderer.hpp"
#include "DistFieldSurfBuilder.hpp"

#include <qlib/parallel.hpp>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <vector>

#include <gfx/DisplayContext.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>

#include "edtsurf/CommonPara.h"
#include "edtsurf/ProteinSurface.h"

#ifdef HAVE_MESHMS
#include <array>
#include <stdexcept>
#include <meshms/meshms.hpp>
#endif

using namespace surface;
using gfx::DisplayContext;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::AtomIterator;

namespace {

  /// EDTSurf voxel size (Angstrom) for a detail level: EDTSurf's fixsf is the
  /// number of voxels per Angstrom, so this is its reciprocal. It is the
  /// reference density every algorithm is calibrated against, so that the
  /// detail property means the same thing whichever surfalgor is selected.
  /// detail 1 -> 1.00 A, 6 -> 0.50 A, 16 -> 0.25 A.
  inline double detailToVoxelSize(int detail)
  {
    return 1.0 / (1.0 + 0.2 * double(qlib::trunc<int>(detail-1, 0, 99)));
  }

  /// Distance-field grid spacing / EDTSurf voxel size. Both contour a scalar
  /// field with marching cubes, so equal spacings give comparable meshes;
  /// calibrated on 1CRN (see docs/architecture/direct-surface-renderer.md).
  const double DISTFIELD_SPACING_COEFF = 1.43;

  /// MeshMS target triangle edge length / EDTSurf voxel size. MeshMS meshes
  /// the analytic surface directly instead of a grid, so its edge length is
  /// not a voxel size; calibrated on 1CRN (same doc).
  const double MESHMS_MESH_SIZE_COEFF = 1.61;

  /// Lower bound on the distance-field grid spacing (Angstrom).
  const double DISTFIELD_MIN_SPACING = 0.15;

  /// Cell budget for the distance field. It is a dense 3D grid holding a
  /// float and an int per cell (8 bytes), so this caps it near 512 MB. The
  /// spacing bound above does not help here: the cell count also grows with
  /// the molecule, and detail 32 on a 120 A complex would ask for ~285 M
  /// cells (2.3 GB) and block the worker thread for tens of seconds.
  /// EDTSurf carries an equivalent cap of its own (boxlength > 300).
  const double DISTFIELD_MAX_CELLS = 64.0e6;

  /// Vertex budget for the MeshMS mesh.
  ///
  /// MeshMS has no grid to bound it: the mesh grows with the molecule and with
  /// 1/mesh_size^2, without limit. That matters beyond ordinary memory use
  /// because the arrays here are single contiguous allocations, and the
  /// allocator Electron links (PartitionAlloc) fails a request past ~2 GB by
  /// crashing the process rather than returning null. The largest of them is
  /// m_verts at sizeof(MSVert) = 28 bytes per vertex, so this budget keeps it
  /// near 450 MB -- far enough from the cliff that the surrounding arrays
  /// (m_faces and the MeshResult vectors, 12-24 bytes per element) stay well
  /// clear of it too. Aggregate memory is not the constraint; any single
  /// allocation nearing 2 GB is.
  const double MESHMS_MAX_VERTS = 16.0e6;

  /// Vertices MeshMS emits per atom at mesh_size 1 A: verts ~ C * natoms /
  /// mesh_size^2. Measured on 1CRN and on 27 copies of it (see
  /// test_dsurf_detail_calib): C is 9.7 at the finest mesh sizes and rises to
  /// ~13 at coarse ones, and is the same for both molecule sizes. 12 is taken
  /// as a conservative value -- it overestimates, which coarsens early.
  /// A compact assembly buries more atoms than those test molecules do, so the
  /// estimate errs high there as well, which is the safe direction.
  const double MESHMS_VERTS_PER_ATOM = 12.0;

  /// A mesh this far past the budget means the estimate was badly wrong.
  /// Refuse it rather than allocate for it; the caller falls back to distfield.
  const int MESHMS_HARD_MAX_VERTS = 48000000;

  /// The finest mesh_size whose predicted vertex count fits in the budget.
  double meshmsMinMeshSize(int natoms)
  {
    return std::sqrt(MESHMS_VERTS_PER_ATOM * double(natoms) / MESHMS_MAX_VERTS);
  }

  /// Cells the distance-field grid would use at this spacing.
  /// Mirrors DistFieldSurfBuilder::setupGrid (same padding, same rounding).
  double distFieldCells(double spacing, const Vector4D &bbox, double atomPad)
  {
    const double pad = atomPad + 3.0*spacing;
    const double nx = std::ceil((bbox.x() + 2.0*pad) / spacing) + 1.0;
    const double ny = std::ceil((bbox.y() + 2.0*pad) / spacing) + 1.0;
    const double nz = std::ceil((bbox.z() + 2.0*pad) / spacing) + 1.0;
    return nx*ny*nz;
  }

  /// The finest grid spacing whose cell count fits in the budget.
  ///
  /// Solved for rather than stepped up from the requested spacing: the answer
  /// must depend only on the molecule, or a higher detail could end up with a
  /// coarser grid than a lower one -- asking for more and getting less.
  double distFieldMinSpacing(const Vector4D &bbox, double atomPad)
  {
    const double COARSEST = 4.0;
    if (distFieldCells(COARSEST, bbox, atomPad) > DISTFIELD_MAX_CELLS)
      return COARSEST; // nothing in range fits; take the coarsest we allow

    // Cell count falls monotonically with spacing, so bisect for the turning
    // point. 40 halvings of [0, 4] A settle it far beyond the needed accuracy.
    double lo = 0.0, hi = COARSEST;
    for (int i = 0; i < 40; ++i) {
      const double mid = (lo + hi) * 0.5;
      if (mid <= 0.0) break;
      if (distFieldCells(mid, bbox, atomPad) > DISTFIELD_MAX_CELLS)
        lo = mid;
      else
        hi = mid;
    }
    return hi;
  }

}

DirectSurfRenderer::DirectSurfRenderer()
{
  m_nSurfAlgor = DS_DISTFIELD;
  m_bCheckShaderOK = false;
  m_bUseShader = false;
  m_bColorDirty = false;
}

DirectSurfRenderer::~DirectSurfRenderer()
{
}

const char *DirectSurfRenderer::getTypeName() const
{
  return "dsurface";
}

void DirectSurfRenderer::invalidateMeshCache()
{
  // Geometry changed: drop the GPU primitive and the CPU mesh cache so the
  // surface is fully recomputed.
  invalidateGpuMesh();
  super_t::invalidateMeshCache();
}

void DirectSurfRenderer::onShowSelChanged()
{
  // Visibility (drawn subset) changes -> rebuild the GPU primitive, but
  // keep the surface geometry cache (no mesh recompute).
  invalidateGpuMesh();
  super_t::invalidateDisplayCache();
}

void DirectSurfRenderer::invalidateGpuMesh()
{
  m_trigGpuPrim.invalidate();
  m_bColorDirty = false;
}

//static
int DirectSurfRenderer::getRadiusIndex(MolAtomPtr pAtom)
{
  switch (pAtom->getElement()) {
  case molstr::ElemSym::H: return 0;
  case molstr::ElemSym::C: return 1;
  case molstr::ElemSym::N: return 2;
  case molstr::ElemSym::O: return 3;
  case molstr::ElemSym::S: return 4;
  case molstr::ElemSym::P: return 5;
  default: return 6;
  }
}

double DirectSurfRenderer::getVdwRadius(MolAtomPtr pAtom) const
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

void DirectSurfRenderer::collectAtoms(std::vector<SurfAtom> &atoms) const
{
  atoms.clear();

  MolCoordPtr pmol = getClientMol();
  if (pmol.isnull())
    return;

  AtomIterator aiter(pmol, getSelection());
  for (aiter.first(); aiter.hasMore(); aiter.next()) {
    MolAtomPtr pAtom = aiter.get();
    if (pAtom.isnull()) continue;

    SurfAtom a;
    a.pos = pAtom->getPos();
    a.rad = getVdwRadius(pAtom);
    a.radIdx = getRadiusIndex(pAtom);
    a.aid = pAtom->getID();
    atoms.push_back(a);
  }
}

///////////////////////////////////////////
// mesh builders

void DirectSurfRenderer::buildMeshEdtSurf(const std::vector<SurfAtom> &atoms)
{
  const int natoms = (int) atoms.size();
  int i;

  edtsurf::ProteinSurface pps;

  pps.rasrad[0] = m_vdwr_H;
  pps.rasrad[1] = m_vdwr_C;
  pps.rasrad[2] = m_vdwr_N;
  pps.rasrad[3] = m_vdwr_O;
  pps.rasrad[4] = m_vdwr_S;
  pps.rasrad[5] = m_vdwr_P;
  pps.rasrad[6] = m_vdwr_X;
  // getRadiusIndex() only yields 0..6; give the remaining slots a real value
  for (i=7; i<edtsurf::ProteinSurface::NO_RAD_TYPES; ++i)
    pps.rasrad[i] = m_vdwr_X;

  pps.proberadius = m_probeRadius;
  // fixsf is the number of voxels per Angstrom.
  pps.fixsf = 1.0 / detailToVoxelSize(m_nDetail);

  edtsurf::atom *proseq = new edtsurf::atom[natoms];

  for (i=0; i<natoms; ++i) {
    // ATOM/HEATAM (??)
    proseq[i].simpletype = 1;

    // index number (atom index no)
    proseq[i].seqno = i;

    // atom type ID
    proseq[i].detail = atoms[i].radIdx;

    // coordinates
    proseq[i].x = (float) atoms[i].pos.x();
    proseq[i].y = (float) atoms[i].pos.y();
    proseq[i].z = (float) atoms[i].pos.z();

    proseq[i].ins = ' ';
  }

  int seqinit = 0;
  int seqterm = natoms-1;

  ///////////////////////

  if (m_nSurfType==DS_VDW) {
    MB_DPRINTLN("Initialize...");

    pps.initpara(seqinit, seqterm, proseq,
                 false, false);

    MB_DPRINTLN("actual boxlength %3d, box[%3d*%3d*%3d], scale factor %6.3f",
                pps.boxlength,
                pps.plength,
                pps.pwidth,
                pps.pheight,
                pps.scalefactor);

    MB_DPRINTLN("Build van der Waals solid");
    pps.fillvoxels(seqinit, seqterm, false,
                   proseq, true);
    pps.buildboundary();

    MB_DPRINTLN("Build triangulated surface");
    pps.marchingcube(1);
  }
  else if (m_nSurfType==DS_SAS) {

    MB_DPRINTLN("Initialize...");
    pps.initpara(seqinit, seqterm,
                 proseq, false, true);
    MB_DPRINTLN("actual boxlength %3d, box[%3d*%3d*%3d], scale factor %6.3f",
                pps.boxlength,pps.plength,pps.pwidth,pps.pheight,pps.scalefactor);
    MB_DPRINTLN("Build solvent-accessible solid");
    pps.fillvoxels(seqinit, seqterm, false, proseq, true);
    pps.buildboundary();
    MB_DPRINTLN("Build triangulated surface");
    pps.marchingcube(3);
  }
  else if (m_nSurfType==DS_SES) {

    MB_DPRINTLN("Initialize...");
    pps.initpara(seqinit, seqterm, proseq, true, true);
    MB_DPRINTLN("actual boxlength %3d, box[%3d*%3d*%3d], scale factor %6.3f",
                pps.boxlength,pps.plength,pps.pwidth,pps.pheight,pps.scalefactor);
    MB_DPRINTLN("Build solvent-accessible solid");
    pps.fillvoxels(seqinit, seqterm, true, proseq, true);
    pps.buildboundary();
    MB_DPRINTLN("Euclidean Distance Transform");
    pps.fastdistancemap();
    MB_DPRINTLN("Build triangulated surface");
    pps.marchingcube(4);
  }
  else {
    MB_ASSERT(false);
    delete [] proseq;
    return;
  }

  ///////////////////////

  MB_DPRINTLN("No. vertices %d, No. triangles %d", pps.vertnumber, pps.facenumber);

  pps.laplaciansmooth(1);
  pps.computenorm();

  int nverts = pps.vertnumber;
  int nfaces = pps.facenumber;

  m_verts.resize(nverts);
  m_faces.resize(nfaces);

  double sfac = pps.scalefactor;
  Vector4D ptran(pps.ptran.x, pps.ptran.y, pps.ptran.z);
  for (i=0; i<nverts; ++i) {
    int ind = pps.verts[i].atomid;
    quint32 aid = NO_ATOM_ID;
    if (ind>=0 && ind<natoms) {
      aid = (quint32) atoms[ind].aid;
    }
    Vector4D norm(pps.verts[i].pn.x,
                  pps.verts[i].pn.y,
                  pps.verts[i].pn.z);

    Vector4D pos(pps.verts[i].x,
                 pps.verts[i].y,
                 pps.verts[i].z);
    pos = pos.divide(sfac) - ptran;

    m_verts.at(i).x = (float) pos.x();
    m_verts.at(i).y = (float) pos.y();
    m_verts.at(i).z = (float) pos.z();

    m_verts.at(i).nx = (float) norm.x();
    m_verts.at(i).ny = (float) norm.y();
    m_verts.at(i).nz = (float) norm.z();

    m_verts.at(i).info = aid;
  }

  for (i=0; i<nfaces; ++i) {
    m_faces.at(i).id1 = pps.faces[i].a;
    m_faces.at(i).id2 = pps.faces[i].b;
    m_faces.at(i).id3 = pps.faces[i].c;
  }

  delete [] proseq;
}

void DirectSurfRenderer::buildMeshDistField(const std::vector<SurfAtom> &atoms)
{
  DistFieldSurfBuilder builder;
  builder.setProbeRadius(m_probeRadius);

  double spacing = detailToVoxelSize(m_nDetail) * DISTFIELD_SPACING_COEFF;
  if (spacing < DISTFIELD_MIN_SPACING)
    spacing = DISTFIELD_MIN_SPACING;

  // Keep the dense grid within the cell budget on a large molecule.
  Vector4D cmin = atoms[0].pos, cmax = atoms[0].pos;
  double maxAtomR = 0.0;
  for (const SurfAtom &a : atoms) {
    cmin.x() = qlib::min(cmin.x(), a.pos.x());
    cmin.y() = qlib::min(cmin.y(), a.pos.y());
    cmin.z() = qlib::min(cmin.z(), a.pos.z());
    cmax.x() = qlib::max(cmax.x(), a.pos.x());
    cmax.y() = qlib::max(cmax.y(), a.pos.y());
    cmax.z() = qlib::max(cmax.z(), a.pos.z());
    maxAtomR = qlib::max(maxAtomR, a.rad);
  }
  const double probePad = (m_nSurfType==DS_VDW) ? 0.0 : m_probeRadius;
  const Vector4D bbox(cmax.x()-cmin.x(), cmax.y()-cmin.y(), cmax.z()-cmin.z());
  const double minSpacing = distFieldMinSpacing(bbox, maxAtomR + 2.0*probePad);
  if (spacing < minSpacing) {
    LOG_DPRINTLN("DirectSurfRend> distfield grid too large for detail %d; "
                 "coarsening %.3f -> %.3f A", m_nDetail, spacing, minSpacing);
    spacing = minSpacing;
  }

  builder.setGridSpacing(spacing);

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

  for (const SurfAtom &a : atoms)
    builder.addAtom(a.pos, a.rad, a.aid);

  MB_DPRINTLN("DirectSurfRend> distfield: spacing=%f, CPU parallel backend=%s, threads=%d",
              spacing,
              qlib::parallel_enabled() ? "oneTBB" : "serial",
              qlib::parallel_max_concurrency());

  builder.build();

  const std::vector<MSVert> &bverts = builder.getVerts();
  const std::vector<MSFace> &bfaces = builder.getFaces();
  const int nverts = (int) bverts.size();
  const int nfaces = (int) bfaces.size();

  m_verts.resize(nverts);
  m_faces.resize(nfaces);

  for (int i=0; i<nverts; ++i)
    m_verts.at(i) = bverts[i];
  for (int i=0; i<nfaces; ++i)
    m_faces.at(i) = bfaces[i];
}

#ifdef HAVE_MESHMS

void DirectSurfRenderer::buildMeshMeshMS(const std::vector<SurfAtom> &atoms)
{
  const size_t natoms = atoms.size();

  std::vector< std::array<double,4> > xyzr(natoms);
  for (size_t i=0; i<natoms; ++i) {
    xyzr[i] = { atoms[i].pos.x(), atoms[i].pos.y(), atoms[i].pos.z(),
                atoms[i].rad };
  }

  double mesh_size = detailToVoxelSize(m_nDetail) * MESHMS_MESH_SIZE_COEFF;

  // Keep the mesh within the vertex budget on a large molecule.
  const double minMeshSize = meshmsMinMeshSize((int) natoms);
  if (mesh_size < minMeshSize) {
    LOG_DPRINTLN("DirectSurfRend> meshms mesh too large for detail %d; "
                 "coarsening %.3f -> %.3f A",
                 m_nDetail, mesh_size, minMeshSize);
    mesh_size = minMeshSize;
  }

  // No RS cache is kept here: of the inputs, only detail can change without
  // invalidating the cache, and a detail change already rebuilds everything.
  std::shared_ptr<meshms::RSCache> rs =
      meshms::compute_rs_from_array(xyzr, m_probeRadius);

  meshms::MeshResult mesh =
      meshms::build_mesh_from_cache(rs, mesh_size, /*fuse=*/true);
  mesh = meshms::remove_flaps(mesh);

  const size_t nverts_sz = mesh.verts.size();
  const size_t nfaces_sz = mesh.faces.size();
  if (nverts_sz<1 || nfaces_sz<1)
    throw std::runtime_error("MeshMS returned an empty mesh");
  if (nverts_sz > (size_t) MESHMS_HARD_MAX_VERTS ||
      nfaces_sz > (size_t) MESHMS_HARD_MAX_VERTS * 2)
    throw std::runtime_error("MeshMS mesh is too large to store");

  const int nverts = (int) nverts_sz;
  const int nfaces = (int) nfaces_sz;

  MB_DPRINTLN("DirectSurfRend> meshms: mesh_size=%f", mesh_size);

  m_verts.resize(nverts);
  m_faces.resize(nfaces);

  const bool bHasAtomId = (mesh.atom_id.size()==(size_t) nverts);

  for (int i=0; i<nverts; ++i) {
    MSVert &v = m_verts.at(i);
    v.x = (float) mesh.verts[i][0];
    v.y = (float) mesh.verts[i][1];
    v.z = (float) mesh.verts[i][2];
    v.nx = (float) mesh.vnormals[i][0];
    v.ny = (float) mesh.vnormals[i][1];
    v.nz = (float) mesh.vnormals[i][2];

    // MeshMS reports the owning atom as a 1-based index into the input array
    // (0 = unknown); map it back to the CueMol atom id the colouring uses.
    v.info = NO_ATOM_ID;
    if (bHasAtomId) {
      const size_t id = (size_t) mesh.atom_id[i];
      if (id>0 && id<=natoms)
        v.info = (quint32) atoms[id-1].aid;
    }
  }

  for (int i=0; i<nfaces; ++i) {
    m_faces.at(i).id1 = (quint32) mesh.faces[i][0];
    m_faces.at(i).id2 = (quint32) mesh.faces[i][1];
    m_faces.at(i).id3 = (quint32) mesh.faces[i][2];
  }
}

#endif // HAVE_MESHMS

void DirectSurfRenderer::assignMissingAtomIds()
{
  const int nverts = m_verts.size();
  const int nfaces = m_faces.size();

  int nmiss = 0;
  for (int i=0; i<nverts; ++i) {
    if (m_verts[i].info==NO_ATOM_ID)
      ++nmiss;
  }
  if (nmiss==0)
    return;

  // Spread the ids along the faces: a vertex without an owner takes the one
  // of a neighbour it shares a triangle with. Converges in a couple of passes
  // for the isolated vertices the mesh builders leave behind.
  const int MAX_PASS = 3;
  for (int pass=0; pass<MAX_PASS && nmiss>0; ++pass) {
    int nfixed = 0;
    for (int f=0; f<nfaces; ++f) {
      const quint32 id[3] = { m_faces[f].id1, m_faces[f].id2, m_faces[f].id3 };

      quint32 known = NO_ATOM_ID;
      for (int k=0; k<3; ++k) {
        if (id[k]<(quint32) nverts && m_verts[id[k]].info!=NO_ATOM_ID) {
          known = m_verts[id[k]].info;
          break;
        }
      }
      if (known==NO_ATOM_ID)
        continue;

      for (int k=0; k<3; ++k) {
        if (id[k]<(quint32) nverts && m_verts[id[k]].info==NO_ATOM_ID) {
          m_verts[id[k]].info = known;
          ++nfixed;
        }
      }
    }
    if (nfixed==0)
      break;
    nmiss -= nfixed;
  }

  if (nmiss>0) {
    // Left unresolved: those vertices are painted defaultcolor.
    MB_DPRINTLN("DirectSurfRend> %d vertices have no owning atom", nmiss);
  }
}

///////////////////////////////////////////

void DirectSurfRenderer::buildMeshCache()
{
  std::vector<SurfAtom> atoms;
  collectAtoms(atoms);
  if (atoms.empty()) {
    // no atoms to be rendered
    return;
  }

  // Resolve the algorithm actually used. A fallback never rewrites the
  // surfalgor property: the user's choice is kept (and saved), only this
  // build goes elsewhere.
  int nAlgo = m_nSurfAlgor;
  if (nAlgo==DS_MESHMS) {
#ifndef HAVE_MESHMS
    LOG_DPRINTLN("DirectSurfRend> MeshMS is not available in this build; "
                 "building with distfield");
    nAlgo = DS_DISTFIELD;
#else
    if (m_nSurfType!=DS_SES) {
      LOG_DPRINTLN("DirectSurfRend> MeshMS computes the SES only (surftype is %s); "
                   "building with distfield",
                   (m_nSurfType==DS_VDW) ? "vdw" : "sas");
      nAlgo = DS_DISTFIELD;
    }
#endif
  }

  const std::chrono::steady_clock::time_point t0 =
      std::chrono::steady_clock::now();

  const char *algo = "distfield";
  bool bDone = false;

  switch (nAlgo) {
  case DS_EDTSURF:
    buildMeshEdtSurf(atoms);
    algo = "edtsurf";
    bDone = true;
    break;

#ifdef HAVE_MESHMS
  case DS_MESHMS:
    try {
      buildMeshMeshMS(atoms);
      algo = "meshms";
      bDone = true;
    }
    catch (const std::exception &e) {
      LOG_DPRINTLN("DirectSurfRend> MeshMS failed (%s); building with distfield",
                   e.what());
    }
    catch (...) {
      LOG_DPRINTLN("DirectSurfRend> MeshMS failed (unknown error); "
                   "building with distfield");
    }
    if (!bDone)
      algo = "distfield (meshms fallback)";
    break;
#endif

  default:
    break;
  }

  if (!bDone)
    buildMeshDistField(atoms);

  assignMissingAtomIds();

  const double build_ms = std::chrono::duration<double, std::milli>(
                              std::chrono::steady_clock::now() - t0)
                              .count();

  LOG_DPRINTLN("DirectSurfRend> surface built by %s in %.1f ms: "
               "atoms=%d, verts=%d, faces=%d (detail=%d, probe=%.2f)",
               algo, build_ms, (int) atoms.size(),
               m_verts.size(), m_faces.size(), m_nDetail, m_probeRadius);
}

///////////////////////////////////////////
// GPU draw path

bool DirectSurfRenderer::ensureShader(DisplayContext *pdc)
{
  if (!m_bCheckShaderOK) {
    m_bUseShader = m_trigGpuPrim.init(pdc);
    if (m_bUseShader)
      MB_DPRINTLN("DirectSurfRend> triangle shader OK");
    m_bCheckShaderOK = true;
  }
  return m_bUseShader;
}

bool DirectSurfRenderer::isPickSupported() const
{
  return getDrawMode()==SFDRAW_FILL;
}

void DirectSurfRenderer::displayPick(DisplayContext *pdc)
{
  if (pdc->isFile() || getDrawMode()!=SFDRAW_FILL)
    return;
  // Without the shader, display() would fall back to the display list and
  // draw the mesh into the ID buffer under a single (empty) name, occluding
  // what is behind it for nothing. Draw nothing instead.
  if (!ensureShader(pdc))
    return;
  display(pdc);
}

void DirectSurfRenderer::display(DisplayContext *pdc)
{
  // File (non-GL) export and non-fill draw modes (line/point) use the legacy
  // display-list path (render() -> drawMesh).
  if (pdc->isFile() || getDrawMode()!=SFDRAW_FILL) {
    super_t::display(pdc);
    return;
  }

  if (!ensureShader(pdc)) {
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

void DirectSurfRenderer::invalidateDisplayCache()
{
  // Color/appearance change: keep the GPU geometry and refresh only the
  // vertex colors in place on the next draw. Geometry changes drop the
  // primitive via invalidateMeshCache(); visibility via setShowSel().
  m_bColorDirty = true;
  super_t::invalidateDisplayCache();
}

void DirectSurfRenderer::unloading()
{
  m_trigGpuPrim.invalidate();
  super_t::unloading();
}

int DirectSurfRenderer::computeShownColors(std::vector<int> &vidmap,
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

void DirectSurfRenderer::buildGpuMesh(DisplayContext *pdc)
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
    // The owning atom is the pick result. NO_ATOM_ID encodes to 0 = no name,
    // so a vertex without an owner is simply not pickable.
    m_trigGpuPrim.setHitName(vj, gfx::encodeHitName((int) m_verts[i].info));
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

bool DirectSurfRenderer::updateGpuColors()
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
