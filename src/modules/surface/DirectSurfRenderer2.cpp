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
#include <gfx/Mesh.hpp>
#include <gfx/GradientColor.hpp>

#include <qsys/SceneManager.hpp>
#include <qsys/ScalarObject.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>

using namespace surface;
using gfx::DisplayContext;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::AtomIterator;

using qsys::ObjectPtr;
using qsys::SceneManager;

DirectSurfRenderer2::DirectSurfRenderer2()
{
  m_nTgtMolID = qlib::invalid_uid;  // the destructor unregisters by this ID
  m_vdwr_H = 1.2;
  m_vdwr_C = 1.7;
  m_vdwr_N = 1.55;
  m_vdwr_O = 1.52;
  m_vdwr_S = 1.8;
  m_vdwr_P = 1.8;
  m_vdwr_X = 1.7;

  m_nMode = DS_MOLFANC;
  m_dRampVal = 1.4;

  m_bCheckShaderOK = false;
  m_bUseShader = false;
  m_bColorDirty = false;
}

DirectSurfRenderer2::~DirectSurfRenderer2()
{
  if (m_nTgtMolID!=qlib::invalid_uid) {
    ObjectPtr pObj = SceneManager::getObjectS(m_nTgtMolID);
    if (!pObj.isnull()) {
      pObj->removeListener(this);
    }
    m_nTgtMolID=qlib::invalid_uid;
  }
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
  m_verts.destroy();
  m_faces.destroy();
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
  if (pdc->isFile() || m_nDrawMode!=SFDRAW_FILL) {
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
  MolCoordPtr pmol = getClientMol();
  const int nverts = m_verts.size();
  vidmap.resize(nverts);
  vcol.resize(nverts);

  const qlib::uid_t nSceneID = getSceneID();

  // initialize the coloring scheme
  getColSchm()->start(pmol, this);
  pmol->getColSchm()->start(pmol, this);

  // potential coloring mode: resolve scalar object (same as render())
  qsys::ScalarObject *pScaObj = NULL;
  if (m_nMode==DS_SCAPOT) {
    if (!m_sTgtElePot.isEmpty()) {
      qsys::ObjectPtr pobj = ensureNotNull(getScene())->getObjectByName(m_sTgtElePot);
      pScaObj = dynamic_cast<qsys::ScalarObject*>(pobj.get());
    }
    if (pScaObj==NULL)
      LOG_DPRINTLN("MolSurfRend> \"%s\" is not a scalar object.", m_sTgtElePot.c_str());
  }

  // Decide shown vertices (showsel mask), assign compact indices and resolve
  // per-vertex device colors. Same logic/order as render().
  gfx::ColorPtr pcol = getDefaultColor();
  quint32 curDev = pcol->getDevCode(nSceneID);

  int j = 0;
  for (int i=0; i<nverts; ++i) {
    MolAtomPtr pAtom;
    int ind = m_verts[i].info;
    if (ind>=0) {
      pAtom = pmol->getAtom(ind);
      if (!m_pShowSel->isEmpty() &&
          !m_pShowSel->isSelected(pAtom)) {
        vidmap[i] = -1;
        continue; // not shown
      }
    }

    if (m_nMode==DS_MOLFANC) {
      if (!pAtom.isnull()) {
        pcol = ColSchmHolder::getColor(pAtom);
        curDev = pcol->getDevCode(nSceneID);
      }
    }
    else if (m_nMode==DS_SCAPOT) {
      bool res=false;
      if (pScaObj!=NULL) {
        Vector4D pos = m_verts[i].v3d();
        Vector4D norm = m_verts[i].n3d();
        if (m_bRampAbove)
          res = getColorSca(pScaObj, pos + norm.scale(m_dRampVal), pcol);
        else
          res = getColorSca(pScaObj, pos, pcol);
      }
      if (res)
        curDev = pcol->getDevCode(nSceneID);
    }

    vidmap[i] = j;
    vcol[i] = curDev;
    ++j;
  }

  // finalize the coloring scheme
  getColSchm()->end();
  pmol->getColSchm()->end();

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

void DirectSurfRenderer2::preRender(DisplayContext *pdc)
{
  if (getEdgeLineType()==gfx::DisplayContext::ELT_NONE) {
    pdc->setCullFace(m_bCullFace);
  }
  else {
    // edge/silhouette line is ON --> always cull backface
    pdc->setCullFace(true);
  }

  if (m_nDrawMode==SFDRAW_POINT) {
    pdc->setLighting(false);
    pdc->setPolygonMode(gfx::DisplayContext::POLY_POINT);
    pdc->setPointSize(m_lw);
  }
  else if (m_nDrawMode==SFDRAW_LINE) {
    pdc->setLighting(false);
    pdc->setPolygonMode(gfx::DisplayContext::POLY_LINE);
    pdc->setLineWidth(m_lw);
  }
  else {
    pdc->setLighting(true);
    pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL);
  }
}

void DirectSurfRenderer2::postRender(DisplayContext *pdc)
{
  // reset to default drawing options
  pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL);
  pdc->setPointSize(1.0);
  pdc->setLineWidth(1.0);
  pdc->setCullFace(true);
  pdc->setLighting(false);
}

void DirectSurfRenderer2::render(DisplayContext *pdl)
{
  MolCoordPtr pmol = getClientMol();

  // initialize the coloring scheme
  getColSchm()->start(pmol, this);
  pmol->getColSchm()->start(pmol, this);

  int i, j;
  int nverts = m_verts.size();
  int nfaces = m_faces.size();

  if (nverts==0||nfaces==0) {
    buildMeshCache();
    nverts = m_verts.size();
    nfaces = m_faces.size();
  }

  gfx::Mesh mesh;

  mesh.init(nverts, nfaces);

  std::vector<int> vidmap(nverts);

  mesh.color(getDefaultColor());

  // setup
  qsys::ScalarObject *pScaObj = NULL;
  if (m_nMode==DS_MOLFANC) {
  }
  else if (m_nMode==DS_SCAPOT) {
    // ELEPOT mode --> resolve target name
    qsys::ObjectPtr pobj;
    if (!m_sTgtElePot.isEmpty()) {
      pobj = ensureNotNull(getScene())->getObjectByName(m_sTgtElePot);
      pScaObj = dynamic_cast<qsys::ScalarObject*>(pobj.get());
    }

    if (pScaObj==NULL) {
      LOG_DPRINTLN("MolSurfRend> \"%s\" is not a scalar object.", m_sTgtElePot.c_str());
    }
  }

  // setup vertex/normal/color
  gfx::ColorPtr pcol;
  for (i=0, j=0; i<nverts; ++i) {
    vidmap[i] = j;

    Vector4D pos = m_verts[i].v3d();
    Vector4D norm = m_verts[i].n3d();

    MolAtomPtr pAtom;
    int ind = m_verts[i].info;
    if (ind>=0) {
      pAtom = pmol->getAtom(ind);
      if (!m_pShowSel->isEmpty() &&
          !m_pShowSel->isSelected(pAtom)) {
        vidmap[i] = -1;
        continue; // not shown --> skip coloring
      }
    }

    if (m_nMode==DS_MOLFANC) {
      if (!pAtom.isnull()) {
        pcol = ColSchmHolder::getColor(pAtom);
        mesh.color(pcol);
      }
    }
    else if (m_nMode==DS_SCAPOT) {
      bool res=false;
      if (pScaObj!=NULL) {
        if (m_bRampAbove)
          res = getColorSca(pScaObj, pos + norm.scale(m_dRampVal), pcol);
        else
          res = getColorSca(pScaObj, pos, pcol);
      }
      if (res)
        mesh.color(pcol);
    }

    mesh.normal(norm);
    mesh.setVertex(j, pos);
    ++j;
  }

  int nvlast = j;
  int id[3];

  for (i=0, j=0; i<nfaces; ++i) {
    id[0] = vidmap[m_faces[i].id1];
    id[1] = vidmap[m_faces[i].id2];
    id[2] = vidmap[m_faces[i].id3];

    if (id[0]<0||id[0]>nvlast||
        id[1]<0||id[1]>nvlast||
        id[2]<0||id[2]>nvlast) {
      continue;
    }

    mesh.setFace(j, id[0], id[1], id[2]);
    ++j;
  }
  int nflast = j;

  if (nvlast<nverts || nflast<nfaces)
    mesh.reduce(nvlast, nflast);

  // draw it!!
  pdl->drawMesh(mesh);

  // finalize the coloring scheme
  getColSchm()->end();
  pmol->getColSchm()->end();
}

void DirectSurfRenderer2::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("sel")) {
    invalidateDisplayCache();
    invalidateMeshCache();
  }
  else if (ev.getName().startsWith("vdwr_")) {
    invalidateDisplayCache();
    invalidateMeshCache();
  }

  super_t::propChanged(ev);
}

/// Resolve mol name, set m_nTgtMolID, listen the MolCoord events, and returns MolCoord object
MolCoordPtr DirectSurfRenderer2::resolveMolIDImpl(const LString &name)
{
  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull())
    return MolCoordPtr();

  qsys::ObjectPtr pobj = pScene->getObjectByName(name);
  MolCoordPtr pMol= MolCoordPtr(pobj, qlib::no_throw_tag());
  if (pMol.isnull()) {
    return pMol;
  }

  m_nTgtMolID = pMol->getUID();

  // event handling: attach to the new object
  pMol->addListener(this);

  MB_DPRINTLN("DirectSurfRend2.resolveMolID> resolved (%s), OK.", name.c_str());
  return pMol;
}

void DirectSurfRenderer2::setTgtObjName(const LString &name)
{
  // detach from oldobj
  if (m_nTgtMolID!=qlib::invalid_uid) {
    ObjectPtr pObj = SceneManager::getObjectS(m_nTgtMolID);
    if (!pObj.isnull()) {
      pObj->removeListener(this);
    }
    m_nTgtMolID = qlib::invalid_uid;
  }

  // get object by name
  if (name.isEmpty())
    return;

  m_sTgtMolName = name;

  if (getScene().isnull())
    return; // Scene is not loaded (when called in the scene-file loading)

  MolCoordPtr pMol = resolveMolIDImpl(name);
  if (pMol.isnull()) {
    LOG_DPRINTLN("MolSurfRend> \"%s\" is not a MolCoord object.", name.c_str());
    return;
  }

  invalidateDisplayCache();
}

LString DirectSurfRenderer2::getTgtObjName() const
{
  if (m_nTgtMolID==qlib::invalid_uid)
    return LString();
  ObjectPtr pObj = SceneManager::getObjectS(m_nTgtMolID);
  if (pObj.isnull())
    return LString();
  return pObj->getName();
}

void DirectSurfRenderer2::objectChanged(qsys::ObjectEvent &ev)
{
  if (m_nMode==DS_MOLFANC &&
      ev.getType()==qsys::ObjectEvent::OBE_PROPCHG) {
    qlib::LPropEvent *pPE = ev.getPropEvent();
    if (pPE) {
      if (pPE->getName().equals("defaultcolor")||
          pPE->getName().equals("coloring")||
          pPE->getParentName().equals("coloring")||
          pPE->getParentName().startsWith("coloring.")) {
        invalidateDisplayCache();
      }
    }
  }

  super_t::objectChanged(ev);
}

void DirectSurfRenderer2::sceneChanged(qsys::SceneEvent &ev)
{
  if (ev.getType()==qsys::SceneEvent::SCE_SCENE_ONLOADED) {
    if (!m_sTgtMolName.isEmpty())
      resolveMolIDImpl(m_sTgtMolName);
  }
  else if (ev.getType()==qsys::SceneEvent::SCE_OBJ_ADDED &&
	   ev.getTarget()==getClientObjID()) {
    if (!m_sTgtMolName.isEmpty())
      resolveMolIDImpl(m_sTgtMolName);
  }
  else if (ev.getType()==qsys::SceneEvent::SCE_REND_ADDED &&
	   ev.getTarget()==getUID()) {
    if (!m_sTgtMolName.isEmpty())
      resolveMolIDImpl(m_sTgtMolName);
  }

  super_t::sceneChanged(ev);
}

bool DirectSurfRenderer2::getColorSca(qsys::ScalarObject *pScaObj, const Vector4D &v, ColorPtr &rcol)
{
  double par = pScaObj->getValueAt(v);

  if (par<m_dParLow) {
    rcol = m_colLow;
  }
  else if (par>m_dParHigh) {
    rcol = m_colHigh;
  }
  else if (par>m_dParMid) {
    // high<-->mid
    double ratio;
    if (qlib::Util::isNear(m_dParHigh, m_dParMid))
      ratio = 1.0;
    else
      ratio = (par-m_dParMid)/(m_dParHigh-m_dParMid);

    rcol = ColorPtr(new gfx::GradientColor(m_colHigh, m_colMid, ratio));
  }
  else {
    // mid<-->low
    double ratio;
    if (qlib::Util::isNear(m_dParMid, m_dParLow))
      ratio = 1.0;
    else
      ratio = (par-m_dParLow)/(m_dParMid-m_dParLow);

    rcol = ColorPtr(new gfx::GradientColor(m_colMid, m_colLow, ratio));
  }

  return true;
}
