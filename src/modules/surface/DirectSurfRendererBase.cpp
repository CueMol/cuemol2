// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer: scriptable base of dsurface
//

#include <common.h>

#include "DirectSurfRendererBase.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/Mesh.hpp>
#include <qsys/ScalarObject.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/SelCommand.hpp>

#include <vector>

using namespace surface;
using gfx::DisplayContext;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;

DirectSurfRendererBase::DirectSurfRendererBase()
{
  m_nMode = DS_MOLFANC;
  m_bCullFace = false;
  m_probeRadius = 1.4;
  m_nDetail = 6;
  m_nSurfType = DS_SES;
  m_nDrawMode = SFDRAW_FILL;
  m_lw = 1.2;
  m_pShowSel = SelectionPtr(MB_NEW molstr::SelCommand());

  m_vdwr_H = 1.2;
  m_vdwr_C = 1.7;
  m_vdwr_N = 1.55;
  m_vdwr_O = 1.52;
  m_vdwr_S = 1.8;
  m_vdwr_P = 1.8;
  m_vdwr_X = 1.7;

  // multi_grad is a nested property; its changes reach propChanged() with
  // parent name "multi_grad" only after this registration.
  super_t::setupParentData("multi_grad");
}

DirectSurfRendererBase::~DirectSurfRendererBase()
{
}

void DirectSurfRendererBase::invalidateMeshCache()
{
  m_verts.destroy();
  m_faces.destroy();
}

void DirectSurfRendererBase::ensureMeshCache()
{
  if (m_verts.size()==0 || m_faces.size()==0)
    buildMeshCache();
}

void DirectSurfRendererBase::onShowSelChanged()
{
  invalidateDisplayCache();
}

void DirectSurfRendererBase::scalarColorPropChanged()
{
  if (isScalarColorMode())
    invalidateDisplayCache();
}

qsys::ObjectPtr DirectSurfRendererBase::getColorMapObj() const
{
  return getColorMapObjImpl(getScene());
}

void DirectSurfRendererBase::preRender(DisplayContext *pdc)
{
  if (getEdgeLineType()==gfx::DisplayContext::ELT_NONE) {
    pdc->setCullFace(m_bCullFace);
  }
  else {
    // edge/silhouette line is ON --> always don't draw backface (cull backface=true)
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

void DirectSurfRendererBase::postRender(DisplayContext *pdc)
{
  // reset to default drawing options
  pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL);
  pdc->setPointSize(1.0);
  pdc->setLineWidth(1.0);
  pdc->setCullFace(true);
  pdc->setLighting(false);
}

///////////////////////////////////////////
// per-vertex colour resolution

void DirectSurfRendererBase::beginVertexColors(VertexColorEnv &env)
{
  env.pMol = getClientMol();
  if (!env.pMol.isnull()) {
    startColoring(env.pMol, this);
    env.pAtoms.reset(new molstr::AtomColorMemo(env.pMol, this, m_pShowSel, getSceneID(),
                                               m_nMode==DS_MOLFANC));
  }

  env.scaMode = scaMode();
  env.pSca = resolveScalarObj(getScene(), env.scaMode);
  if (env.scaMode!=SCM_NONE && env.pSca==NULL) {
    LOG_DPRINTLN("DirectSurfRend> \"%s\" is not a scalar object.",
                 getScalarTargetName(env.scaMode).c_str());
  }
}

void DirectSurfRendererBase::endVertexColors(VertexColorEnv &env)
{
  if (!env.pMol.isnull())
    endColoring(env.pMol);
}

bool DirectSurfRendererBase::isVertexShown(VertexColorEnv &env, const MSVert &v) const
{
  // A vertex whose owning atom the mesh builder could not name (NO_ATOM_ID,
  // which reads as -1) is drawn and painted defaultcolor.
  if (!env.pAtoms)
    return true;
  return env.pAtoms->get((int) v.info).bShown;
}

bool DirectSurfRendererBase::resolveVertexColor(VertexColorEnv &env, const MSVert &v,
                                                ColorPtr &rcol)
{
  if (m_nMode==DS_MOLFANC) {
    if (!env.pAtoms)
      return false;
    const molstr::AtomColorMemo::Entry &e = env.pAtoms->get((int) v.info);
    if (!e.bAtom)
      return false;
    rcol = e.pCol;
    return !rcol.isnull();
  }

  if (env.scaMode!=SCM_NONE)
    return getScalarColor(env.pSca, v.v3d(), v.n3d(), env.scaMode, rcol);

  return false;
}

bool DirectSurfRendererBase::resolveShownDevCode(VertexColorEnv &env, const MSVert &v,
                                                 quint32 defDev, quint32 &rdev)
{
  rdev = defDev;
  if (env.pAtoms) {
    const molstr::AtomColorMemo::Entry &e = env.pAtoms->get((int) v.info);
    if (!e.bShown)
      return false;
    if (m_nMode==DS_MOLFANC) {
      if (e.bAtom && !e.pCol.isnull())
        rdev = e.nDevCode;
      return true;
    }
  }
  else if (m_nMode==DS_MOLFANC) {
    return true;
  }

  ColorPtr pcol;
  if (env.scaMode!=SCM_NONE &&
      getScalarColor(env.pSca, v.v3d(), v.n3d(), env.scaMode, pcol))
    rdev = pcol->getDevCode(getSceneID());
  return true;
}

///////////////////////////////////////////
// display-list path

void DirectSurfRendererBase::render(DisplayContext *pdl)
{
  ensureMeshCache();
  const int nverts = m_verts.size();
  const int nfaces = m_faces.size();

  gfx::Mesh mesh;
  mesh.init(nverts, nfaces);

  std::vector<int> vidmap(nverts);

  VertexColorEnv env;
  beginVertexColors(env);

  const ColorPtr defcol = getDefaultColor();
  ColorPtr pcol;

  // setup vertex/normal/color
  int i, j;
  for (i=0, j=0; i<nverts; ++i) {
    const MSVert &v = m_verts[i];

    if (!isVertexShown(env, v)) {
      vidmap[i] = -1;
      continue; // not shown --> skip
    }
    vidmap[i] = j;

    mesh.color(resolveVertexColor(env, v, pcol) ? pcol : defcol);
    mesh.normal(v.n3d());
    mesh.setVertex(j, v.v3d());
    ++j;
  }

  endVertexColors(env);

  const int nvlast = j;
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
  const int nflast = j;

  if (nvlast<nverts || nflast<nfaces)
    mesh.reduce(nvlast, nflast);

  // draw it!!
  pdl->drawMesh(mesh);
}

void DirectSurfRendererBase::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("sel") ||
      ev.getName().startsWith("vdwr_")) {
    invalidateDisplayCache();
    invalidateMeshCache();
  }
  else if (ev.getParentName().equals("multi_grad") &&
           m_nMode==DS_MULTIGRAD) {
    // gradient stop edited (nested property): recolour
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}
