// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer: shared base of dsurface and dsurf2
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
    // initialize the coloring scheme
    getColSchm()->start(env.pMol, this);
    env.pMol->getColSchm()->start(env.pMol, this);
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
  if (!env.pMol.isnull()) {
    // finalize the coloring scheme
    getColSchm()->end();
    env.pMol->getColSchm()->end();
  }
}

bool DirectSurfRendererBase::isVertexShown(const VertexColorEnv &env, const MSVert &v,
                                           MolAtomPtr &pAtom) const
{
  pAtom = MolAtomPtr();
  if (v.info<0 || env.pMol.isnull())
    return true;

  pAtom = env.pMol->getAtom(v.info);
  if (!m_pShowSel.isnull() &&
      !m_pShowSel->isEmpty() &&
      !m_pShowSel->isSelected(pAtom))
    return false;

  return true;
}

bool DirectSurfRendererBase::resolveVertexColor(VertexColorEnv &env, const MSVert &v,
                                                const MolAtomPtr &pAtom, ColorPtr &rcol)
{
  if (m_nMode==DS_MOLFANC) {
    if (pAtom.isnull())
      return false;
    rcol = ColSchmHolder::getColor(pAtom);
    return !rcol.isnull();
  }

  if (env.scaMode!=SCM_NONE)
    return getScalarColor(env.pSca, v.v3d(), v.n3d(), env.scaMode, rcol);

  return false;
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

    MolAtomPtr pAtom;
    if (!isVertexShown(env, v, pAtom)) {
      vidmap[i] = -1;
      continue; // not shown --> skip
    }
    vidmap[i] = j;

    mesh.color(resolveVertexColor(env, v, pAtom, pcol) ? pcol : defcol);
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

  super_t::propChanged(ev);
}
