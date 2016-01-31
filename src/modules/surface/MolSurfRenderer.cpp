// -*-Mode: C++;-*-
//
//  molecular surface renderer
//
// $Id: MolSurfRenderer.cpp,v 1.12 2011/04/02 07:57:34 rishitani Exp $

#include <common.h>

#include "MolSurfRenderer.hpp"

#include <gfx/Mesh.hpp>
#include <gfx/DisplayContext.hpp>
#include <gfx/GradientColor.hpp>
#include <qsys/ScalarObject.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <modules/molstr/AtomPosMap.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/MolCoord.hpp>

//#include <gfx/DisplayList.hpp>
//#include <mbsys/QsysModule.hpp>
//#include <molstr/MolCoord.hpp>

using namespace surface;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using qsys::ObjectPtr;
using qsys::SceneManager;

/// default constructor
MolSurfRenderer::MolSurfRenderer()
{
  m_pSurf = NULL;
  m_pAmap = NULL;
  m_nDrawMode = SFDRAW_FILL;
  m_nMode = SFREND_SIMPLE;
  m_lw = 1.2;

  m_nTgtMolID = qlib::invalid_uid;
}

/// destructor
MolSurfRenderer::~MolSurfRenderer()
{
  if (m_pAmap!=NULL) delete m_pAmap;
  if (m_nTgtMolID!=qlib::invalid_uid) {
    ObjectPtr pObj = SceneManager::getObjectS(m_nTgtMolID);
    if (!pObj.isnull()) {
      pObj->removeListener(this);
    }
    m_nTgtMolID=qlib::invalid_uid;
  }
}

///////////////////////////////////////////

const char *MolSurfRenderer::getTypeName() const
{
  return "molsurf";
}

LString MolSurfRenderer::toString() const
{
  return LString("molsurf");
}

bool MolSurfRenderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  MolSurfObj *ptest = dynamic_cast<MolSurfObj *>(pobj.get());
  return ptest!=NULL;
}

///////////////////////////////////////////////

bool MolSurfRenderer::getColorMol(const Vector4D &v, ColorPtr &rcol)
{
  //double par;

  if (m_pMol.isnull())
    return false;
  if (m_pAmap==NULL)
    return false;

  //Vector4D pos(x, y, z);
  int aid = m_pAmap->searchNearestAtom(v);
  if (aid<0) {
    MB_DPRINTLN("nearest atom is not found at (%f,%f,%f)", v.x(), v.y(), v.z());
    return false;
  }

  MolAtomPtr pa = m_pMol->getAtom(aid);
  rcol = molstr::ColSchmHolder::getColor(pa);

  return true;
  //pdl->color(col);
}

bool MolSurfRenderer::isShowVert(const Vector4D &v) const
{
  if (m_pShowSel->isEmpty())
    return true;
  if (m_pMol.isnull())
    return true;
  if (m_pAmap==NULL)
    return true;

  int aid = m_pAmap->searchNearestAtom(v);
  if (aid<0) {
    MB_DPRINTLN("nearest atom is not found at (%f,%f,%f)", v.x(), v.y(), v.z());
    return true;
  }

  MolAtomPtr pa = m_pMol->getAtom(aid);
  if (m_pShowSel->isSelected(pa))
    return true;

  return false;
}

bool MolSurfRenderer::getColorSca(const Vector4D &v, ColorPtr &rcol)
{
  if (m_pScaObj==NULL)
    return false;

  double par = m_pScaObj->getValueAt(v);

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
    // rcol = LColor(m_colHigh, m_colMid, ratio);
  }
  else {
    // mid<-->low
    double ratio;
    if (qlib::Util::isNear(m_dParMid, m_dParLow))
      ratio = 1.0;
    else
      ratio = (par-m_dParLow)/(m_dParMid-m_dParLow);

    rcol = ColorPtr(new gfx::GradientColor(m_colMid, m_colLow, ratio));
    // rcol = LColor(m_colMid, m_colLow, ratio);
  }

  return true;
}

void MolSurfRenderer::preRender(DisplayContext *pdc)
{
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
  
  if (!m_bCullFace)
    pdc->setCullFace(false);

}

void MolSurfRenderer::postRender(DisplayContext *pdc)
{
  // reset to default drawing options
  pdc->setPolygonMode(gfx::DisplayContext::POLY_FILL);
  pdc->setPointSize(1.0);
  pdc->setLineWidth(1.0);
  pdc->setCullFace(true);
  pdc->setLighting(false);
}

void MolSurfRenderer::render(DisplayContext *pdl)
{
  MolSurfObj *pSurf = dynamic_cast<MolSurfObj *>(getClientObj().get());
  if (pSurf==NULL) {
    LOG_DPRINTLN("MolSurfRenerer> ERROR: client is null or not molsurf");
    return;
  }

  gfx::Mesh mesh;
  //mesh.setDefaultAlpha(getDefaultAlpha());

  ColorPtr col;
  int i, j, nfsiz = pSurf->getFaceSize();
  int nvsiz = pSurf->getVertSize();
  
  mesh.init(nvsiz, nfsiz);

  // pdl->sphere(10.0, getCenter());

  // check and get the associated molecule obj
  // and position to atom mapping
  if (m_nTgtMolID!=qlib::invalid_uid) {
    qsys::ObjectPtr pobj = SceneManager::getObjectS(m_nTgtMolID);
    m_pMol = MolCoordPtr(pobj, qlib::no_throw_tag());
    if (!m_pMol.isnull()) {
      // TO DO: re-generate atom-map only when Mol is changed.
      // (this impl always updates atommap when the renderer is invalidated.)
      makeAtomPosMap();
    }
  }

  mesh.color(getDefaultColor());
  if (m_nMode==SFREND_SIMPLE) {
  }
  else if (m_nMode==SFREND_SCAPOT) {
    //
    // ELEPOT mode --> resolve target name
    //
    qsys::ObjectPtr pobj;
    m_pScaObj = NULL;
    if (!m_sTgtElePot.isEmpty()) {
      pobj = ensureNotNull(getScene())->getObjectByName(m_sTgtElePot);
      m_pScaObj = dynamic_cast<qsys::ScalarObject*>(pobj.get());
    }
    if (m_pScaObj==NULL) {
      // try "target" property (for old version compat)
      if (m_nTgtMolID!=qlib::invalid_uid) {
        //pobj = ensureNotNull(getScene())->getObjectByName(m_sTgtObj);
        pobj = SceneManager::getObjectS(m_nTgtMolID);
        m_pScaObj = dynamic_cast<qsys::ScalarObject*>(pobj.get());
      }
    }
    
    if (m_pScaObj==NULL) {
      LOG_DPRINTLN("MolSurfRend> \"%s\" is not a scalar object.", m_sTgtElePot.c_str());
    }
  }
  else if (m_nMode==SFREND_MOLFANC) {
    //
    // MOLFANC mode
    //
    if (!m_pMol.isnull()) {
      // initialize the coloring scheme (with the target mol, but not surface obj)
      molstr::ColoringSchemePtr pCS = getColSchm();
      if (!pCS.isnull())
        pCS->start(m_pMol, this);
    }
    else {
      LOG_DPRINTLN("MolSurfRend> object \"%d\" is not found.", m_nTgtMolID);
    }
  }
  

  ////////////////////////////////////////////

  std::vector<int> idmap(nvsiz);

  // setup verteces
  for (i=0, j=0; i<nvsiz; i++) {
    idmap[i] = j;
    MSVert v = pSurf->getVertAt(i);
    Vector4D pos = v.v3d();
    Vector4D norm = v.n3d();

    // check pos-atom map
    if (!m_pMol.isnull()) {
      if (!isShowVert(pos)) {
        // skip hidden vertex by mol selection
        idmap[i] = -1;
        continue;
      }
    }

    if (m_nMode==SFREND_SCAPOT) {
      bool res;
      if (m_bRampAbove) {
        res = getColorSca(pos + norm.scale(1.4), col);
      }
      else {
        res = getColorSca(pos, col);
      }
      if (res) {
        mesh.color(col);
      }
    }
    else if (m_nMode==SFREND_MOLFANC) {
      if (getColorMol(pos, col))
        mesh.color(col);
    }
#ifdef USE_VERT_TYPE_ID
    else {
      switch (v.ntype) {
      case MolSurf::FTID_DBG1:
        mesh.color(LColor(0.0f, 0.0f, 1.0f));
        break;
      case MolSurf::FTID_DBG2:
        mesh.color(LColor(0.0f, 1.0f, 0.0f));
        break;
      case MolSurf::FTID_DBG3:
        mesh.color(LColor(0.0f, 1.0f, 1.0f));
        break;
      case MolSurf::FTID_DBG4:
        mesh.color(LColor(1.0f, 0.0f, 0.0f));
        break;
      case MolSurf::FTID_DBG5:
        mesh.color(LColor(1.0f, 0.0f, 1.0f));
        break;
      case MolSurf::FTID_DBG6:
        mesh.color(LColor(1.0f, 1.0f, 0.0f));
        break;
      case MolSurf::FTID_DBG7:
        mesh.color(LColor(1.0f, 1.0f, 1.0f));
        break;
      }
    }
#endif
    
    mesh.normal(norm);
    mesh.setVertex(j, pos);
    ++j;
  }
  int nvlast = j;

  // setup faces
  int id[3];
  for (i=0,j=0; i<nfsiz; i++) {
    id[0] = idmap[(pSurf->getFaceAt(i)).id1];
    id[1] = idmap[(pSurf->getFaceAt(i)).id2];
    id[2] = idmap[(pSurf->getFaceAt(i)).id3];

    if (id[0]<0||id[0]>nvlast||
        id[1]<0||id[1]>nvlast||
        id[2]<0||id[2]>nvlast) {
      //LOG_DPRINTLN("MSurfRend> invalid face index %d,%d,%d", id[0], id[1], id[2]);
      //break;
      continue;
    }

    mesh.setFace(j, id[0], id[1], id[2]);
    ++j;
  }
  int nflast = j;

  if (nvlast<nvsiz || nflast<nfsiz)
    mesh.reduce(nvlast, nflast);

  // do it!!
  pdl->drawMesh(mesh);

  // cleanup

  if (m_nMode==SFREND_MOLFANC && !m_pMol.isnull()) {
    // finalize the coloring scheme
    molstr::ColoringSchemePtr pCS = getColSchm();
    if (!pCS.isnull())
      pCS->end();
  }

  if (m_pAmap!=NULL) {
    delete m_pAmap;
    m_pAmap=NULL;
  }
  m_pMol = MolCoordPtr();
  m_pScaObj = NULL;

}

Vector4D MolSurfRenderer::getCenter() const
{
  Vector4D pos, p;
  MSVert v;
  int i, n=0;

  MolSurfObj *pSurf = dynamic_cast<MolSurfObj *>(getClientObj().get());
  if (pSurf==NULL) {
    LOG_DPRINTLN("MolSurfRenerer> ERROR: client is null or not molsurf");
    return Vector4D();
  }
  int nvert = pSurf->getVertSize();
  int nskip = qlib::max<int>(1, nvert/1000-1);

  if (!m_pMol.isnull() && !m_pShowSel->isEmpty()) {
    nskip = 1;
  }

  for (i=0; i<nvert; i+=nskip) {
    v = pSurf->getVertAt(i);
    p = v.v3d();
    if (m_pAmap!=NULL) {
      if (!isShowVert(pos)) {
        // skip hidden verteces by molsel
        continue;
      }
    }
    pos += p;
    n++;
  }

  if (n==0) {
    // TO DO: throw exception
    LOG_DPRINT("Renderer> cannot determine the center for ");
    LOG_DPRINTLN("%s:%s",
                 (pSurf->getName()).c_str(),
                 getName().c_str());
    return Vector4D();
  }

  pos = pos.divide(double(n));
  return pos;
}

bool MolSurfRenderer::hasCenter() const
{
  MolSurfObj *pSurf = dynamic_cast<MolSurfObj *>(getClientObj().get());
  if (pSurf==NULL) {
    return false;
  }
  int nvert = pSurf->getVertSize();
  if (nvert==0)
    return false;

  return true;
}

void MolSurfRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("coloring")||
      ev.getParentName().equals("coloring")||
      ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }
  else if (ev.getName().equals("target") ||
           ev.getName().equals("defaultcolor") ||
           ev.getName().equals("colormode")) {
    invalidateDisplayCache();
  }
  else if (ev.getName().equals("cullface")||
           ev.getName().equals("wireframe")||
           ev.getName().equals("dot")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);

}

void MolSurfRenderer::makeAtomPosMap()
{
  if (!m_pMol.isnull()) {
    if (m_pAmap!=NULL) delete m_pAmap;
    m_pAmap = MB_NEW AtomPosMap();
    m_pAmap->setTarget(m_pMol);
    m_pAmap->setSpacing(3.5);
    m_pAmap->generate(m_pMolSel);
  }
}

/// Resolve mol name, set m_nTgtMolID, listen the MolCoord events, and returns MolCoord object
MolCoordPtr MolSurfRenderer::resolveMolIDImpl(const LString &name)
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

  MB_DPRINTLN("MolSurfRend.resolveMolID> resolved (%s), OK.", name.c_str());
  return pMol;
}

void MolSurfRenderer::setTgtObjName(const LString &name)
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

LString MolSurfRenderer::getTgtObjName() const
{
  if (m_nTgtMolID==qlib::invalid_uid)
    return LString();
  ObjectPtr pObj = SceneManager::getObjectS(m_nTgtMolID);
  if (pObj.isnull())
    return LString();
  return pObj->getName();
}

void MolSurfRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (m_nMode==SFREND_MOLFANC &&
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

void MolSurfRenderer::sceneChanged(qsys::SceneEvent &ev)
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
