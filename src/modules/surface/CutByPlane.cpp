// -*-Mode: C++;-*-
//
// Cut molecular surface by a plane
//
// $Id: CutByPlane.cpp,v 1.1 2011/04/09 12:17:09 rishitani Exp $

#include <common.h>
#include <qsys/ObjectEvent.hpp>
#include "CutByPlane.hpp"
#include "MolSurfEditInfo.hpp"

#include <qsys/Scene.hpp>
#include <qsys/UndoManager.hpp>

using namespace surface;

//#define SHOW_ID_I 1
//#define SHOW_ID_O 1

namespace {

  struct Edge
  {
    int id1, id2;
	int nvid;
  };
  
  inline bool operator < (const Edge &a1, const Edge &a2)
  {
    if (a1.id1<a2.id1)
      return true;
    else if (a1.id1>a2.id1)
      return false;
    
    // a1.id1==a2.id1
    if (a1.id2<a2.id2)
      return true;
    else
      return false;
  }

  typedef std::set<Edge> EdgeSet;

}

void CutByPlane::fini()
{
  m_verts.clear();
  m_faces.clear();
  m_vinflg.clear();
  m_vidmap.clear();
  //m_edset.clear();
  m_sidmap.clear();
  m_segrid.clear();
}

CutByPlane::Bndry::~Bndry()
{
  std::for_each(ins.begin(), ins.end(), qlib::delete_ptr<Bndry *>());
}

void CutByPlane::setupConvMat()
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

// calc cen of external-tangential circle
Vector4D CutByPlane::ext_tng(const Vector4D &v1,
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

bool CutByPlane::select_trig(const Vector4D &vj0, const Vector4D &vj1,
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

///////////////////////////////////////////////////////

//void CutByPlane::doitImpl(double cden, const Vector4D &norm, const Vector4D &pos,
//                          bool bSect, bool bBody)
void CutByPlane::doit(double cden, const Vector4D &norm, const Vector4D &pos,
                      bool bNoSect /*= false*/)
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

  for (i=0; i<noldfcs; ++i) {
    id[0] = oldfcs[i].id1;
    id[1] = oldfcs[i].id2;
    id[2] = oldfcs[i].id3;

    if (m_vinflg[id[0]]==FLG_IN &&
        m_vinflg[id[1]]==FLG_IN &&
        m_vinflg[id[2]]==FLG_IN) {
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

    LOG_DPRINTLN("CutByPlane> Fatal Error: "
                 "Face %d is too close to the cutting plane", i);
    return;
  }

  if (bNoSect) {
    // we selected omitting to build the section faces...
    update();
    return;
  }

  //
  // Preprosessing for bulding the section faces
  //

  // order the outer-boundary edges
  while (m_sidmap.size()>0) {
    Bndry *pbndrys = MB_NEW Bndry;

    std::map<int,int>::iterator iter = m_sidmap.begin();
    std::pair<int,int> ed = *iter;
    m_sidmap.erase(iter);
    pbndrys->ids.push_back(ed.first);
    
    for (j=0;;++j) {
      iter = m_sidmap.find(ed.second);
      if (iter==m_sidmap.end())
        break;
      
      ed = *iter;
      m_sidmap.erase(iter);

#ifdef SHOW_ID_O
      //if (pbndrys->size()<10)
      m_pTgt->dbgmsg(getVert(ed.first),
                     LString::format("o%d", pbndrys->ids.size()));
#endif

      pbndrys->ids.push_back(ed.first);
    }

    m_outers.ins.push_back(pbndrys);
  }
  m_sidmap.clear();

  checkOuterBndry();

  Bndry::ins_t::iterator iter = m_outers.ins.begin();
  for (; iter!=m_outers.ins.end(); ++iter) {
    Bndry *pbndry = *iter;
    makeSection(*pbndry);
  }

  update();
}

void CutByPlane::update()
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

int CutByPlane::checkCutEdge(int id1, int id2, void *pedset)
{
  if (id1>id2) {
    int tmp = id1; 
    id1 = id2;
    id2 = tmp;
  }

  Edge ed;
  ed.id1 = id1;
  ed.id2 = id2;
  
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

bool CutByPlane::divideEdge(int id1, int id2,
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

bool CutByPlane::checkSingle(int id[], void *pedset)
{
  int i;

  for (i=0; i<3; ++i) {
    if (m_vinflg[id[i]]==FLG_IN &&
        m_vinflg[id[(i+1)%3]]==FLG_OUT &&
        m_vinflg[id[(i+2)%3]]==FLG_OUT) {

      int nin0 = m_vidmap[id[i]];
      int ed1 = checkCutEdge(id[i], id[(i+2)%3], pedset);
      int ed2 = checkCutEdge(id[i], id[(i+1)%3], pedset);

      addNewFace(nin0, ed2, ed1);
      m_sidmap.insert(std::pair<int,int>(ed1, ed2));
      return true;
    }
  }

  return false;
}

bool CutByPlane::checkDouble(int id[], void *pedset)
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

      if (select_trig(m_verts[nin0], m_verts[ed1], m_verts[nin1], m_verts[ed2])) {
        addNewFace(nin0, nin1, ed1);
        addNewFace(ed2, ed1, nin1);
      }
      else {
        addNewFace(nin0, nin1, ed2);
        addNewFace(ed2, ed1, nin0);
      }

      m_sidmap.insert(std::pair<int,int>(ed1, ed2));
      return true;
    }
  }

  return false;
}

bool CutByPlane::checkOn1(int id[], void *pedset)
{
  int i;

  for (i=0; i<3; ++i) {
    if (m_vinflg[id[i]]==FLG_ON &&
        m_vinflg[id[(i+1)%3]]!=FLG_ON &&
        m_vinflg[id[(i+2)%3]]!=FLG_ON) {

      if (m_vinflg[id[(i+1)%3]]==FLG_IN &&
          m_vinflg[id[(i+2)%3]]==FLG_IN) {
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
        addNewFace(m_vidmap[id[i]], m_vidmap[id[(i+1)%3]], ed1);
        m_sidmap.insert(std::pair<int,int>(m_vidmap[id[i]], ed1));
      }
      else {
        //nin = m_vidmap[id[(i+2)%3]];
        addNewFace(m_vidmap[id[i]], ed1, m_vidmap[id[(i+2)%3]]);
        m_sidmap.insert(std::pair<int,int>(ed1, m_vidmap[id[i]]));
      }

      return true;
    }
  }

  return false;
}

bool CutByPlane::checkOn2(int id[], void *pedset)
{
  int i;

  for (i=0; i<3; ++i) {
    if (m_vinflg[id[i]]==FLG_ON &&
        m_vinflg[id[(i+1)%3]]==FLG_ON &&
        m_vinflg[id[(i+2)%3]]!=FLG_ON) {

      if (m_vinflg[id[(i+2)%3]]==FLG_IN) {
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

////////////////////////////////////////////////////////////////

void CutByPlane::checkOuterBndry()
{
  Bndry::ins_t::iterator iter = m_outers.ins.begin();
  for (; iter!=m_outers.ins.end(); ++iter) {
    Bndry *pbndry = *iter;
    Bndry::ins_t::iterator iter2 = iter;
    ++iter2;
    for (; iter2!=m_outers.ins.end();) {
      Bndry *pbndry2 = *iter2;
      if (isBndryEnclosed(pbndry, pbndry2)) {
        // pbndry2 is enclosed by pbndry
        pbndry->ins.push_back(pbndry2);
        iter2 = m_outers.ins.erase(iter2);
        continue;
      }
      ++iter2;
    }
  }
}

bool CutByPlane::isBndryEnclosed(Bndry *pout, Bndry *pin) const
{
  if (pin->ids.size()<1 || pout->ids.size()<1)
    return false;

  Vector4D vin = getVert(pin->ids[0]);
  vin = ontoPlane(vin);

  int i, nsize = pout->ids.size();
  Vector4D prev, v;

  int nhit=0;
  for (i=0; i<=nsize; ++i, prev=v) {
    v = getVert(pout->ids[i%nsize]);
    v = ontoPlane(v);
    if (i==0)
      continue;
    
    if ((prev.x()-vin.x())*(v.x()-vin.x())<0) {
      double yy = (v.y()-prev.y())*(vin.x()-prev.x())/(v.x()-prev.x()) + prev.y();
      if (yy<vin.y())
        ++nhit;
    }

  }

  if (nhit%2==0) return false;

  return true;
}

void CutByPlane::getCrossRgn(double xx, const Bndry &outer,
                             std::set<double> &yset) const
{
  int i, idx, nsize = outer.ids.size();
  Vector4D v, prev;

  for (i=0; i<=nsize; ++i, prev=v) {
    idx = outer.ids[i%nsize];
    v =  ontoPlane(getVert(idx));

    if (i==0) continue;

    if ((prev.x()-xx)*(v.x()-xx)<=0) {
      double yy = (v.y()-prev.y())*(xx-prev.x())/(v.x()-prev.x()) + prev.y();
      yset.insert(yy);
    }
  }

  if (outer.ins.size()>0) {
    Bndry::ins_t::const_iterator iter = outer.ins.begin();
    for (; iter!=outer.ins.end(); ++iter) {
      Bndry *pbndry = *iter;
      getCrossRgn(xx, *pbndry, yset);
    }
  }
}

void CutByPlane::makeSection(Bndry &outer)
{
  int i, j, noutsz = outer.ids.size();
  Vector4D v, prev;

  // duplicate the outer boundary verteces

  for (i=0; i<noutsz; ++i) {
    v = getVert(outer.ids[i]);
    outer.ids[i] = addNewVertex(v, -m_norm);
  }
  if (outer.ins.size()>0) {
    Bndry::ins_t::const_iterator iter = outer.ins.begin();
    for (; iter!=outer.ins.end(); ++iter) {
      Bndry &bndry = **iter;
      for (i=0; i<bndry.ids.size(); ++i) {
        v = getVert(bndry.ids[i]);
        bndry.ids[i] = addNewVertex(v, -m_norm);
      }
    }
  }
  
  Vector4D gdir(0, 1, 0);
  m_xfm.xform(gdir);

  // calc the bounding rect of the outer boundary verteces

  Vector4D vmin(1.0e100, 1.0e100, 0.0), vmax(-1.0e100, -1.0e100, 0.0);
  for (i=0; i<noutsz; ++i) {
    v = getVert(outer.ids[i]);
    v = ontoPlane(v);

    vmin.x() = qlib::min(v.x(), vmin.x());
    vmin.y() = qlib::min(v.y(), vmin.y());

    vmax.x() = qlib::max(v.x(), vmax.x());
    vmax.y() = qlib::max(v.y(), vmax.y());
  }

  // inflate the bounding box
  vmin.x() -= m_cdiv/2.0;
  vmin.y() -= m_cdiv/2.0;
  vmax.x() += m_cdiv/2.0;
  vmax.y() += m_cdiv/2.0;

  LOG_DPRINTLN("(%f,%f)-(%f,%f)", vmin.x(), vmin.y(), vmax.x(), vmax.y());

  // calc division num (nx, ny) from cdiv
  int nx = (int)::ceil((vmax.x()-vmin.x())/m_cdiv);
  m_dx = (vmax.x()-vmin.x())/double(nx);

  int ny = (int)::ceil((vmax.y()-vmin.y())/m_cdiv);
  m_dy = (vmax.y()-vmin.y())/double(ny);
  m_vmin = vmin;

  m_segrid.resize(nx, ny, 1);
  
  // mark internal grid points
//FILE *fpp = fopen("c:\\tmp_txt.txt", "w");
  for (i=0; i<nx; ++i) {
    double xx = (double(i)+0.5)*m_dx + vmin.x();

    std::set<double> yset;
    getCrossRgn(xx, outer, yset);

    for (j=0; j<ny; ++j)
      m_segrid.at(i, j) = -1;

    if (yset.size()/2==0)
      continue;

    std::set<double>::const_iterator iys = yset.begin();
    while (iys!=yset.end()) {
      double y1 = *iys;
      ++iys;
      double y2 = *iys;
      ++iys;

      for (j=0; j<ny; ++j) {
        double yy = (double(j)+0.5)*m_dy + vmin.y();
        if (y1<yy && yy<y2) {
          Vector4D v = fromPlane(Vector4D(xx, yy, 0.0));
          int idx = addNewVertex(MSVert(v, -m_norm));
          m_segrid.at(i, j) = idx;
        }
      }

    }

    /*for (j=0; j<ny; ++j) {
      double yy = (double(j)+0.5)*dy + vmin.y;
      fprintf(fpp, "(%d, %d) (%f,%f) = %d\n", i, j, xx, yy, m_segrid.at(i,j));
    }*/

  }
//fclose(fpp);
  // extract bounding edges &
  // build faces from the internal grid points

  MSFace face;
  // std::map<int, int> edset;
  if (m_bdmap.size()>0)
    m_bdmap.clear();
  int id[6]; //, idd[3];
  //bool be[3];
  for (i=0; i<nx-1; ++i) {
    for (j=0; j<ny-1; ++j) {
      id[0] = m_segrid.at(i, j);
      id[1] = m_segrid.at(i+1, j);
      id[2] = m_segrid.at(i, j+1);
      id[3] = m_segrid.at(i+1, j+1);

      if (id[0]>=0 && id[1]>=0 && id[3]>=0) {
        face.id1 = id[0];
        face.id2 = id[3];
        face.id3 = id[1];

        if (chkSgBndry(i, j, 0, face, outer))
          addNewFace(face);
        /*
        idd[0] = face.id1 = id[0];
        idd[1] = face.id2 = id[3];
        idd[2] = face.id3 = id[1];
        be[0] = checkCross1(i, j, 2, outer);
        be[1] = checkCross1(i+1, j, 0, outer);
        be[2] = checkCross1(i, j, 1, outer);
        if (!(be[0] || be[1] || be[2])) {
          if (chkSgBndry(i, j, 0, face))
            addNewFace(face);
        }
        else {
          chkSgBndry2(be, idd);
        }*/

      }
      if (id[0]>=0 && id[2]>=0 && id[3]>=0) {
        face.id1 = id[0];
        face.id2 = id[2];
        face.id3 = id[3];
        if (chkSgBndry(i, j, 1, face, outer))
          addNewFace(face);
        /*
        idd[0] = face.id1 = id[0];
        idd[1] = face.id2 = id[2];
        idd[2] = face.id3 = id[3];
        be[0] = checkCross1(i, j, 0, outer);
        be[1] = checkCross1(i, j+1, 1, outer);
        be[2] = checkCross1(i, j, 2, outer);
        if (!(be[0] || be[1] || be[2])) {
          if (chkSgBndry(i, j, 1, face))
            addNewFace(face);
        }
        else {
          chkSgBndry2(be, idd);
        }*/
      }
      if (id[0]>=0 && id[1]>=0 && id[2]>=0 && id[3]<0) {
        face.id1 = id[0];
        face.id2 = id[2];
        face.id3 = id[1];
        if (chkSgBndry(i, j, 2, face, outer))
          addNewFace(face);
        /*
        idd[0] = face.id1 = id[0];
        idd[1] = face.id2 = id[2];
        idd[2] = face.id3 = id[1];
        be[0] = checkCross1(i, j, 0, outer);
        be[1] = checkCross1(i, j+1, 3, outer);
        be[2] = checkCross1(i, j, 1, outer);
        if (!(be[0] || be[1] || be[2])) {
          if (chkSgBndry(i, j, 2, face))
            addNewFace(face);
        }
        else {
          chkSgBndry2(be, idd);
        }*/
      }

      if (j>0) {
        id[4] = m_segrid.at(i, j-1);
        id[5] = m_segrid.at(i+1, j-1);
        if (id[4]<0 && id[5]>=0 && id[0]>=0 && id[1]>=0) {
          face.id1 = id[0];
          face.id2 = id[1];
          face.id3 = id[5];
          if (chkSgBndry(i, j, 3, face, outer))
            addNewFace(face);
          /*
          idd[0] = face.id1 = id[0];
          idd[1] = face.id2 = id[1];
          idd[2] = face.id3 = id[5];
          be[0] = checkCross1(i, j, 1, outer);
          be[1] = checkCross1(i+1, j-1, 0, outer);
          be[2] = checkCross1(i, j, 3, outer);
          if (!(be[0] || be[1] || be[2])) {
            if (chkSgBndry(i, j, 3, face))
              addNewFace(face);
          }
          else {
            chkSgBndry2(be, idd);
          }*/
        }
      }
    } // for (ny)
  } // for (nx)


  // order the inner-boundary edges
  Bndry inners;
  while (m_bdmap.size()>0) {
    Bndry *pbndrys = MB_NEW Bndry;

    std::map<int,int>::iterator iter = m_bdmap.begin();
    std::pair<int,int> ed = *iter;
    m_bdmap.erase(iter);
#ifdef SHOW_ID_I
      m_pTgt->dbgmsg(getVert(ed.first),
                     LString::format("i%d", pbndrys->ids.size()));
#endif      
    pbndrys->ids.push_back(ed.first);
    
    for (j=0;;++j) {
      iter = m_bdmap.find(ed.second);
      if (iter==m_bdmap.end())
        break;
      
      ed = *iter;
      m_bdmap.erase(iter);

#ifdef SHOW_ID_I
      //if (pbndrys->size()<10)
      m_pTgt->dbgmsg(getVert(ed.first),
                     LString::format("i%d", pbndrys->ids.size()));
#endif      

      pbndrys->ids.push_back(ed.first);
    }

    inners.ins.push_back(pbndrys);
  }
  
  // return;
  
  makeSeam(outer, inners);
  if (outer.ins.size()>0) {
    Bndry::ins_t::const_iterator iter = outer.ins.begin();
    for (; iter!=outer.ins.end(); ++iter) {
      Bndry *pbndry = *iter;
      makeSeam(*pbndry, inners);
    }
  }
}

static bool dirchk(const Vector4D &v1, const Vector4D &v2,
                   const Vector4D &v3, const Vector4D &norm)
{
  double det = norm.dot((v2-v1).cross(v3-v1));
  return (det<0);
}

void CutByPlane::makeSeam(const Bndry &outer, const Bndry &inners)
{
  int j=0, k, kmin, jj=0;
  int jmax = outer.ids.size();
  MSFace face;

  Bndry *pinner=NULL;

  {
    // find nearest inner vertex
    Vector4D curr = getVert(outer.ids[j]);
    double sqmin = 1.0e100;
    
    //Bndry::ins_t::const_iterator min_iter;// = inners.ins.begin();
    Bndry::ins_t::const_iterator iter = inners.ins.begin();

    for (; iter!=inners.ins.end(); ++iter) {
      Bndry *pbndry = *iter;
      int kmax = pbndry->ids.size();
      for (k=0; k<kmax; ++k) {
        Vector4D vtx = getVert(pbndry->ids[k]);
        const double sqd = (curr-vtx).sqlen();
        if (sqd<sqmin) {
          sqmin = sqd;
          kmin = k;
          pinner = pbndry;
        }
      }
    }
  }

  if (pinner==NULL) {
    LOG_DPRINTLN("CutByPlane::makeSeam> nearest inner boundary is not found!!");
    return;
  }

  int kmax = pinner->ids.size();
  k = kmin;
  Vector4D v;

  while (jj<(jmax+kmax+100)) {
  //while (jj<1000) {
  //while (j<230) {
    int jp1 = (j+1)%jmax;
    int kp1 = (k+1)%kmax;

    bool bjp1 = true, bkp1 = true;

    const Vector4D &vj0 = getVert(outer.ids[j]);
    const Vector4D &vj1 = getVert(outer.ids[jp1]);
    const Vector4D &vk0 = getVert(pinner->ids[k]);
    const Vector4D &vk1 = getVert(pinner->ids[kp1]);

    if (!dirchk(vj0, vj1, vk0, m_norm))
      bjp1 = false;

    if (!dirchk(vj0, vk1, vk0, m_norm))
      bkp1 = false;

    if (bjp1&&bkp1) {
      if (select_trig(vj0, vj1, vk0, vk1)) {
        bjp1 = true;
        bkp1 = false;
      }
      else {
        bjp1 = false;
        bkp1 = true;
      }
    }

    if (bjp1) {
      face.id1 = outer.ids[j];
      face.id2 = outer.ids[jp1];
      face.id3 = pinner->ids[k];
      addNewFace(face);

      if (jp1==0 && k==kmin)
        break;

      j = jp1;
      //++j;
    }
    else {
      face.id1 = outer.ids[j];
      face.id2 = pinner->ids[kp1];
      face.id3 = pinner->ids[k];
      addNewFace(face);

      if (j==0 && kp1==kmin)
        break;

      k = kp1;
    }

    ++jj;
  } // while
}

bool CutByPlane::isGridInvalid(int i, int j) const
{
  const int nx = m_segrid.cols();
  const int ny = m_segrid.rows();
  if (i<0 || i>=nx) return true;
  if (j<0 || j>=ny) return true;
  if (m_segrid.at(i, j)<0) return true;
  return false;
}

bool CutByPlane::chkSgBndry(int i, int j, int ntyp,
                            const MSFace &f, const Bndry &outer)
{
  bool res = true;

  switch (ntyp) {
  case 0:
    if (isGridInvalid(i, j+1)) {
      if (checkCross1(i, j, 2, outer)) {
        appendBndryMap(f.id1, f.id3);
        appendBndryMap(f.id3, f.id2);
        res = false;
      }
      else
        appendBndryMap(f.id1, f.id2);
    }
    if (isGridInvalid(i, j-1) && isGridInvalid(i+1, j-1)) {
      if (checkCross1(i, j, 1, outer)) {
        appendBndryMap(f.id3, f.id2);
        appendBndryMap(f.id2, f.id1);
        res = false;
      }
      else
        appendBndryMap(f.id3, f.id1);
    }
    if (isGridInvalid(i+2, j) && isGridInvalid(i+2, j+1)) {
      if (checkCross1(i+1, j, 0, outer)) {
        appendBndryMap(f.id2, f.id1);
        appendBndryMap(f.id1, f.id3);
        res = false;
      }
      else
        appendBndryMap(f.id2, f.id3);
    }
    break;

  case 1:
    if (isGridInvalid(i+1, j)) {
      if (checkCross1(i, j, 2, outer)) {
        appendBndryMap(f.id3, f.id2);
        appendBndryMap(f.id2, f.id1);
        res = false;
      }
      else
        appendBndryMap(f.id3, f.id1);
    }
    if (isGridInvalid(i-1, j) && isGridInvalid(i-1, j+1)) {
      if (checkCross1(i, j, 0, outer)) {
        appendBndryMap(f.id1, f.id3);
        appendBndryMap(f.id3, f.id2);
        res = false;
      }
      else
        appendBndryMap(f.id1, f.id2);
    }
    if (isGridInvalid(i, j+2) && isGridInvalid(i+1, j+2)) {
      if (checkCross1(i, j+1, 1, outer)) {
        appendBndryMap(f.id2, f.id1);
        appendBndryMap(f.id1, f.id3);
        res = false;
      }
      else
        appendBndryMap(f.id2, f.id3);
    }
    break;

  case 2:
    if (isGridInvalid(i+1, j+1)) {
      if (checkCross1(i, j+1, 3, outer)) {
        appendBndryMap(f.id2, f.id1);
        appendBndryMap(f.id1, f.id3);
        res = false;
      }
      else
        appendBndryMap(f.id2, f.id3);
    }
    if (isGridInvalid(i, j-1) && isGridInvalid(i+1, j-1)) {
      if (checkCross1(i, j, 1, outer)) {
        appendBndryMap(f.id3, f.id2);
        appendBndryMap(f.id2, f.id1);
        res = false;
      }
      else
        appendBndryMap(f.id3, f.id1);
    }
    if (isGridInvalid(i-1, j) && isGridInvalid(i-1, j+1)) {
      if (checkCross1(i, j, 0, outer)) {
        appendBndryMap(f.id1, f.id3);
        appendBndryMap(f.id3, f.id2);
        res = false;
      }
      else
        appendBndryMap(f.id1, f.id2);
    }
    break;

  case 3:
    if (isGridInvalid(i, j-1)) {
      if (checkCross1(i, j, 3, outer)) {
        appendBndryMap(f.id3, f.id2);
        appendBndryMap(f.id2, f.id1);
        res = false;
      }
      else
        appendBndryMap(f.id3, f.id1);
    }
    if (isGridInvalid(i, j+1) && isGridInvalid(i+1, j+1)) {
      if (checkCross1(i, j, 1, outer)) {
        appendBndryMap(f.id1, f.id3);
        appendBndryMap(f.id3, f.id2);
        res = false;
      }
      else
        appendBndryMap(f.id1, f.id2);
    }
    if (isGridInvalid(i+2, j) && isGridInvalid(i+2, j-1)) {
      if (checkCross1(i+1, j-1, 0, outer)) {
        appendBndryMap(f.id2, f.id1);
        appendBndryMap(f.id1, f.id3);
        res = false;
      }
      else
        appendBndryMap(f.id2, f.id3);
    }
    break;
  }

  return res;
}

bool CutByPlane::checkCrossHelper(const Vector4D &b1, const Vector4D &b2,
                                  const Vector4D &c1, const Vector4D &c2) const
{
  const double dbx = b2.x()-b1.x();
  const double dby = b2.y()-b1.y();
  const double dcx = c2.x()-c1.x();
  const double dcy = c2.y()-c1.y();
  const double B = dby*dcx - dbx*dcy;
  if (qlib::isNear4(B, 0.0))
    return false;

  const double dbcx = b1.x()-c1.x();
  const double dbcy = b1.y()-c1.y();

  const double A = dby*dbcx-dbx*dbcy;
  const double C = dcy*dbcx-dcx*dbcy;

  const double t1 = A/B;
  const double t2 = C/B;

  if (0.0<=t1 && t1<=1.0 &&
      0.0<=t2 && t2<=1.0)
    return true;

  return false;
}

bool CutByPlane::checkCross1(int ii, int jj, int ntyp, const Bndry &outer) const
{
  int i, idx, nsize = outer.ids.size();
  Vector4D v, prev;

  Vector4D x1, x2;
  x1 = grid2vec(ii, jj);
  switch (ntyp) {
  case 0:
    x2 = grid2vec(ii, jj+1);
    break;
  case 1:
    x2 = grid2vec(ii+1, jj);
    break;
  case 2:
    x2 = grid2vec(ii+1, jj+1);
    break;
  case 3:
    x2 = grid2vec(ii+1, jj-1);
    break;
  default:
    LOG_DPRINTLN("CutByPlane: FatalError");
    MB_ASSERT(false);
    return false;
  }

  for (i=0; i<=nsize; ++i, prev=v) {
    idx = outer.ids[i%nsize];
    v =  ontoPlane(getVert(idx));

    if (i==0) continue;

    if (checkCrossHelper(x1, x2, v, prev))
      return true;
  }

  if (outer.ins.size()>0) {
    Bndry::ins_t::const_iterator iter = outer.ins.begin();
    for (; iter!=outer.ins.end(); ++iter) {
      Bndry *pbndry = *iter;
      if (checkCross1(ii, jj, ntyp, *pbndry))
        return true;
    }
  }

  return false;
}

bool CutByPlane::chkSgBndry2(bool be[], int idd[])
{
  int ii;
  for (ii=0; ii<3; ++ii) {
    if (be[ii] && !be[(ii+1)%3] && !be[(ii+2)%3]) {
      appendBndryMap(idd[ii], idd[(ii+2)%3]);
      appendBndryMap(idd[(ii+2)%3], idd[(ii+1)%3]);
      break;
    }
  }
  if (ii==3){
    LOG_DPRINTLN("doube crossing triangle is detected (tesselation may be incorrect)");
    return false;
  }

  return true;
}

////////////////////

using qsys::UndoManager;

void MolSurfObj::cutByPlane(double cdiv, const Vector4D &norm, const Vector4D &pos, bool bSec)
{
  CutByPlane cbp(this);

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

  cbp.doit(cdiv, norm, pos, bSec);

  // Record undo info
  if (pPEI!=NULL) {
    MB_ASSERT(pUM!=NULL);
    MB_ASSERT(pUM->isOK());
    pUM->addEditInfo(pPEI);
  }

  setModifiedFlag(true);
}


