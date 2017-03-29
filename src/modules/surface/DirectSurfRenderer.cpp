// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer
//

#include <common.h>

#include "DirectSurfRenderer.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/Mesh.hpp>

#include <qsys/SceneManager.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>

#include "edtsurf/CommonPara.h"
#include "edtsurf/ProteinSurface.h"

using namespace surface;
using gfx::DisplayContext;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::AtomIterator;

using qsys::ObjectPtr;
using qsys::SceneManager;

DirectSurfRenderer::DirectSurfRenderer()
{
  m_vdwr_H = 1.2;
  m_vdwr_C = 1.7;
  m_vdwr_N = 1.55;
  m_vdwr_O = 1.52;
  m_vdwr_S = 1.8;
  m_vdwr_P = 1.8;
  m_vdwr_X = 1.7;

  m_nMode = DS_MOLFANC;
}

DirectSurfRenderer::~DirectSurfRenderer()
{
  if (m_nTgtMolID!=qlib::invalid_uid) {
    ObjectPtr pObj = SceneManager::getObjectS(m_nTgtMolID);
    if (!pObj.isnull()) {
      pObj->removeListener(this);
    }
    m_nTgtMolID=qlib::invalid_uid;
  }
}

const char *DirectSurfRenderer::getTypeName() const
{
  return "dsurface";
}

void DirectSurfRenderer::invalidateMeshCache()
{
  m_verts.destroy();
  m_faces.destroy();
}

namespace {
  int getRadiusIndex(MolAtomPtr pAtom)
  {
  switch (pAtom->getElement()) {
  case molstr::ElemSym::H:
    return 0;

  case molstr::ElemSym::C:
    return 1;

  case molstr::ElemSym::N:
    return 2;
    
  case molstr::ElemSym::O:
    return 3;
    
  case molstr::ElemSym::S:
    return 4;
    
  case molstr::ElemSym::P:
    return 5;
    
  default:
    return 6;
  }
  }
}

void DirectSurfRenderer::buildMeshCacheEDTSurf()
{
  MolCoordPtr pmol = getClientMol();

  AtomIterator aiter(pmol, getSelection());
  int i, natoms=0;

  // count atom number
  for (aiter.first(); aiter.hasMore(); aiter.next()) {
    MolAtomPtr pAtom = aiter.get();
    MB_ASSERT(!pAtom.isnull());
    ++natoms;
  }
  if (natoms==0) {
    // no atoms to be rendered
    return;
  }

  edtsurf::ProteinSurface pps;

  pps.rasrad[0] = m_vdwr_H;
  pps.rasrad[1] = m_vdwr_C;
  pps.rasrad[2] = m_vdwr_N;
  pps.rasrad[3] = m_vdwr_O;
  pps.rasrad[4] = m_vdwr_S;
  pps.rasrad[5] = m_vdwr_P;
  pps.rasrad[6] = m_vdwr_X;

  pps.proberadius = m_probeRadius;
  pps.fixsf = 1.0 + qlib::trunc<int>(m_nDetail-1, 0, 99)*0.2;

  edtsurf::atom *proseq = new edtsurf::atom[natoms];
  std::vector<int> aidmap(natoms);

  // make atom array
  for (aiter.first(), i=0; aiter.hasMore() && i<natoms; aiter.next()) {
    MolAtomPtr pAtom = aiter.get();
    if (pAtom.isnull()) continue;

    // ATOM/HEATAM (??)
    proseq[i].simpletype = 1;

    // index number (atom index no)
    proseq[i].seqno = i;

    // atom type ID
    proseq[i].detail = getRadiusIndex(pAtom);

    // coordinates
    const Vector4D &pos = pAtom->getPos();
    proseq[i].x = (float) pos.x();
    proseq[i].y = (float) pos.y();
    proseq[i].z = (float) pos.z();
    
    proseq[i].ins = ' ';

    aidmap[i] = pAtom->getID();
    ++i;
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
    //if(inum[0]==1)
    //pps.marchingcubeorigin2(1);
    //  else if(inum[0]==2)
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
    printf("Build triangulated surface\n");
    //if(inum[0]==1)
    //pps.marchingcubeorigin2(3);
    //    else if(inum[0]==2)
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
    //if(inum[0]==1)
    //pps.marchingcubeorigin2(4);
    //    else if(inum[0]==2)
    pps.marchingcube(4);
  }
  else {
    MB_ASSERT(false);
    return;
  }
  
  ///////////////////////

  // pps.checkEuler();
  MB_DPRINTLN("No. vertices %d, No. triangles %d", pps.vertnumber, pps.facenumber);	

  pps.laplaciansmooth(1);
  pps.computenorm();
  MB_DPRINTLN("Output 3D model");
  // pps.checkinoutpropa();
  
  int nverts = pps.vertnumber;
  int nfaces = pps.facenumber;

  m_verts.resize(nverts);
  m_faces.resize(nfaces);

  double sfac = pps.scalefactor;
  Vector4D ptran(pps.ptran.x, pps.ptran.y, pps.ptran.z);
  for (i=0; i<nverts; ++i) {
    int ind = pps.verts[i].atomid;
    int aid = -1;
    if (ind>=0 && ind<aidmap.size()) {
      aid = aidmap[ind];
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

void DirectSurfRenderer::preRender(DisplayContext *pdc)
{
  pdc->setCullFace(m_bCullFace);

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

void DirectSurfRenderer::postRender(DisplayContext *pdc)
{
  // reset to default drawing options
  pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL);
  pdc->setPointSize(1.0);
  pdc->setLineWidth(1.0);
  pdc->setCullFace(true);
  pdc->setLighting(false);

}

void DirectSurfRenderer::render(DisplayContext *pdl)
{
  MolCoordPtr pmol = getClientMol();

  // initialize the coloring scheme
  getColSchm()->start(pmol, this);
  pmol->getColSchm()->start(pmol, this);

  int i, j;
  int nverts = m_verts.size();
  int nfaces = m_faces.size();

  if (nverts==0||nfaces==0) {
    buildMeshCacheEDTSurf();
    nverts = m_verts.size();
    nfaces = m_faces.size();
  }

  gfx::Mesh mesh;

  mesh.init(nverts, nfaces);

  std::vector<int> vidmap(nverts);

  mesh.color(getDefaultColor());

  for (i=0, j=0; i<nverts; ++i) {
    vidmap[i] = j;
    int ind = m_verts[i].info;
    if (ind>=0) {
      MolAtomPtr pAtom = pmol->getAtom(ind);

      if (!m_pShowSel->isEmpty() &&
          !m_pShowSel->isSelected(pAtom)) {
        vidmap[i] = -1;
        continue;
      }
      
      if (!pAtom.isnull()) {
        gfx::ColorPtr pcol = ColSchmHolder::getColor(pAtom);
        mesh.color(pcol);
      }

    }
    mesh.normal(m_verts[i].n3d());
    mesh.setVertex(j, m_verts[i].v3d());
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

void DirectSurfRenderer::propChanged(qlib::LPropEvent &ev)
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
MolCoordPtr DirectSurfRenderer::resolveMolIDImpl(const LString &name)
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

  MB_DPRINTLN("DirectSurfRend.resolveMolID> resolved (%s), OK.", name.c_str());
  return pMol;
}

void DirectSurfRenderer::setTgtObjName(const LString &name)
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
    // TO DO: throw exception??
    LOG_DPRINTLN("MolSurfRend> \"%s\" is not a MolCoord object.", name.c_str());
    return;
  }

  invalidateDisplayCache();
}

LString DirectSurfRenderer::getTgtObjName() const
{
  if (m_nTgtMolID==qlib::invalid_uid)
    return LString();
  ObjectPtr pObj = SceneManager::getObjectS(m_nTgtMolID);
  if (pObj.isnull())
    return LString();
  return pObj->getName();
}

void DirectSurfRenderer::objectChanged(qsys::ObjectEvent &ev)
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

void DirectSurfRenderer::sceneChanged(qsys::SceneEvent &ev)
{
  if (ev.getType()==qsys::SceneEvent::SCE_SCENE_ONLOADED) {
    // resolve target mol name, if required
    if (!m_sTgtMolName.isEmpty())
      resolveMolIDImpl(m_sTgtMolName);
  }
  else if (ev.getType()==qsys::SceneEvent::SCE_OBJ_ADDED &&
	   ev.getTarget()==getClientObjID()) {
    MB_DPRINTLN("MolSurfRend.sceneChanged> This rend(obj) is loaded to the scene!!");
    // resolve target mol name, if required
    if (!m_sTgtMolName.isEmpty())
      resolveMolIDImpl(m_sTgtMolName);
  }
  else if (ev.getType()==qsys::SceneEvent::SCE_REND_ADDED &&
	   ev.getTarget()==getUID()) {
    MB_DPRINTLN("MolSurfRend.sceneChanged> This rend is loaded to the scene!!");
    // resolve target mol name, if required
    if (!m_sTgtMolName.isEmpty())
      resolveMolIDImpl(m_sTgtMolName);
  }

  super_t::sceneChanged(ev);
}

