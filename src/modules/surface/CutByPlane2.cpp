// -*-Mode: C++;-*-
//
// Cut molecular surface by a plane ver. 2 (using CGAL)
//

#include <common.h>
#include <qsys/ObjectEvent.hpp>
#include "CutByPlane2.hpp"
#include "MolSurfEditInfo.hpp"

#include <qsys/Scene.hpp>
#include <qsys/UndoManager.hpp>

using namespace surface;
using namespace surface::cbp_detail;


//#define SHOW_ID_I 1
//#define SHOW_ID_O 1



void CutByPlane2::fini()
{
  m_verts.clear();
  m_faces.clear();
  m_vinflg.clear();
  m_vidmap.clear();
  //m_edset.clear();
  m_sidmap.clear();
//  m_segrid.clear();
}

/*CutByPlane2::Bndry::~Bndry()
{
  std::for_each(ins.begin(), ins.end(), qlib::delete_ptr<Bndry *>());
}*/

void CutByPlane2::setupConvMat()
{
  Vector4D e1, e2, e3;

  e1 = m_norm;

  e2 = e1.cross(Vector4D(1.0, 0.0, 0.0));
  if (qlib::isNear4(e2.sqlen(), 0.0)) {
    e2 = e1.cross(Vector4D(0.0, 1.0, 0.0));
    if (qlib::isNear4(e2.sqlen(), 0.0)) {
      e2 = e1.cross(Vector4D(0.0, 0.0, 1.0));
    }
  }

  e2 = e2.normalize();

  m_xfm = Matrix3D::makeRotMat(e1, e2);
  m_ixfm = m_xfm;
  m_ixfm = m_ixfm.transpose();
}

///////////////////////////////////////////////////////

void CutByPlane2::doit(double cden, const Vector4D &norm, const Vector4D &pos,
                       bool bBody, bool bSect)
{
  const double dtol = 0.001;

  m_cdiv = qlib::abs(1.0/cden);
  m_norm = norm.normalize();
  m_pos = pos;

  setupConvMat();

  //
  // Mark in/out/on verteces
  //

  int i, j;
  int id[3];

  MSVert *oldvts = (m_pTgt->m_pVerts);
  MSFace *oldfcs = (m_pTgt->m_pFaces);
  int noldvts = m_pTgt->m_nVerts;
  int noldfcs = m_pTgt->m_nFaces;
  
  m_vinflg.resize(noldvts);
  m_vidmap.resize(noldvts);
  for (i=0; i<noldvts; ++i) {
    const Vector4D x(oldvts[i].x, oldvts[i].y, oldvts[i].z);
    const double det = m_norm.dot(x-m_pos);
    if (qlib::abs(det)<dtol) {
      // very nearly equal to zero --> on the plane
      m_vinflg[i] = FLG_ON;
      m_vidmap[i] = addNewVertex(oldvts[i]);
    }
    else if (det<0) {
      // outside of the plane
      m_vinflg[i] = FLG_OUT;
      m_vidmap[i] = -1;
    }
    else {
      // inside of the plane
      m_vinflg[i] = FLG_IN;
      m_vidmap[i] = addNewVertex(oldvts[i]);
    }
  }

  //
  // Rebuild faces using the vertex marks (in/out/on)
  //

  std::set<Edge> edset;
  void *pedset = &edset;

  m_bBody = bBody;

  for (i=0; i<noldfcs; ++i) {
    id[0] = oldfcs[i].id1;
    id[1] = oldfcs[i].id2;
    id[2] = oldfcs[i].id3;

    if (m_vinflg[id[0]]==FLG_IN &&
        m_vinflg[id[1]]==FLG_IN &&
        m_vinflg[id[2]]==FLG_IN) {
      if (bBody)
        addNewFace(m_vidmap[id[0]], m_vidmap[id[1]], m_vidmap[id[2]]);
      continue;
    }

    if (m_vinflg[id[0]]==FLG_OUT &&
        m_vinflg[id[1]]==FLG_OUT &&
        m_vinflg[id[2]]==FLG_OUT) {
      continue;
    }

    if (checkSingle(id, pedset))
      continue;

    if (checkDouble(id, pedset))
      continue;

    if (checkOn1(id, pedset))
      continue;

    if (checkOn2(id, pedset))
      continue;

    LOG_DPRINTLN("CutByPlane2> Fatal Error: "
                 "Face %d is too close to the cutting plane", i);
    return;
  }

  if (!bSect) {
    // section mesh generation is not requested --> exit
    update();
    return;
  }

  //
  // Preprosessing for building the section mesh faces
  //

  m_outers.build(m_sidmap, this);
  m_sidmap.clear();

  BoundarySet::const_iterator iter = m_outers.begin();
  BoundarySet::const_iterator iend = m_outers.end();
  for (; iter!=iend; ++iter) {
    Boundary *pbndry = *iter;
    makeSectionMesh(*pbndry);
  }

  update();
}

void CutByPlane2::update()
{
  int i;
  int nnverts = m_verts.size();
  int nnfaces = m_faces.size();
  MSVert *pNVerts = MB_NEW MSVert[nnverts];
  MSFace *pNFaces = MB_NEW MSFace[nnfaces];

  for (i=0; i<nnverts; ++i)
    pNVerts[i] = m_verts[i];

  for (i=0; i<nnfaces; ++i)
    pNFaces[i] = m_faces[i];

  delete m_pTgt->m_pVerts;
  m_pTgt->m_pVerts = pNVerts;
  m_pTgt->m_nVerts = nnverts;

  delete m_pTgt->m_pFaces;
  m_pTgt->m_pFaces = pNFaces;
  m_pTgt->m_nFaces = nnfaces;
  
/*
  // notify structural change
  MbObjChangedEvent ev;
  ev.setTarget(m_pTgt);
  m_pTgt->fireMbObjEvent(ev);
*/

  // notify update of structure
  {
    qsys::ObjectEvent obe;
    obe.setType(qsys::ObjectEvent::OBE_CHANGED);
    obe.setTarget(m_pTgt->getUID());
    obe.setDescr("structure");
    m_pTgt->fireObjectEvent(obe);
  }
}

int CutByPlane2::checkCutEdge(int id1, int id2, void *pedset)
{
  if (id1>id2) {
    int tmp = id1; 
    id1 = id2;
    id2 = tmp;
  }

  Edge ed(id1, id2);
  
  EdgeSet &edset = *(static_cast<EdgeSet *>(pedset));
  EdgeSet::const_iterator edi = edset.find(ed);
  if (edi!=edset.end())
    return edi->nvid;

  Vector4D vA, nA;
  if (!divideEdge(id1, id2, vA, nA)) {
    MB_DPRINTLN("chkcut: %d,%d failed", id1, id2);
    return -1;
  }

  int idx = addNewVertex(vA, nA);
  ed.nvid = idx;
  edset.insert(ed);
  return idx;
}

bool CutByPlane2::divideEdge(int id1, int id2,
                            Vector4D &rvec, Vector4D &rnorm)
{
  MSVert *oldvts = (m_pTgt->m_pVerts);

  const Vector4D v1(oldvts[id1].x, oldvts[id1].y, oldvts[id1].z);
  const Vector4D v2(oldvts[id2].x, oldvts[id2].y, oldvts[id2].z);

  const double t1 = m_norm.dot(m_pos-v1);
  const double t2 = m_norm.dot(v2-v1);
  if (qlib::isNear4(t2, 0.0))
    return false;

  //////////

  const double t = t1/t2;
  rvec = v2.scale(t) + v1.scale(1.0-t);

  //////////

  const Vector4D n1(oldvts[id1].nx, oldvts[id1].ny, oldvts[id1].nz);
  const Vector4D n2(oldvts[id2].nx, oldvts[id2].ny, oldvts[id2].nz);

  rnorm = n2.scale(t) + n1.scale(1.0-t);
  rnorm = rnorm.normalize();
  return true;
}

bool CutByPlane2::checkSingle(int id[], void *pedset)
{
  int i;

  for (i=0; i<3; ++i) {
    if (m_vinflg[id[i]]==FLG_IN &&
        m_vinflg[id[(i+1)%3]]==FLG_OUT &&
        m_vinflg[id[(i+2)%3]]==FLG_OUT) {

      int nin0 = m_vidmap[id[i]];
      int ed1 = checkCutEdge(id[i], id[(i+2)%3], pedset);
      int ed2 = checkCutEdge(id[i], id[(i+1)%3], pedset);

      if (m_bBody)
        addNewFace(nin0, ed2, ed1);

      m_sidmap.insert(std::pair<int,int>(ed1, ed2));
      return true;
    }
  }

  return false;
}

bool CutByPlane2::checkDouble(int id[], void *pedset)
{
  int i;

  for (i=0; i<3; ++i) {
    if (m_vinflg[id[i]]==FLG_IN &&
        m_vinflg[id[(i+1)%3]]==FLG_IN &&
        m_vinflg[id[(i+2)%3]]==FLG_OUT) {

      int nin0 = m_vidmap[id[i]];
      int nin1 = m_vidmap[id[(i+1)%3]];
      int ed1 = checkCutEdge(id[(i+2)%3], id[i], pedset);
      int ed2 = checkCutEdge(id[(i+2)%3], id[(i+1)%3], pedset);

      if (m_bBody) {
        if (select_trig(m_verts[nin0], m_verts[ed1], m_verts[nin1], m_verts[ed2])) {
          addNewFace(nin0, nin1, ed1);
          addNewFace(ed2, ed1, nin1);
        }
        else {
          addNewFace(nin0, nin1, ed2);
          addNewFace(ed2, ed1, nin0);
        }
      }

      m_sidmap.insert(std::pair<int,int>(ed1, ed2));
      return true;
    }
  }

  return false;
}

bool CutByPlane2::checkOn1(int id[], void *pedset)
{
  int i;

  for (i=0; i<3; ++i) {
    if (m_vinflg[id[i]]==FLG_ON &&
        m_vinflg[id[(i+1)%3]]!=FLG_ON &&
        m_vinflg[id[(i+2)%3]]!=FLG_ON) {

      if (m_vinflg[id[(i+1)%3]]==FLG_IN &&
          m_vinflg[id[(i+2)%3]]==FLG_IN) {
        if (m_bBody)
          addNewFace(m_vidmap[id[i]], m_vidmap[id[(i+1)%3]], m_vidmap[id[(i+2)%3]]);
        return true;
      }
      else if (m_vinflg[id[(i+1)%3]]==FLG_OUT &&
               m_vinflg[id[(i+2)%3]]==FLG_OUT) {
        return true;
      }

      int ed1 = checkCutEdge(id[(i+1)%3], id[(i+2)%3], pedset);

      if (m_vinflg[id[(i+1)%3]]==FLG_IN) {
        //nin = m_vidmap[id[(i+1)%3]];
        if (m_bBody)
          addNewFace(m_vidmap[id[i]], m_vidmap[id[(i+1)%3]], ed1);
        m_sidmap.insert(std::pair<int,int>(m_vidmap[id[i]], ed1));
      }
      else {
        //nin = m_vidmap[id[(i+2)%3]];
        if (m_bBody)
          addNewFace(m_vidmap[id[i]], ed1, m_vidmap[id[(i+2)%3]]);
        m_sidmap.insert(std::pair<int,int>(ed1, m_vidmap[id[i]]));
      }

      return true;
    }
  }

  return false;
}

bool CutByPlane2::checkOn2(int id[], void *pedset)
{
  int i;

  for (i=0; i<3; ++i) {
    if (m_vinflg[id[i]]==FLG_ON &&
        m_vinflg[id[(i+1)%3]]==FLG_ON &&
        m_vinflg[id[(i+2)%3]]!=FLG_ON) {

      if (m_vinflg[id[(i+2)%3]]==FLG_IN) {
        if (m_bBody)
          addNewFace(m_vidmap[id[i]], m_vidmap[id[(i+1)%3]], m_vidmap[id[(i+2)%3]]);
        m_sidmap.insert(std::pair<int,int>(m_vidmap[id[(i+1)%3]], m_vidmap[id[i]]));
      }
      else {
        m_sidmap.insert(std::pair<int,int>(m_vidmap[id[i]], m_vidmap[id[(i+1)%3]]));
      }

      return true;
    }
  }

  return false;
}

// calc cen of external-tangential circle
Vector4D CutByPlane2::ext_tng(const Vector4D &v1,
                             const Vector4D &v2,
                             const Vector4D &v3)
{
  Vector4D p1 = (v1+v2).scale(0.5);
  Vector4D p2 = (v1+v3).scale(0.5);
  Vector4D p3 = v1;

  Vector4D n1 = v2-v1;
  Vector4D n2 = v3-v1;
  Vector4D n3 = n1.cross(n2);

  //Matrix3D A(n1, n2, n3);
  Matrix3D A( 0, qlib::detail::no_init_tag() );
  A.aij(1,1) = n1.x();
  A.aij(1,2) = n1.y();
  A.aij(1,3) = n1.z();
  A.aij(2,1) = n2.x();
  A.aij(2,2) = n2.y();
  A.aij(2,3) = n2.z();
  A.aij(3,1) = n3.x();
  A.aij(3,2) = n3.y();
  A.aij(3,3) = n3.z();

  Matrix3D iA = A.invert();

  Vector4D vc(p1.dot(n1), p2.dot(n2), p3.dot(n3));
  
  iA.xform(vc);

  // double xxx = n3.dot(vc-p3);
  return vc;
}

bool CutByPlane2::select_trig(const Vector4D &vj0, const Vector4D &vj1,
                             const Vector4D &vk0, const Vector4D &vk1)
{
  Vector4D cen;
  double rad, d;

  cen = ext_tng(vk0, vj0, vj1); //.scale(1.0/3.0);
  rad = (vk0-cen).length();
  d = (vk1-cen).length();

  if (d>rad)
    return true;

  cen = ext_tng(vk0, vj0, vk1); //.scale(1.0/3.0);
  rad = (vk0-cen).length();
  d = (vj1-cen).length();
  if (d>rad)
    return false;

  LOG_DPRINTLN("select_trig: failed!!");
  return false;
}

////////////////////

using qsys::UndoManager;

void MolSurfObj::cutByPlane2(double cdiv, const Vector4D &norm, const Vector4D &pos, bool bBody, bool bSec)
{
  CutByPlane2 cbp(this);

  // Record undo info
  MolSurfEditInfo *pPEI = NULL;
  UndoManager *pUM = NULL;
  qsys::ScenePtr cursc = getScene();
  if (!cursc.isnull()) {
    pUM = cursc->getUndoMgr();
    if (pUM->isOK()) {
      // record property changed undo/redo info
      pPEI = MB_NEW MolSurfEditInfo();
      pPEI->setup(this);
    }
  }

  cbp.doit(cdiv, norm, pos, bBody, bSec);

  // Record undo info
  if (pPEI!=NULL) {
    MB_ASSERT(pUM!=NULL);
    MB_ASSERT(pUM->isOK());
    pUM->addEditInfo(pPEI);
  }

  setModifiedFlag(true);
}


