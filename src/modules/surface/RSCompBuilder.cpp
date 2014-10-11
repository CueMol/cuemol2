// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: RSCompBuilder.cpp,v 1.3 2011/02/12 13:51:19 rishitani Exp $

#include <common.h>
#include "surface.hpp"

#ifdef SURF_BUILDER_TEST

#include "RSCompBuilder.hpp"
#include "SurfTgSet.hpp"
#include <gfx/DisplayContext.hpp>

using namespace surface;
using gfx::DisplayContext;
using qlib::Matrix3D;

RSCompBuilder::RSCompBuilder(MolSurfBuilder *pmsb)
     :  m_pmsb(pmsb)
{
  m_pdl = pmsb->getDC();
  m_rprobe = m_pmsb->m_rprobe;
  m_rmax = m_pmsb->m_rmax;
}

RSCompBuilder::~RSCompBuilder()
{
}

void RSCompBuilder::build()
{
  m_pdl->setLineWidth((float)1.5);

  m_nTrtEdg = 0;
  m_nRecLev = 0;

  RSFace *pF1 = findFirstFace();

  if (pF1!=NULL) {
    //treatEdgeHelper(pF1, 0);
    //treatFace(pF1);
    treatFace(pF1);
  }

  MB_DPRINTLN("RSCompBuild> %d faces, %d edges, created.",
              m_rscomp.m_faceset.size(), m_rscomp.m_edges.size());

  chkEdgeEaten();
  drawRSCompFaces(m_pdl);

}

void RSCompBuilder::drawRSCompFaces(DisplayContext *pdl)
{
  RSFaceSet::const_iterator iter = m_rscomp.m_faceset.begin();
  for (; iter!=m_rscomp.m_faceset.end(); ++iter) {

    const RSFace *pF = *iter;

/*
    if (!pF->bNonrSngl) {
      if (!pF->pE[0]->bRadSngl &&
          !pF->pE[1]->bRadSngl &&
          !pF->pE[2]->bRadSngl)
        continue;
    }
 */  
    pdl->setLighting(true);
    drawPlane(pF->idx[0], pF->idx[1], pF->idx[2], pdl);

/*
    pdl->setLighting(false);
    LString msg = LString::format("%d,%d,%d", pF->idx[0], pF->idx[1], pF->idx[2]);
    pdl->drawString(pF->param.Pijk, msg);
*/
    /*
    pdl->startLineStrip();
    pdl->color(1,0,0);
    pdl->vertex(pF->param.Pijk);
    pdl->vertex(pF->param.Bijk);
    pdl->vertex(pF->param.Tij);
    pdl->vertex(pF->param.Pijk);
    pdl->end();

    pdl->startLineStrip();
    pdl->color(0,1,0);
    pdl->vertex(pF->param.Pijk);
    pdl->vertex(pF->param.Bijk);
    pdl->vertex(pF->param.Tik);
    pdl->vertex(pF->param.Pijk);
    pdl->end();
    */
    

    // RSFaceComp::tuple tp(pF);
    // tp.canonicalize();
    // MB_DPRINTLN(" < (%d,%d,%d)", tp.i, tp.j, tp.k);
  }

  
}

static void drawArc(DisplayContext *pdl,
                    const Vector4D &vcen,
                    const Vector4D &v0,
                    const Vector4D &norm,
                    double theta)
{
  const double rad = (v0-vcen).length();
  const Vector4D e0 = (v0-vcen).normalize();
  const Vector4D &e2 = norm;
  const Vector4D e1 = e2.cross(e0);

  Matrix3D xfm;
  xfm.aij(1,1) = e0.x();
  xfm.aij(2,1) = e0.y();
  xfm.aij(3,1) = e0.z();
  
  xfm.aij(1,2) = e1.x();
  xfm.aij(2,2) = e1.y();
  xfm.aij(3,2) = e1.z();
  
  xfm.aij(1,3) = e2.x();
  xfm.aij(2,3) = e2.y();
  xfm.aij(3,3) = e2.z();

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
    xfm.xform(tv);
    tv += vcen;
    pdl->vertex(tv);
    ith += dth;
  }
  pdl->color(1,0,0);
  pdl->vertex(vcen);
  pdl->end();
  pdl->setLighting(true);
}


////////////////////////////////////////////////////////////////////////////
// bootstrap routines

RSFace *RSCompBuilder::findFirstFace()
{
  int i, nxmin, nymin, nzmin;
  const MSAtomArray &atoms = m_pmsb->getAtomArray();

  // TO DO: try to search Y,Z axes

  Vector4D min(1.0e10, 1.0e10, 1.0e10);
  for (i=0; i<atoms.size(); ++i) {
    const Vector4D &pos = atoms[i].pos;
    if (pos.x() < min.x()-atoms[i].rad) {
      min.x() = pos.x();
      nxmin = i;
    }
    if (pos.y() < min.y()-atoms[i].rad) {
      min.y() = pos.y();
      nymin = i;
    }
    if (pos.z() < min.z()-atoms[i].rad) {
      min.z() = pos.z();
      nzmin = i;
    }
  }

  m_pdl->color(1.0, 1.0, 0.0);
  TorusParam tprm_12;

  int ind1 = nxmin;
  //int ind1 = nymin;
  if (!findSecondVertex(ind1, 0, tprm_12)) {
    return NULL;
  }

  // find third vertex
  ConcSphParam cs123;
  if (!findThirdVertex(tprm_12, cs123)) {
    return NULL;
  }

//  m_pdl->color(1.0, 0.0, 0.0);
//  m_pdl->sphere(0.1, atoms[cs123.aidx_i].pos);
//  m_pdl->sphere(0.15, atoms[cs123.aidx_j].pos);
//  m_pdl->sphere(0.2, atoms[cs123.aidx_k].pos);

  //m_pdl->color(1.0, 1.0, 0.0);
  //m_pdl->sphere(0.2, cs123.Pijk);
  //drawPlane(cs123, m_pdl);

  RSFace *pF = m_rscomp.addFace(cs123.aidx_i, cs123.aidx_j, cs123.aidx_k);
  pF->param = cs123;

  setupFaceArcs(pF);

  return pF;
}

bool RSCompBuilder::findSecondVertex(int ind_1st, int axisid,
                                     TorusParam &rtprm2)
{
  const MSAtomArray &atoms = m_pmsb->getAtomArray();
  const Vector4D &pos_1st = atoms[ind_1st].pos;
  double rad_1st = atoms[ind_1st].rad;

  // find second atom

  int nm = m_pmsb->findAround(m_ibuf, pos_1st,
                          m_rprobe*2.0+rad_1st+m_rmax);
  
  if (nm==0) return false;

  Vector4D ex;
  switch (axisid) {
  case 0:
    ex = Vector4D(1,0,0);
    break;
  case 1:
    ex = Vector4D(0,1,0);
    break;
  case 2:
    ex = Vector4D(0,0,1);
    break;
  default:
    ex = Vector4D(1,0,0);
    break;
  }

  int ii=0;
  double xmin = 1.0e100;
  TorusParam tprm;
  
  for (; ii<nm; ++ii) {
    int j = m_ibuf[ii];
    if (j==ind_1st) continue;

    // calc torus params for (1,i)
    tprm.reinit(ind_1st, j, m_rprobe, atoms);
    if (!tprm.calc()) {
      MB_DPRINTLN("Find2nd: calc torus param for (%d,%d) failed", ind_1st, j);
      continue;
    }
    
    // const double d1i = distance(atoms[i].pos, pos_1st);
    if (tprm.dij > m_rprobe*2.0+atoms[j].rad+rad_1st) {
      MB_DPRINTLN("culled atom: %d", j);
      continue;
    }

    Vector4D cr = (ex.cross(tprm.Uij)).normalize();
    Vector4D vv = (cr.cross(tprm.Uij)).normalize();
    vv = vv.scale(tprm.rij);

    double xp = (tprm.Tij+vv).x();
    double xm = (tprm.Tij-vv).x();
    if (xp<xm)
      xm = xp;

    if (xm<xmin) {
      // ind2 = i;
      xmin = xm;
      rtprm2 = tprm;
    }
  }

  /*{
    m_pmsb->drawDisk(rtprm2.Tij, rtprm2.Uij, rtprm2.rij);
    
    Vector4D cr = (ex.cross(rtprm2.Uij)).normalize();
    Vector4D vv = (cr.cross(rtprm2.Uij)).normalize();
    vv = vv.scale(rtprm2.rij);
    m_pdl->sphere(0.1, rtprm2.Tij+vv);
    m_pdl->sphere(0.1, rtprm2.Tij-vv);
  }*/

  return true;
}


bool RSCompBuilder::findThirdVertex(const TorusParam &tprm_12,
                                    ConcSphParam &rcsprm_123)
{
  const MSAtomArray &atoms = m_pmsb->getAtomArray();

  // get a list of possible atoms to collide with a probe
  m_nbx = m_pmsb->findAround(m_ibuf, tprm_12.Tij, m_rprobe + tprm_12.rij + m_rmax + F_EPS4);
  if (m_nbx<1)
    return false; // isolated RS Component

  int iter = 0, j = 1;
  int aidx1 = tprm_12.aidx_i;
  int aidx2 = tprm_12.aidx_j;

  TorusParam tprm_13;
  rcsprm_123.init_ij(tprm_12);

  for (; iter<m_nbx; ++iter) {
    int k = m_ibuf[iter];
    if ( k==aidx1 || k==aidx2 ) continue;

    tprm_13.reinit(aidx1, k, m_rprobe, atoms);
    if (!tprm_13.calc()) {
      // MB_DPRINTLN("Find3rd: calc torus param for (%d,%d) failed", aidx1, k);
      continue;
    }

    rcsprm_123.reinit_ik(tprm_13);

    if (!rcsprm_123.calc()) {
      // MB_DPRINTLN("Find3rd: calc concave sphare param for (%d,%d,%d) failed", aidx1,aidx2, k);
      continue;
    }

    if (collCheckProbePartial(m_ibuf, m_nbx, rcsprm_123.Pijk_p, aidx1, aidx2, k)) {
      rcsprm_123.Pijk = rcsprm_123.Pijk_p;
      return true;
    }

    if (collCheckProbePartial(m_ibuf, m_nbx, rcsprm_123.Pijk_m, aidx1, aidx2, k)) {
      rcsprm_123.Pijk = rcsprm_123.Pijk_m;
      rcsprm_123.invert();
      return true;
    }
    
  } // for iter
  
  // no concave sphere is found
  MB_DPRINTLN("Find3rd: no concave sphere is found for (%d,%d)", aidx1,aidx2);
  return false;
}

bool RSCompBuilder::collCheckProbePartial(const std::vector<int> &ibuf, int nlen, const Vector4D &prpos,
                                          int idxi, int idxj, int idxk)
{
  int i;
  //const double rpsq = m_rprobe*m_rprobe;

  for (i=0; i<nlen; ++i) {
    int idx = ibuf[i];
    if (idx==idxi || idx==idxj || idx==idxk) continue;
    const Vector4D &a_i = m_pmsb->getAtom(idx).pos;
    double r_i = m_pmsb->getAtom(idx).rad;

    const double dist = (a_i - prpos).length();
    if (r_i + m_rprobe - dist>0.0)
      return false;

    /*
    const double sqdist = (a_i - prpos).sqlen();
    const double chk = rpsq + r_i*(r_i+2.0*m_rprobe) - sqdist;
    if (chk>0.0)
      return false; // collision
     */
  }

  // no collision is found
  return true;
}


///////////////////////////////////////////////////////////////////
//
// SESArc setup routines
//

void RSCompBuilder::setupFaceArcs(RSFace *pFace)
{
  const MSAtomArray &atoms = m_pmsb->getAtomArray();

  const Vector4D &vc = pFace->param.Pijk;

  const double r_i = atoms[pFace->idx[0]].rad;
  const Vector4D &a_i = atoms[pFace->idx[0]].pos;

  const double r_j = atoms[pFace->idx[1]].rad;
  const Vector4D &a_j = atoms[pFace->idx[1]].pos;

  const double r_k = atoms[pFace->idx[2]].rad;
  const Vector4D &a_k = atoms[pFace->idx[2]].pos;

  Vector4D vpi = ( vc.scale(r_i) + a_i.scale(m_rprobe) ).scale(1.0/(r_i+m_rprobe));
  Vector4D vpj = ( vc.scale(r_j) + a_j.scale(m_rprobe) ).scale(1.0/(r_j+m_rprobe));
  Vector4D vpk = ( vc.scale(r_k) + a_k.scale(m_rprobe) ).scale(1.0/(r_k+m_rprobe));

  int idx_pi = m_pmsb->m_tgset.addVertex(vpi, (vc-a_i).normalize() );
  int idx_pj = m_pmsb->m_tgset.addVertex(vpj, (vc-a_i).normalize() );
  int idx_pk = m_pmsb->m_tgset.addVertex(vpk, (vc-a_i).normalize() );

  SESArc *pArc0 = MB_NEW SESArc;
  SESArc *pArc1 = MB_NEW SESArc;
  SESArc *pArc2 = MB_NEW SESArc;
  
  pArc0->setup(vc, idx_pi, idx_pj, m_pmsb->m_tgset);
  pArc1->setup(vc, idx_pj, idx_pk, m_pmsb->m_tgset);
  pArc2->setup(vc, idx_pk, idx_pi, m_pmsb->m_tgset);
  
  m_rscomp.addSESArc(pArc0);
  m_rscomp.addSESArc(pArc1);
  m_rscomp.addSESArc(pArc2);

  pFace->pArc[0] = pArc0;
  pFace->pArc[1] = pArc1;
  pFace->pArc[2] = pArc2;

  if (pFace->param.h_ijk < m_rprobe) {
    Vector4D base = pFace->param.Bijk;

    Vector4D c1 = (a_i-base).cross(a_j-base);
    Vector4D c2 = (a_j-base).cross(a_k-base);
    Vector4D c3 = (a_k-base).cross(a_i-base);

    double d12 = c1.dot(c2);
    double d23 = c2.dot(c3);
    double d31 = c3.dot(c1);

    if (d12>0&&d23>0&&d31>0)
      pFace->bNonrSngl = true;
    else if (d12<0&&d23<0&&d31<0)
      pFace->bNonrSngl = true;
  }
}

void RSCompBuilder::setupEdgeArcs(RSEdge *pEdge)
{
  const MSAtomArray &atoms = m_pmsb->getAtomArray();

  const double r_i = atoms[pEdge->idx[0]].rad;
  const Vector4D &a_i = atoms[pEdge->idx[0]].pos;
  const double r_j = atoms[pEdge->idx[1]].rad;
  const Vector4D &a_j = atoms[pEdge->idx[1]].pos;
  const Vector4D &Tij = pEdge->param.Tij;

  const Vector4D cij_i =
    ( Tij.scale(r_i) + a_i.scale(m_rprobe) ).scale(1.0/(r_i+m_rprobe));
  const Vector4D cij_j =
    ( Tij.scale(r_j) + a_j.scale(m_rprobe) ).scale(1.0/(r_j+m_rprobe));

  SESArc *parc12 = pEdge->pF[0]->pArc[ pEdge->ford[0] ];
  SESArc *parc43 = pEdge->pF[1]->pArc[ pEdge->ford[1] ];

  const int idx1 = parc12->m_idx0;
  const int idx2 = parc12->m_idx1;
  const int idx3 = parc43->m_idx1;
  const int idx4 = parc43->m_idx0;

  SESArc *pArc31 = MB_NEW SESArc;
  SESArc *pArc24 = MB_NEW SESArc;

  pArc31->setup2(cij_i, idx3, idx1, m_pmsb->m_tgset);
  pArc24->setup2(cij_j, idx2, idx4, m_pmsb->m_tgset);

  pArc31->m_norm = -pEdge->param.Uij;
  pArc31->m_th = pEdge->param.phi_s;
  pArc24->m_norm = pEdge->param.Uij;
  pArc24->m_th = pEdge->param.phi_s;

  m_rscomp.addSESArc(pArc31);
  m_rscomp.addSESArc(pArc24);

  pEdge->pArc[0] = pArc31;
  pEdge->pArc[1] = pArc24;
}

////////////////////////////////////////////////////////////////

/**
  Treat face and build RS-Components (without recursion)
 */
void RSCompBuilder::treatFace(RSFace *pFace)
{
  int nord;
  RSFace *pTgtFce;
  RSFace *pFNew;
  typedef std::pair<RSFace *, int> l_tuple;
  std::list<l_tuple> taskq;

  taskq.push_back(l_tuple(pFace, 1));
  taskq.push_back(l_tuple(pFace, 2));

  while (taskq.size()>0) {
    pTgtFce = taskq.front().first;
    nord = taskq.front().second;
    taskq.pop_front();

    if (!pTgtFce->edge[nord]) {
      pFNew = treatEdge(pTgtFce, nord);
      
      if (pFNew!=NULL) {
        // pTgtFce->edge[nord] = true;
        
        if (!pFNew->edge[0])
          taskq.push_back(l_tuple(pFNew, 0));
        
        if (!pFNew->edge[1])
          taskq.push_back(l_tuple(pFNew, 1));
        
        if (!pFNew->edge[2])
          taskq.push_back(l_tuple(pFNew, 2));
      }
    }
  }
}

static
double calc_phis(const Vector4D &Uijk, const Vector4D &Uijl, const Vector4D &Uij)
{
  const double det = ( Uijk.cross(Uijl) ).dot(Uij);
  const double cosphs = Uijk.dot(Uijl);
  if (det>=0.0) {
    return ::acos(cosphs);
  }
  else {
    return 2*M_PI - ::acos(cosphs);
  }
}

RSFace *RSCompBuilder::treatEdge(RSFace *pFace, int nord)
{
  MSAtomArray &atoms = m_pmsb->getAtomArray();

  int aidx1 = pFace->idx[nord];
  int aidx2 = pFace->idx[(nord+1)%3];
  int aidx3 = pFace->idx[(nord+2)%3];

  // MB_ASSERT(pFace->pEdge[nord]==NULL);
  // MB_DPRINTLN("TreatEdge %d-->%d", iv1, iv2);

  TorusParam tp12(aidx1, aidx2, m_rprobe, atoms);
  if (!tp12.calc()) {
    // fatal error!!
    MB_DPRINTLN("TreatEdge: calc torus param for (%d,%d) failed", aidx1, aidx2);
    return NULL;
  }

  /*
  TorusParam tp13(aidx1, aidx3, m_rprobe, atoms);
  if (!tp13.calc()) {
    // fatal error!!
    MB_DPRINTLN("TreatEdge: calc torus param for (%d,%d) failed", aidx1, aidx3);
    return NULL;
  }
   */

  ConcSphParam csp123;
  csp123 = pFace->param;
  /*
  csp123.init(tp12, tp13);
  if (!csp123.calc()) {
    MB_DPRINTLN("TreatEdge: calc concave sphere param for (%d,%d,%d) failed", aidx1,aidx2,aidx3);
    return NULL;
  }

  csp123.Pijk = csp123.Pijk_p;
   */
  Vector4D nijk = ( (csp123.Pijk - tp12.Tij).cross(tp12.Uij) ).scale(1.0/tp12.rij);
  
  //////////////////////////////

  // get a list of possible atoms to collide with a probe
  m_nbx = m_pmsb->findAround(m_ibuf, tp12.Tij, m_rprobe + tp12.rij + m_rmax + F_EPS4);
  if (m_nbx<1) {
    MB_DPRINTLN("TreatEdge: isolated edge (%d,%d)", aidx1, aidx2);
    return NULL; // isolated RS Component
  }
  
  TorusParam tp14;
  ConcSphParam csp124, csp214min;
  csp124.init_ij(tp12);

  double phis_min = 1.0e10;
  int l_min = -1, iter;

  for (iter=0; iter<m_nbx; ++iter) {
    int l = m_ibuf[iter];
    if ( l==aidx1 || l==aidx2 || l==aidx3 ) continue;

    tp14.reinit(aidx1, l, m_rprobe, atoms);
    if (!tp14.calc()) {
      // MB_DPRINTLN("TreatEdge: calc torus param for (%d,%d) failed", aidx1, l);
      continue;
    }

    csp124.reinit_ik(tp14);

    if (!csp124.calc()) {
      // MB_DPRINTLN("TreatEdge: calc concave sphare param for (%d,%d,%d) failed", aidx1,aidx2, l);
      continue;
    }

    if (collCheckProbePartial(m_ibuf, m_nbx, csp124.Pijk_m, aidx1, aidx2, l)) {
      const Vector4D &Pijl = csp124.Pijk_m;
      // const Vector4D &Pijl = csp124.Pijk_p;
      Vector4D nijl = ( (Pijl - tp12.Tij).cross(tp12.Uij) ).scale(1.0/tp12.rij);
      double phis = calc_phis(nijk, nijl, tp12.Uij);

      if (phis < phis_min) {
        phis_min = phis;
        l_min = l;
        csp124.Pijk = csp124.Pijk_m;
        csp124.invert();
        csp214min = csp124;
      }
    }
  } // for iter

  if (l_min<0) {
    if (!collCheckProbePartial(m_ibuf, m_nbx, csp123.Pijk_p, aidx1, aidx2, aidx3)) {
      MB_DPRINTLN("TreatEdge: phis_min not found for (%d,%d,%d)", aidx1,aidx2,aidx3);
      return NULL;
    }

    const Vector4D &Pijl = csp123.Pijk_p;
    Vector4D nijl = ( (Pijl - tp12.Tij).cross(tp12.Uij) ).scale(1.0/tp12.rij);
    phis_min = calc_phis(nijk, nijl, tp12.Uij);

    l_min = aidx3;
    csp124 = csp123;
    csp124.Pijk = csp123.Pijk_p;
    csp124.invert();
    csp214min = csp124;

    MB_DPRINTLN("*** self intr (%d,%d,%d).", aidx2, aidx1, l_min);
  }

  MB_DPRINTLN("RSEdge (%d,%d) created.", aidx1, aidx2);
  // MB_DPRINTLN("phis_min: %f", qlib::toDegree(phis_min));

  /*{
    //Vector4D Vij = csp214min.a_j - csp214min.a_i;
    Vector4D Vij = atoms[aidx1].pos - atoms[aidx2].pos;
    //Vector4D Vjk = csp214min.a_k - csp214min.a_j;
    Vector4D Vjk = atoms[l_min].pos - atoms[aidx1].pos;
    Vector4D nijk = (Vij.cross(Vjk)).normalize();
    const double det = nijk.dot(csp214min.Uijk);
    if (det<0.0) {
      MB_DPRINTLN("*** inconsistent (%d,%d,%d)", aidx2, aidx1, l_min);
    }
  }*/

  RSFace *pNextF;
  bool bNew = false;
  pNextF = m_rscomp.findFace(aidx2, aidx1, l_min);
  if (pNextF==NULL) {
    bNew = true;
    pNextF = m_rscomp.addFace(aidx2, aidx1, l_min);
    MB_DPRINTLN("RSFace (%d,%d,%d) created.", aidx2, aidx1, l_min);
  }

  if (bNew) {
    pNextF->param = csp214min;
    setupFaceArcs(pNextF);
  }
  
  // create new edge
  RSEdge *pNewE = m_rscomp.addEdge(aidx1, aidx2);
  pNewE->param = tp12;
  pNewE->param.phi_s = phis_min;
  pNewE->pF[0] = pFace;
  pNewE->ford[0] = nord;
  pNewE->pF[1] = pNextF;
  if (pNewE->param.rij<m_rprobe) {
    MB_DPRINTLN("Edge (%d,%d) is Radial singular", aidx1, aidx2);
    pNewE->bRadSngl = true;
  }

  int nford = 0;
  if (!bNew) {
    if (pNextF->idx[0]==aidx1)
      nford = 2;
    else if (pNextF->idx[0]==l_min)
      nford = 1;
    //else //if (pNextF->idx[0]==aidx2)
    //nford = 0;

    //MB_DPRINTLN("nford %d edge %d pE %p", nford, pNextF->edge[nford], pNextF->pE[nford]);
  }

  pNewE->ford[1] = nford;
  pNextF->edge[nford] = true;
  pNextF->pE[nford] = pNewE;
  pFace->edge[nord] = true;
  pFace->pE[nord] = pNewE;
  
  setupEdgeArcs(pNewE);

  //
  // update vertex data
  //
  if (atoms[aidx2].pVert==NULL)
    atoms[aidx2].pVert = m_rscomp.addVert(aidx2);
  atoms[aidx2].pVert->m_edges.push_back(pNewE);

  if (atoms[aidx1].pVert==NULL)
    atoms[aidx1].pVert = m_rscomp.addVert(aidx1);
  atoms[aidx1].pVert->m_edges.push_front(pNewE);

  //drawPlane(csp214min, m_pdl);
  //m_pdl->sphere(0.2, csp214min.Pijk);
  //m_pdl->cylinder(0.05, (csp214min.a_i+csp214min.a_j+csp214min.a_k).scale(1.0/3.0), csp214min.Pijk);
  //if (aidx2==69||aidx1==68||l_min==10) {
  //MB_DPRINTLN("addface (%d,%d,%d) OK", aidx2, aidx1, l_min);
  //}

  return bNew?pNextF:NULL;
}

void RSCompBuilder::chkEdgeEaten()
{
  const MSAtomArray &atoms = m_pmsb->getAtomArray();

  RSEdgeList::const_iterator iter = m_rscomp.m_edges.begin();
  const double rpsq = m_rprobe*m_rprobe;
  for (; iter!=m_rscomp.m_edges.end(); ++iter) {
    RSEdge *pE = *iter;
    if (!pE->bRadSngl) continue;

    const Vector4D &a1 = atoms[pE->idx[0]].pos;
    const Vector4D &a2 = atoms[pE->idx[1]].pos;
    const double d = (a1-a2).length();
    const Vector4D u12 = (a2-a1).normalize();

    RSFaceSet::const_iterator fiter = m_rscomp.m_faceset.begin();
    for (; fiter!=m_rscomp.m_faceset.end(); ++fiter) {
      const RSFace *pF = *fiter;
      const Vector4D &p = pF->param.Pijk;

      const double r1sq = (a1-p).sqlen();
      const double r2sq = (a2-p).sqlen();
      
      const double x = (r1sq-r2sq)/(2.0*d) + d/2.0;
      const double rssq = r1sq - x*x;
      if (rssq<0)
        continue; // no intersection
      if (rssq>rpsq)
        continue; // no intersection
      const double f = sqrt(rpsq-rssq);
      const double f1 = x-f;
      const double f2 = x+f;

      if (0<f1 && f1<d) {
        Vector4D vf1 = a1 + u12.scale(f1);

        m_pdl->setLighting(true);
        m_pdl->color(1.0, 0.0, 0.0);
        m_pdl->sphere(0.01, vf1);

        m_pdl->setLighting(false);
        m_pdl->startLines();
        m_pdl->vertex(p);
        m_pdl->vertex(vf1);
        m_pdl->end();
        m_pdl->setLighting(true);
      }
      if (0<f2 && f2<d) {
        Vector4D vf2 = a1 + u12.scale(f2);

        m_pdl->setLighting(true);
        m_pdl->color(1.0, 0.0, 0.0);
        m_pdl->sphere(0.01, vf2);

        m_pdl->setLighting(false);
        m_pdl->startLines();
        m_pdl->vertex(p);
        m_pdl->vertex(vf2);
        m_pdl->end();
        m_pdl->setLighting(true);
      }
    }

  }
}

void RSCompBuilder::drawPlane(const ConcSphParam &cs123, DisplayContext *pdl)
{
  const Vector4D del = cs123.Uijk.scale(0.01);
  const Vector4D del2 = cs123.Uijk.scale(-0.005);
  pdl->startTriangles();
  pdl->color(1.0, 0.0, 1.0);
  pdl->normal(cs123.Uijk);
  pdl->vertex(cs123.a_i+del);
  pdl->vertex(cs123.a_j+del);
  pdl->vertex(cs123.a_k+del);

  pdl->color(0.0, 0.0, 1.0);
  pdl->normal(-cs123.Uijk);
  pdl->vertex(cs123.a_j+del2);
  pdl->vertex(cs123.a_i+del2);
  pdl->vertex(cs123.a_k+del2);

  pdl->end();

}

void RSCompBuilder::drawPlane(int i, int j, int k, DisplayContext *pdl)
{
  const MSAtomArray &atoms = m_pmsb->getAtomArray();
  const Vector4D a_i = atoms[i].pos;
  const Vector4D a_j = atoms[j].pos;
  const Vector4D a_k = atoms[k].pos;

  const Vector4D u_ijk = ((a_j-a_i).cross(a_k-a_i)).normalize();

  const Vector4D del = u_ijk.scale(0.015);
  const Vector4D del2 = u_ijk.scale(0.01);

  // Draw RSFace (in solid triangles)
  pdl->startTriangles();
  pdl->color(1.0, 0.0, 1.0);
  pdl->normal(u_ijk);
  pdl->vertex(a_i+del);
  pdl->vertex(a_j+del);
  pdl->vertex(a_k+del);
  pdl->color(0.0, 0.0, 1.0);
  pdl->normal(-u_ijk);
  pdl->vertex(a_j+del2);
  pdl->vertex(a_i+del2);
  pdl->vertex(a_k+del2);
  pdl->end();

  pdl->setLighting(false);

  pdl->startLineStrip();
  pdl->color(1.0, 0.0, 1.0);
  pdl->vertex(a_i);
  pdl->vertex(a_j);
  pdl->vertex(a_k);
  pdl->vertex(a_i);
  pdl->end();

  LString msg;
  pdl->color(1,1,1);

  msg = LString::format("%d", i);
  pdl->drawString(a_i, msg);

  msg = LString::format("%d", j);
  pdl->drawString(a_j, msg);

  msg = LString::format("%d", k);
  pdl->drawString(a_k, msg);

  pdl->setLighting(true);
}

#endif // SURF_BUILDER_TEST

