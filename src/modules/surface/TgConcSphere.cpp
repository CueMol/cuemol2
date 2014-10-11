// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: TgConcSphere.cpp,v 1.1 2011/02/11 06:55:18 rishitani Exp $

#include <common.h>

#include "surface.hpp"
#ifdef SURF_BUILDER_TEST

#include <gfx/DisplayContext.hpp>
#include <qlib/Matrix3D.hpp>

#include "MolSurfBuilder.hpp"
#include "TgConcSphere.hpp"
#include "TgSphere.hpp"
#include "RSComponent.hpp"
#include "SESTgBuilder.hpp"
#include "MeshPadding.hpp"

using namespace surface;
using qlib::Matrix3D;

/////////////////////////////////////////////////////////
// Helper methods

static void drawArc(DisplayContext *pdl,
                    const Vector4D &vcen,
                    const Vector4D &v0,
                    const Vector4D &norm,
                    double theta)
{
  const double rad = (v0-vcen).length();
  const Vector4D e0 = (v0-vcen).normalize();
  const Vector4D &e2 = norm;

  Matrix4D xfm = Matrix4D::makeRotMat(e2, e0);

/*
const Vector4D e1 = e2.cross(e0);
  Matrix3D xfm;
  xfm.a11 = e0.x();
  xfm.a21 = e0.y();
  xfm.a31 = e0.z();
  
  xfm.a12 = e1.x();
  xfm.a22 = e1.y();
  xfm.a32 = e1.z();
  
  xfm.a13 = e2.x();
  xfm.a23 = e2.y();
  xfm.a33 = e2.z();
*/
  int i;
  double ith = 0.0;
  const double arclen = qlib::abs(theta * rad);
  int ndiv = int(arclen*10);
  if (ndiv<5)
    ndiv = 5;
  const double dth = theta/double(ndiv);

  pdl->setLighting(false);
  pdl->startLineStrip();
  pdl->color(1,0,0);
  pdl->vertex(vcen);
  pdl->vertex(v0);
  pdl->color(0,0,1);
  for (i=0; i<ndiv+1; ++i) {
    Vector4D tv(rad*::cos(ith), rad*::sin(ith), 0.0);
    xfm.xform3D(tv);
    tv += vcen;
    pdl->vertex(tv);
    ith += dth;
  }
  pdl->color(1,0,0);
  pdl->vertex(vcen);
  pdl->end();
  pdl->setLighting(true);
}

static void showInt(DisplayContext *pdl, int id0, const Vector4D &pos)
{
  pdl->setLighting(false);
  LString str = LString::format("%d", id0);
  pdl->color(1,1,1);
  pdl->drawString(pos, str);
  pdl->setLighting(true);
}

void TgSpherePadSuper::showVertID(DisplayContext *pdl, int id0)
{
//return;
  SurfTgSet &tgset = m_pParent->m_pmsb->m_tgset;
  showInt(pdl, id0, tgset.getVertex(id0));
}

/////////////////////////////////////////////////////////

void TgSpherePadSuper::sliceSphere(const Vector4D &norm, const Vector4D &vcen)
{
  int i;
  for (i=0; i<m_nvmax; ++i) {
    Vector4D x = m_pOrigMesh->m_verts[i].v3d() - vcen;
    double det = norm.dot(x);
    if (det<0.001) {
      m_vflag[i] = false;
    }
    /*else if (det<0.001) {
      DisplayContext *pdl = m_pParent->m_pdl;
      pdl->sphere(0.01, x+m_vcen);
    }*/
  }
}

double TgSpherePadSuper::distance(int i, int j)
{
  SurfTgSet &tgset = m_pParent->m_pmsb->m_tgset;
  const Vector4D &pi = tgset.getVertex(i);
  const Vector4D &pj = tgset.getVertex(j);
  return (pi-pj).length();
}

bool TgSpherePadSuper::chkConvHull(int id0, int id1, int id2, const std::list<int> &inner)
{
  SurfTgSet &tgset = m_pParent->m_pmsb->m_tgset;
  const Vector4D &v0 = tgset.getVertex(id0);
  const Vector4D &v1 = tgset.getVertex(id1);
  const Vector4D &v2 = tgset.getVertex(id2);

  Vector4D vn = ( (v1-v0).cross(v2-v1) ).normalize();
  
  std::list<int>::const_iterator ii = inner.begin();

  for (; ii!=inner.end(); ++ii) {
    int idt = *ii;
    if (idt==id0 || idt==id1 || idt==id2)
      continue;
    const Vector4D &vt = tgset.getVertex(idt);
    double det = vn.dot(vt-v0);
    if (det>=0.0) {
      return false;
    }
  }

  return true;
}

/**
  Search a vertex that can form a convex-hull triangle with id0 and id1
 */
int TgSpherePadSuper::searchCHVert(int id0, int id1, const std::list<int> &inverts)
{
  std::list<int> imins;

  std::list<int>::const_iterator ii = inverts.begin();
  for (; ii!=inverts.end(); ++ii) {
    int id2 = *ii;
    if (id2==id0 || id2==id1) {
      continue;
    }
    if (chkConvHull(id0, id1, id2, inverts)) {
      //imin = id2;
      imins.push_back(id2);
    }
  }
  
  if (imins.size()==0)
    return -1;

  if (imins.size()==1)
    return imins.front();

  LOG_DPRINTLN("SearchCHVert: more than 1 verts (%d) are found", imins.size());
  return imins.front();
}

/**
 Check the convex-hullness of (id0, id1, id2) including the outmost verteces "vlst"
 */
int TgSpherePadSuper::chkConvHull2(int id0, int id1, int id2, const std::list<int> &vlst)
{
  SurfTgSet &tgset = m_pParent->m_pmsb->m_tgset;
  const Vector4D &v0 = tgset.getVertex(id0);
  const Vector4D &v1 = tgset.getVertex(id1);
  const Vector4D &v2 = tgset.getVertex(id2);

  const Vector4D vn = ( (v1-v0).cross(v2-v1) ).normalize();
  
  std::list<int>::const_iterator ii = vlst.begin();

  for (; ii!=vlst.end(); ++ii) {
    int idt = *ii;
    if (idt==id0 || idt==id1 || idt==id2)
      continue;
    const Vector4D &vt = tgset.getVertex(idt);
    const double det = vn.dot(vt-v0);

    if (det>=0.0) {
      // the face (id0, id1, id2) intersects with the vertex IDT!!
      Vector4D vn2;

      // check (0,1)
      vn2 = ( (m_vcen-v0).cross(v1-m_vcen) ).normalize();
      if (vn2.dot(vt-m_vcen)>=0.0)
        return 0;

      // check (1,2)
      vn2 = ( (m_vcen-v1).cross(v2-m_vcen) ).normalize();
      if (vn2.dot(vt-m_vcen)>=0.0)
        return 1;

      // check (2,0)
      vn2 = ( (m_vcen-v2).cross(v0-m_vcen) ).normalize();
      if (vn2.dot(vt-m_vcen)>=0.0)
        return 2;

      bool b01 = chkArcEats(v0, v1);
      bool b12 = chkArcEats(v1, v2);
      bool b20 = chkArcEats(v2, v0);

      LOG_DPRINTLN("TgConcSph> 0:%d, 1:%d, 2:%d, t:%d", id0, id1, id2, idt);
      LOG_DPRINTLN("TgConcSph> b01:%d, b12:%d, b20:%d", b01, b12, b20);

      if (b01 && !b12 && !b20)
        return 0;
      if (!b01 && b12 && !b20)
        return 1;
      if (!b01 && !b12 && b20)
        return 2;

      LOG_DPRINTLN("TgConcSph> chkConvHull2: unexpected condition!!");
      showVertID(m_pParent->m_pdl, id0);
      showVertID(m_pParent->m_pdl, id1);
      showVertID(m_pParent->m_pdl, id2);
      showVertID(m_pParent->m_pdl, idt);

      return 3;
    }
  }

  return -1;

  /*
  const double a = distance(id0, id1);
  const double b = distance(id1, id2);
  const double c = distance(id2, id0);

  return a*b*c/::sqrt((a+b+c)*(-a+b+c)*(a-b+c)*(a+b-c));*/
}

bool TgSpherePadSuper::chkArcEats(const Vector4D &v0, const Vector4D &v1)
{
  int i;
  const Vector4D c0 = v0-m_vcen;
  const Vector4D c1 = v1-m_vcen;
  const Vector4D np = ( c0.cross(c1) ).normalize();
  // const Vector4D nz = (v1-v0).normalize();
  const double Rad = m_pOrigMesh->m_rad;

//m_pParent->m_pdl->sphere(0.005, v0);
//m_pParent->m_pdl->sphere(0.005, v1);


  for (i=0; i<m_arcs.size(); ++i) {
    const SESArc *pArc = m_arcs[i];
    const Vector4D narc =  (pArc->m_norm);
    const double dd = (pArc->m_vc-m_vcen).length();

//m_pParent->m_pdl->sphere(0.05, pArc->m_vc);
//showInt(m_pParent->m_pdl,i, pArc->m_vc);

    //const double th = qlib::abs(::acos(np.dot(narc))-M_PI/2.0);
    const double sinth = np.dot(narc);
    const double costh = ::sqrt(1.0-sinth*sinth);
    const double dtest = Rad*costh;

    if (dtest<dd) continue;
    MB_DPRINTLN("%d: dd=%f, costh=%f, R=%f, dte=%f", i, dd, costh, Rad, dtest);

    const Vector4D nzz = (np.cross(narc)).normalize();
    Vector4D nyy = (np.cross(nzz)).normalize();
    if (nyy.dot(narc)>0)
      nyy = -nyy;

    const double ee = dd/costh;
    const double scl = ::sqrt(Rad*Rad-ee*ee);
    const Vector4D vt0 = nyy.scale(ee) + nzz.scale(scl);
    const Vector4D vt1 = nyy.scale(ee) - nzz.scale(scl);
//m_pParent->m_pdl->sphere(0.001, vt0+m_vcen);
//m_pParent->m_pdl->sphere(0.001, vt1+m_vcen);
//showInt(m_pParent->m_pdl, i, vt0+m_vcen);
//showInt(m_pParent->m_pdl, i, vt1+m_vcen);
//pArc->draw(m_pParent->m_pdl, 50.0);

    {
      // pArc and v0-v1 possibly interferes

      const Vector4D nc0 = ( np.cross(c0) ).normalize();
      const Vector4D nc1 = ( c1.cross(np) ).normalize();
      
      if (vt0.dot(nc0)>0 && vt0.dot(nc1)>0) {
        // pArc and v0-v1 interferes !!
//m_pParent->m_pdl->color(1, 0, 0);
//m_pParent->m_pdl->sphere(0.02, vt0+m_vcen);
        return true;
      }

      if (vt1.dot(nc0)>0 && vt1.dot(nc1)>0) {
        // pArc and v0-v1 interferes !!
//m_pParent->m_pdl->color(1, 0, 0);
//m_pParent->m_pdl->sphere(0.02, vt1+m_vcen);
        return true;
      }

      // no crossing point with parc!!
    }
  }  

  return false;
}

///////////////////////////////////////////////////////////////////////////////////////

/**
 Collect faces inside the three planes,
 and extract the verge verteces list
*/
void TgSpherePadSuper::makeInEdges(VgEdgeList &inedges,
                                   const std::list<int> &outverts,
                                   bool bdir)
{
  int i;
  SurfTgSet &tgset = m_pParent->m_pmsb->m_tgset;

  for (i=0; i<m_nfmax; ++i) {
    const MSFace &msf = m_pOrigMesh->m_faces[i];
    if (m_vflag[msf.id1] && m_vflag[msf.id2] && m_vflag[msf.id3]) {
      // the face msf is SES
      int nid1 = m_vidmap[msf.id1];
      int nid2 = m_vidmap[msf.id2];
      int nid3 = m_vidmap[msf.id3];

      // check the convex-hullness including the outmost verteces
      int res;
      if (bdir) {
        res = chkConvHull2(nid1, nid2, nid3, outverts);
      }
      else {
        res = chkConvHull2(nid3, nid2, nid1, outverts);
        if (res==0) res = 1;
        else if (res==1) res = 0;
      }

      if (res<0) {
        // (1,2,3) is conv-hull with outverts
        tgset.addFace(nid1, nid2, nid3);
      }
      else if (res==0) {
        // (1,2,3) is NOT conv-hull with outverts
        inedges.put_avoid(m_vidmap[msf.id1], m_vidmap[msf.id2]);
        inedges.put_inner(m_vidmap[msf.id2], m_vidmap[msf.id3]);
        inedges.put_inner(m_vidmap[msf.id3], m_vidmap[msf.id1]);
      }
      else if (res==1) {
        // (1,2,3) is NOT conv-hull with outverts
        inedges.put_inner(m_vidmap[msf.id1], m_vidmap[msf.id2]);
        inedges.put_avoid(m_vidmap[msf.id2], m_vidmap[msf.id3]);
        inedges.put_inner(m_vidmap[msf.id3], m_vidmap[msf.id1]);
      }
      else if (res==2) {
        // (1,2,3) is NOT conv-hull with outverts
        inedges.put_inner(m_vidmap[msf.id1], m_vidmap[msf.id2]);
        inedges.put_inner(m_vidmap[msf.id2], m_vidmap[msf.id3]);
        inedges.put_avoid(m_vidmap[msf.id3], m_vidmap[msf.id1]);
      }
      else {
      }
    }
  }  

  // complete the inner edge list INEDGES
  for (i=0; i<m_nfmax; ++i) {
    const MSFace &msf = m_pOrigMesh->m_faces[i];
    if (m_vflag[msf.id1] && m_vflag[msf.id2] && m_vflag[msf.id3]) {
    }
    else if (m_vflag[msf.id1] && m_vflag[msf.id2]) {
      inedges.put_inner(m_vidmap[msf.id1], m_vidmap[msf.id2]);
    }
    else if (m_vflag[msf.id2] && m_vflag[msf.id3]) {
      inedges.put_inner(m_vidmap[msf.id2], m_vidmap[msf.id3]);
    }
    else if (m_vflag[msf.id3] && m_vflag[msf.id1]) {
      inedges.put_inner(m_vidmap[msf.id3], m_vidmap[msf.id1]);
    }
  }

}

/////////////////////////////////////

void TgConcSphere::calc()
{
  DisplayContext *pdl = m_pParent->m_pdl;

  int i, j;
  m_vcen = m_pFace->param.Pijk;
  m_nvmax = m_pOrigMesh->m_verts.size();
  m_nfmax = m_pOrigMesh->m_faces.size();

  //
  // pick the sliced sphere face by three planes
  //

  m_vidmap.resize(m_nvmax);
  m_vflag.resize(m_nvmax);
  for (i=0; i<m_nvmax; ++i) {
    m_vidmap[i] = -1;
    m_vflag[i] = true;
  }

  m_arcs.resize(3);
  for (i=0; i<3; ++i) {
    m_arcs[i] = m_pFace->pArc[i];
    Vector4D nij = m_arcs[i]->m_norm;
    sliceSphere(-nij, Vector4D(0,0,0));

    // handle the radial singularity
    // remove faces eaten by the adjoining concave sphere
    if (m_arcs[i]->m_bRadSngl) {
      if (m_arcs[i]->m_pSnglArc) {
        SESArc &snga = *(m_arcs[i]->m_pSnglArc);
        sliceSphere(-snga.m_norm, snga.m_vc - m_vcen);
      }
      else {
        // TO DO: IMPL for NRSGL !!!
        return;
      }
    }
  }

  SurfTgSet &tgset = m_pParent->m_pmsb->m_tgset;

  // collect verteces inside the three planes
  for (i=0; i<m_nvmax; ++i) {
    if (!m_vflag[i]) continue;
    MSVert msv = m_pOrigMesh->m_verts[i];
    msv.x += (float) m_vcen.x();
    msv.y += (float) m_vcen.y();
    msv.z += (float) m_vcen.z();
    int newid = tgset.addVertex(msv);
    m_vidmap[i] = newid;
    // showVertID(pdl, newid);
  }
  
  ///////////////////////////////////////

  // OUTVERTS list holds a set of the outmost verteces (of toric arcs)
  std::list<int> outverts;
  std::list<int> outverts2;
  for (i=0; i<3; ++i) {
    const std::vector<int> &vtmp = m_arcs[i]->m_verts;
    if (m_arcs[i]->m_pSnglArc) {
      int iii=0;
      for (j=1; j<=m_arcs[i]->m_nSngSpi; ++j) {
        //MB_DPRINTLN("outverts; %d", vtmp[j]);
        outverts.push_back(vtmp[j]);
        outverts2.push_back(vtmp[j]);
        //tgset.drawIndex(pdl, vtmp[j], iii);
        ++iii;
      }

      SESArc &snga = *(m_arcs[i]->m_pSnglArc);
      const std::vector<int> &vsng = snga.m_verts;
      const int nvsgn =  vsng.size();
      for (j=1; j<nvsgn-1; ++j) {
        //MB_DPRINTLN("outverts; %d", vsng[j]);
        int index = vsng[j];
        outverts.push_back(index);
        outverts2.push_back(index);
        //tgset.drawIndex(pdl, index, iii);
        ++iii;
      }

      for (j=m_arcs[i]->m_nSngSpi+1; j<vtmp.size(); ++j) {
        //MB_DPRINTLN("outverts; %d", vtmp[j]);
        outverts.push_back(vtmp[j]);
        outverts2.push_back(vtmp[j]);
        //tgset.drawIndex(pdl, vtmp[j], iii);
        ++iii;
      }
    }
    else {
      for (j=1; j<vtmp.size(); ++j) {
        //MB_DPRINTLN("outverts; %d", vtmp[j]);
        outverts.push_back(vtmp[j]);
        outverts2.push_back(vtmp[j]);
      }
    }

  }

  // collect faces inside the three planes,
  // and extract the verge verteces list
  VgEdgeList inedges;

  makeInEdges(inedges, outverts, false);

  // convert to the inner edge to a simple list
  std::list<int> inverts;
  inedges.getVerts(inverts);

  VgEdgeSet procedges;

  {
    VgEdgeList::iterator iter = inedges.begin();
    for (; iter!=inedges.end(); ++iter) {
      procedges.put_inner(iter->first, iter->second);
      //MB_DPRINTLN("in %d,%d", iter->first, iter->second);
    }
  }

  {
    pdl->setLighting(false);
    pdl->setLineWidth(3.0);
    pdl->startLineStrip();
    pdl->color(0,0,1);
    
    std::list<int>::const_iterator iter = outverts.begin();
    for (; iter!=outverts.end(); ++iter) 
      pdl->vertex(tgset.getVertex(*iter));
    pdl->vertex(tgset.getVertex(* (outverts.begin()) ));
    pdl->end();
    pdl->setLineWidth(1.0);
    pdl->setLighting(true);
  }


/* {
pdl->setLighting(false);
pdl->setLineWidth(3.0);
pdl->startLines();
pdl->color(0,0,1);

    VgEdgeList::iterator iter = inedges.begin();
    for (; iter!=inedges.end(); ++iter) {
      pdl->vertex(tgset.getVertex(iter->first));
      pdl->vertex(tgset.getVertex(iter->second));
    }
pdl->end();
pdl->setLineWidth(1.0);
pdl->setLighting(true);
  }
*/
/*  {
pdl->setLighting(false);
pdl->setLineWidth(0.5);
pdl->startLines();
pdl->color(1,1,0);
Vector4D dv(0,0,0.01);
    VgEdgeList::iterator iter = inedges.avoid_list.begin();
    for (; iter!=inedges.avoid_list.end(); ++iter) {
      pdl->vertex(tgset.getVertex(iter->first)+dv);
      pdl->vertex(tgset.getVertex(iter->second)+dv);
    }
pdl->end();
pdl->setLineWidth(1.0);
pdl->setLighting(true);
  }
*/
  
  ///////////////////////////////////////
  // Make the outmost contour segment list "PROCEDGES"
  // from the arcs of the toric faces
  
  {
    /*
    for (i=0; i<3; ++i) {
      const std::vector<int> &verts = m_arcs[i]->m_verts;
      // traverse from "1" to avoid duplication of the terminal verts
      for (j=1; j<verts.size(); ++j) {
        //if (vcpy[i].at(j)<0) continue;
        //showVertID(pdl, verts[j]);
        inverts.push_back(verts[j]);
        //MB_DPRINTLN("%d", verts[j]);
      }
    }
     */
    {
      std::list<int>::const_iterator iter = outverts2.begin();
      for (; iter!=outverts2.end(); ++iter) {
        inverts.push_back(*iter);
      }
    }
    
    int idpre = outverts.back();
    std::list<int>::const_iterator iter = outverts.begin();
    for (; iter!=outverts.end(); ++iter) {
      //outedges.put_outer(idpre, *iter);
      procedges.put(idpre, *iter);
      idpre = *iter;
    }
  }
  
// return;
  ///////////////////////////////////////
  // Start padding between outmost and inner contours

  //MB_DPRINTLN("Processing start:");
  for (int ixxx=0; ixxx<10000; ixxx++) {
    if (procedges.size()<=0) {
      //MB_DPRINTLN("EOL reached");
      break;
    }

    VgEdgeSet::iterator iter = procedges.begin();
    VgEdge vedg = *iter;
    procedges.erase(iter);
    //MB_DPRINTLN("*** pending: %d", vv.size());

    int id0 = vedg.first;
    int id1 = vedg.second;
    int imin=-1;

    std::list<int>::iterator ii = inverts.begin();
    for (; ii!=inverts.end(); ++ii) {
      int id2 = *ii;
      if (id2==id0 || id2==id1) {
        continue;
      }
      if (chkConvHull(id2, id1, id0, inverts)) {
        imin = id2;
        break;
      }
    }
      
    if (imin>=0) {
      // MB_DPRINTLN("TRIG: (%d, %d, %d)", id0, id1, imin);
      tgset.addFace(id0, id1, imin);
      // procedges.put(id1, id0);
      if (!procedges.put(id0, imin)) break;
      if (!procedges.put(imin, id1)) break;
    }
    else {
      LOG_DPRINTLN("ERR_outer2: conv hull not found for OUTER %d, %d", id0, id1);
      break;
    }
  }

  if (procedges.size()>0) {
    MB_DPRINTLN("FATAL ERROR: padding is incomplete");
    MB_DPRINTLN("  Edge remains: %d", procedges.size());
    MB_DPRINTLN("  inner remains: %d", procedges.m_inner.size());
  }

//pdl->color(1, 1, 0);
//pdl->setLineWidth(1.0);
//pdl->setLighting(true);

}

////////////////////////////////////////

void TgCnvxSphere::calc()
{
  DisplayContext *pdl = m_pParent->m_pdl;

  const MSAtomArray &atoms = m_pParent->m_pmsb->getAtomArray();
  SurfTgSet &tgset = m_pParent->m_pmsb->m_tgset;
  const RSEdgeList &rsedges = m_pVert->m_edges;

  int i, j;
  m_vidx = m_pVert->idx;
  m_vcen = atoms[m_vidx].pos;
  m_nvmax = m_pOrigMesh->m_verts.size();
  m_nfmax = m_pOrigMesh->m_faces.size();

  //
  // pick the sliced sphere face by planes
  //

  m_vidmap.resize(m_nvmax);
  m_vflag.resize(m_nvmax);
  for (i=0; i<m_nvmax; ++i) {
    m_vidmap[i] = -1;
    m_vflag[i] = true;
  }

  RSEdgeList::const_iterator iter = rsedges.begin();
  m_arcs.resize(rsedges.size());
  for (i=0; iter!=rsedges.end(); ++iter, ++i) {
    const RSEdge *pE = *iter;
    int ndir;
    if ( pE->idx[0] == m_vidx )
      ndir = 0;
    else
      ndir = 1;
    MB_ASSERT(pE->idx[ndir] == m_vidx);

    SESArc *pArc = pE->pArc[ndir];
    const Vector4D nij = pArc->m_norm;
    sliceSphere(nij, pArc->m_vc - m_vcen);
    m_arcs[i] = pArc;

    //MB_DPRINTLN("edge (%d->%d) ndir=%d", pE->idx[0], pE->idx[1], ndir);
    //MB_DPRINTLN("Arc (%d->%d) ndir=%d", pArc->m_idx0, pArc->m_idx1, ndir);
/*
pdl->setLighting(false);
pdl->setLineWidth(0.5);
pdl->startLines();

pdl->color(1,0,0);
pdl->vertex(pArc->m_vc);
pdl->vertex(pArc->m_v0);

pdl->color(0,0,1);
pdl->vertex(pArc->m_vc);
pdl->vertex(pArc->m_v1);

pdl->color(1,0,1);
pdl->vertex(pArc->m_vc);
pdl->vertex(pArc->m_vc + nij);

pdl->end();
pdl->setLineWidth(1.0);
pdl->setLighting(true);
*/
  }
  
  // collect verteces inside the three planes
  for (i=0; i<m_nvmax; ++i) {
    if (!m_vflag[i]) continue;
    if (m_arcs.size()>2) {
      if (!sliceSphereCnvx(i)) {
        m_vflag[i] = false;
        continue;
      }
    }
    
//m_vflag[i] = true;
    MSVert msv = m_pOrigMesh->m_verts[i];
    msv.x += (float) m_vcen.x();
    msv.y += (float) m_vcen.y();
    msv.z += (float) m_vcen.z();
    int newid = tgset.addVertex(msv);
    m_vidmap[i] = newid;

/*
  pdl->setLighting(false);
  LString str = LString::format("%d", i);
  pdl->color(1,1,1);
  pdl->drawString(tgset.getVertex(newid), str);
  pdl->setLighting(true);
*/
  }

  ///////////////////////////////////////

  // OUTVERTS list holds a set of the outmost verteces (of toric arcs)
  std::list<int> outverts;
  VgEdgeSet procedges;

  for (i=0; i<m_arcs.size(); ++i) {
    const std::vector<int> &vtmp = m_arcs[i]->m_verts;
    //MB_DPRINTLN("arc %d", i);
    int idpre = vtmp[0];
    for (j=1; j<vtmp.size(); ++j) {
      //showVertID(pdl, vtmp[j]);
      outverts.push_back(vtmp[j]);

      //MB_DPRINTLN(" oe: %d, %d", idpre, vtmp[j]);
      procedges.put(idpre, vtmp[j]);
      idpre = vtmp[j];
    }
  }

/*
  for (i=0; i<m_nfmax; ++i) {
    const MSFace &msf = m_pOrigMesh->m_faces[i];
    if (m_vflag[msf.id1] && m_vflag[msf.id2] && m_vflag[msf.id3]) {
      // the face msf is possibly SES
      int nid1 = m_vidmap[msf.id1];
      int nid2 = m_vidmap[msf.id2];
      int nid3 = m_vidmap[msf.id3];

      // (1,2,3) is conv-hull with outverts
      tgset.addFace(nid1, nid2, nid3);
    }
  }
  return;
*/
  
  // collect faces inside the three planes,
  // and extract the verge verteces list
  VgEdgeList inedges;
  makeInEdges(inedges, outverts, true);

/*
  {
pdl->setLighting(false);
pdl->setLineWidth(1.0);
pdl->startLines();
pdl->color(0,0,1);

    VgEdgeList::iterator iter = inedges.begin();
    for (; iter!=inedges.end(); ++iter) {
      pdl->vertex(tgset.getVertex(iter->first));
      pdl->vertex(tgset.getVertex(iter->second));
    }
pdl->end();
pdl->setLineWidth(1.0);
pdl->setLighting(true);
  }

  {
pdl->setLighting(false);
pdl->setLineWidth(0.5);
pdl->startLines();
pdl->color(1,1,0);
Vector4D dv(0,0,0.01);
    VgEdgeList::iterator iter = inedges.avoid_list.begin();
    for (; iter!=inedges.avoid_list.end(); ++iter) {
      pdl->vertex(tgset.getVertex(iter->first)+dv);
      pdl->vertex(tgset.getVertex(iter->second)+dv);
    }
pdl->end();
pdl->setLineWidth(1.0);
pdl->setLighting(true);
  }
*/
  
//return;
  
  //////////////////////////////////////
  // Setup the internal verteces INVERTS,
  // And setup inner edges for PROCEDGES

  std::list<int> inverts;
  inedges.getVerts(inverts);

  {
    VgEdgeList::iterator iter = inedges.begin();
    for (; iter!=inedges.end(); ++iter) {
      procedges.put_inner(iter->first, iter->second);
      //MB_DPRINTLN("in %d,%d", iter->first, iter->second);
    }

    for (i=0; i<m_arcs.size(); ++i) {
      const std::vector<int> &verts = m_arcs[i]->m_verts;
      // traverse from "1" to avoid duplication of the terminal verts
      for (j=1; j<verts.size(); ++j)
        inverts.push_back(verts[j]);
    }
  }

  ///////////////////////////////////////
  // Start padding between outmost and inner contours

  // MB_DPRINTLN("Processing start:");
  for (int ixxx=0; ixxx<10000; ++ixxx) {
    if (procedges.size()<=0) {
      // MB_DPRINTLN("EOL reached");
      break;
    }

    VgEdgeSet::iterator iter = procedges.begin();
    VgEdge vedg = *iter;
    procedges.erase(iter);
    //MB_DPRINTLN("*** pending: %d", vv.size());

    int id0 = vedg.first;
    int id1 = vedg.second;
    int imin = searchCHVert(id0, id1, inverts);

    if (imin>=0) {
      // MB_DPRINTLN("TRIG: (%d, %d, %d)", id0, id1, imin);
      tgset.addFace(id0, id1, imin);
      // procedges.put(id1, id0);
      if (!procedges.put(id0, imin)) break;
      if (!procedges.put(imin, id1)) break;
    }
    else {
      LOG_DPRINTLN("ERR_outer2: conv hull not found for OUTER %d, %d", id0, id1);
      break;
    }
  }

  if (procedges.size()>0) {
    LOG_DPRINTLN("FATAL ERROR: padding is incomplete");
    LOG_DPRINTLN("  VID: %d, AID: %d", m_vidx, atoms[m_vidx].aid);
    LOG_DPRINTLN("  Edge remains: %d", procedges.size());
    LOG_DPRINTLN("  inner remains: %d", procedges.m_inner.size());
  }
}

bool TgCnvxSphere::sliceSphereCnvx(int indv)
{
  int i;
  const int narcs = m_arcs.size();
  Vector4D om, m;
  const Vector4D vx = m_pOrigMesh->m_verts[indv].v3d();

  for (i=0; i<narcs; ++i) {
    SESArc *parc = m_arcs[i];
    const Vector4D cv0 = parc->m_v0 - m_vcen;
    const Vector4D cv1 = parc->m_v1 - m_vcen;
    om = (cv0+cv1).normalize();

    Vector4D vn_xm = vx.cross(om);
    double dxm = vn_xm.length();
    if (dxm<0.01) {
      if (i<narcs-1) {
        continue;
      }
    
      LOG_DPRINTLN("WARNING: sliceSphereCnvx unstable (dxm=%f<0.01)", dxm);
    }
    
    m = vn_xm.scale(1.0/dxm);
    break;
  }
  
  double dmin = 1.0e100;
  SESArc *parc_min = NULL;
  Vector4D oc_min, n_min;
  for (i=0; i<narcs; ++i) {
    SESArc *parc = m_arcs[i];
    const Vector4D cv0 = parc->m_v0 - m_vcen;
    const Vector4D cv1 = parc->m_v1 - m_vcen;
    Vector4D n = (cv0.cross(cv1)).normalize();

    Vector4D n0 = n.cross(cv0);
    Vector4D n1 = cv1.cross(n);

    //

    Vector4D oc0 = (m.cross(n)).normalize();
    Vector4D oc1 = -oc0;

//    if (indv==24) {
//      drawArc(m_pParent->m_pdl, m_vcen, parc->m_v0, n, cv0.angle(cv1));
//    }
    
    Vector4D oc;
    if (oc0.dot(n0)>0 && oc0.dot(n1)>0) {
      oc = oc0;
    }
    else if (oc1.dot(n0)>0 && oc1.dot(n1)>0) {
      oc = oc1;
    }
    else {
      // no crossing point with parc!!
      continue;
    }

    const double d = oc.angle(vx);
    if (d<dmin) {
      dmin = d;
      parc_min = parc;
      oc_min = oc;
      n_min = n;
    }

//    if (indv==24) {
//      const Vector4D vv0 = oc.scale(m_pOrigMesh->m_rad)+m_vcen;
//      const Vector4D vnn = oc.cross(vx).normalize();
//      m_pParent->m_pdl->sphere(0.05, vv0);
//      drawArc(m_pParent->m_pdl, m_vcen, vv0, vnn, d);
//    }

  }
  
  // MB_DPRINTLN("d_min: %f", qlib::toDegree(dmin));

  if (parc_min==NULL) {
    // completely no crossing point with arcs
    // this must not happen
    LOG_DPRINTLN("fatal error");
    MB_ASSERT(false);
    return false;
  }

  const double det2 = n_min.dot(vx);
  if (det2<0.0)
    return false;

/*
  const Vector4D nij = parc_min->m_norm;
  const Vector4D del = parc_min->m_vc - m_vcen;
  const double det = nij.dot(vx - del);
  if (det<0.001)
    return false;
 */
  return true;
}

#endif

