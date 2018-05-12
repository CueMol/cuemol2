// -*-Mode: C++;-*-
//
// Mesh refine routines for MapIpol renderer
//

#include <common.h>

#include "MeshRefinePartMin.hpp"
#include "cgal_remesh_impl.h"

using namespace xtal;
using qlib::Matrix4D;
using qlib::Matrix3D;

namespace xtal {
void dumpTriStats(const LString &fname, const Mesh &cgm, const MapBsplIpol &ip)
{
  FILE *fp = fopen(fname, "w");
  int i, j;

  //vid_t vid[3];
  Vector3F v[3], g[3], vn;
  float minang, maxang, rr, ns;

  i=0;
  for(fid_t fd : cgm.faces()){

    j=0;
    BOOST_FOREACH(vid_t vd,vertices_around_face(cgm.halfedge(fd), cgm)){
      MB_ASSERT(j<3);
      v[j] = convToV3F( cgm.point(vd) );
      g[j] = -(ip.calcDiffAt(v[j])).normalize();
      ++j;
    }
    MB_ASSERT(j==3);

    minang = minangl(v[0], v[1], v[2]);
    maxang = minangl(v[0], v[1], v[2], true);
    rr = radratio(v[0], v[1], v[2]);
    vn = calcNorm(v[0], v[1], v[2]).normalize();
    ns = (vn.dot(g[0]) + vn.dot(g[1]) + vn.dot(g[2]))/3.0f;

    fprintf(fp, "Tri %d min %f max %f rr %f ns %f\n",
            i, qlib::toDegree(minang), qlib::toDegree(maxang), rr, ns);
    ++i;
  }

  fclose(fp);
}

void drawMeshLines(DisplayContext *pdl, const Mesh &cgm, float r, float g, float b)
{
  pdl->setLineWidth(2.0);
  pdl->setLighting(false);
  pdl->startLines();
  pdl->color(r,g,b);

  for(Mesh::Edge_index ei : cgm.edges()){
    Mesh::Halfedge_index h0 = cgm.halfedge(ei, 0);
    Vector3F v00 = convToV3F( cgm.point( cgm.target(h0) ) );

    Mesh::Halfedge_index h1 = cgm.halfedge(ei, 1);
    Vector3F v10 = convToV3F( cgm.point( cgm.target(h1) ) );

    pdl->vertex(v00);
    pdl->vertex(v10);
  }
  pdl->end();
  pdl->setLighting(true);
}


void dumpEdgeStats(const LString &fname, const Mesh &cgm, const MapBsplIpol &ip)
{
  FILE *fp = fopen(fname, "w");
  int i, j;

  Vector3F v0, v1, vm;
  float angl;

  ParticleRefine pr;
  pr.m_pipol = &ip;

  i=0;
  for(Mesh::Edge_index ei : cgm.edges()){
    Mesh::Halfedge_index h0 = cgm.halfedge(ei, 0);
    vid_t vid0 = cgm.target(h0);
    Mesh::Halfedge_index h1 = cgm.halfedge(ei, 1);
    vid_t vid1 = cgm.target(h1);

    v0 = convToV3F(cgm.point( vid0 ));
    v1 = convToV3F(cgm.point( vid1 ));

    vm = (v0+v1).scale(0.5);

    Vector3F g0 = ( ip.calcDiffAt(v0) ).normalize();
    Vector3F g1 = ( ip.calcDiffAt(v1) ).normalize();
    angl = acos(g0.dot(g1));

    fprintf(fp, "Edge %d len %f diffcuv %f cuv %f il %f\n",
            i, (v0-v1).length(), qlib::toDegree(angl),
            ip.calcMaxCurv(vm), ip.calcIdealL(vm));
    ++i;
  }

  fclose(fp);
}

}

/////////////////////////////////////////////////////

bool FindProjSurf::findPlusMinus(float &del, bool &bSol)
{
  del = 0.0f;
  float F0 = getF(del);
  if (isNear(F0, 0.0f)) {
    bSol = true;
    return true;
  }

  bSol = false;
  int i;

  if (F0>0.0) {
    del = -0.1;
    for (i=0; i<10; ++i) {
      if (F0*getF(del)<0.0f)
        return true;
      del -= 0.1;
    }
  }
  else {
    del = 0.1;
    for (i=0; i<10; ++i) {
      if (F0*getF(del)<0.0f)
        return true;
      del += 0.1;
    }
  }

  return false;
}

bool FindProjSurf::solve(float &rval)
{
  bool bSol;
  float del;

  if (!findPlusMinus(del, bSol)) {
    findPlusMinus(del, bSol);
    return false;
  }

  if (bSol) {
    rval = 0.0f;
    return true;
  }

  float rhoL = 0.0f;
  float rhoU = del;

  if (rhoL>rhoU)
    std::swap(rhoL, rhoU);

  if (findRoot(rhoL, rhoU, rval)) {
    return true;
  }

  findRoot(rhoL, rhoU, rval);
  return false;
}

bool FindProjSurf::findRoot(float rhoL, float rhoU, float &rval) const
{
  float fL = getF(rhoL);
  float fU = getF(rhoU);

  float rho;
  float rho_sol;

  //// Initial estimation
  // Bisec
  rho = (rhoL+rhoU) * 0.5f;
  // FP
  //rho = (rhoL*fU - rhoU*fL)/(fU-fL);

  for (int i=0; i<10; ++i) {
    if (findRootNrImpl2(rho, rho_sol, true)) {
      if (rho_sol<rhoL || rhoU<rho_sol) {
        MB_DPRINTLN("ProjSurf.findRoot> root %f is not found in rhoL %f /rhoU %f", rho_sol, rhoL, rhoU);
      }
      rval = rho_sol;
      return true;
    }

    // Newton method failed --> bracket the solution by Bisec/FP method
    float frho = getF(rho);

    // select the upper/lower bounds
    if (frho*fU<0.0) {
      // find between mid & rhoU
      rhoL = rho;
      fL = frho;
    }
    else if (frho*fL<0.0) {
      // find between rhoL & mid
      rhoU = rho;
      fU = frho;
    }
    else {
      MB_DPRINTLN("ProjSurf.findRoot> inconsistent fL/fU");
      break;
    }

    // Update the solution estimate
    // Bisection
    rho = (rhoL + rhoU)*0.5;
    // FP
    //rho = (rhoL*fU - rhoU*fL)/(fU-fL);
  }

  MB_DPRINTLN("ProjSurf.findRoot> root not found");
  return false;
}

bool FindProjSurf::findRootNrImpl2(float rho0, float &rval, bool bdump /*= true*/) const
{
  int i, j;
  float Frho, dFrho, mu;

  // initial estimate: rho0
  float rho = rho0;

  bool bConv = false;
  for (i=0; i<10; ++i) {
    Frho = getF(rho);
    if (isNear(Frho, 0.0f)) {
      rval = rho;
      bConv = true;
      break;
    }

    dFrho = getDF(rho);

    mu = 1.0f;

    if (bdump) {
      for (j=0; j<10; ++j) {
        float ftest1 = qlib::abs( getF(rho - (Frho/dFrho) * mu) );
        float ftest2 = (1.0f-mu/4.0f) * qlib::abs(Frho);
        if (ftest1<ftest2)
          break;
        mu = mu * 0.5f;
      }
      if (j == 10) {
        // cannot determine dumping factor mu
        //  --> does not use dumping
        mu = 1.0f;
      }
    }


    rho += -(Frho/dFrho) * mu;
  }

  rval = rho;
  return bConv;
}

////////////////////////////////////////////////////////////

float ParticleRefine::calcFdF(std::vector<float> &pres)
{
  int i, id1, id2;
  float len, con, ss, locscl;

  const int nbon = m_bonds.size();
  const int nang = m_angls.size();
  const int ncrds = m_posary.size();
  const int npart = ncrds/3;

  float eng = 0.0f;
  for (i=0; i<ncrds; ++i) {
    pres[i] = 0.0f;
  }

  for (i=0; i<nbon; ++i) {
    id1 = m_bonds[i].id1 * 3;
    id2 = m_bonds[i].id2 * 3;

    const float dx = m_posary[id1+0] - m_posary[id2+0];
    const float dy = m_posary[id1+1] - m_posary[id2+1];
    const float dz = m_posary[id1+2] - m_posary[id2+2];

    len = sqrt(dx*dx + dy*dy + dz*dz);
    ss = len - m_bonds[i].r0;

    locscl = m_bondscl;// * m_bonds[i].kf;

    if (m_nBondType==BOND_SHRINK) {
      if (ss<0.0f)
        locscl = 0.0f;
    }
    else if (m_nBondType==BOND_STRETCH) {
      if (ss>0.0f)
        locscl = 0.0f;
    }
    else if (m_nBondType==BOND_FULL2) {
      if (ss>0.0f)
        locscl = m_bondscl2;
    }

    con = 2.0f * locscl * ss/len;

    if (!m_fix[id1/3]) {
      pres[id1+0] += con * dx;
      pres[id1+1] += con * dy;
      pres[id1+2] += con * dz;
    }

    if (!m_fix[id2/3]) {
      pres[id2+0] -= con * dx;
      pres[id2+1] -= con * dy;
      pres[id2+2] -= con * dz;
    }

    eng += ss * ss * locscl;
  }

  int ai, aj, ak;
  float rijx, rijy, rijz;
  float rkjx, rkjy, rkjz;
  float Rij, Rkj;
  float costh, theta, dtheta, eangl;

  float df, Dij, Dkj, sinth;
  float vec_dijx,vec_dijy,vec_dijz;
  float vec_dkjx,vec_dkjy,vec_dkjz;

  for (i=0; i<nang; ++i) {
    ai = m_angls[i].id1 * 3;
    aj = m_angls[i].id2 * 3;
    ak = m_angls[i].id3 * 3;

    rijx = m_posary[ai+0] - m_posary[aj+0];
    rijy = m_posary[ai+1] - m_posary[aj+1];
    rijz = m_posary[ai+2] - m_posary[aj+2];

    rkjx = m_posary[ak+0] - m_posary[aj+0];
    rkjy = m_posary[ak+1] - m_posary[aj+1];
    rkjz = m_posary[ak+2] - m_posary[aj+2];

    // distance
    Rij = sqrt(qlib::max<float>(F_EPS8, rijx*rijx + rijy*rijy + rijz*rijz));
    Rkj = sqrt(qlib::max<float>(F_EPS8, rkjx*rkjx + rkjy*rkjy + rkjz*rkjz));

    // normalization
    float eijx, eijy, eijz;
    float ekjx, ekjy, ekjz;
    eijx = rijx / Rij;
    eijy = rijy / Rij;
    eijz = rijz / Rij;

    ekjx = rkjx / Rkj;
    ekjy = rkjy / Rkj;
    ekjz = rkjz / Rkj;

    // angle
    costh = eijx*ekjx + eijy*ekjy + eijz*ekjz;
    costh = qlib::min<float>(1.0f, qlib::max<float>(-1.0f, costh));
    theta = (::acos(costh));
    //dtheta = (theta - m_angls[i].th0);
    dtheta = qlib::min(0.0f, theta - m_angls[i].th0);
    eangl = m_anglscl*dtheta*dtheta;

    eng += eangl;

    // calc gradient
    df = 2.0*m_anglscl*dtheta;

    sinth = sqrt(qlib::max<float>(0.0f, 1.0f-costh*costh));
    Dij =  df/(qlib::max<float>(F_EPS16, sinth)*Rij);
    Dkj =  df/(qlib::max<float>(F_EPS16, sinth)*Rkj);

    vec_dijx = Dij*(costh*eijx - ekjx);
    vec_dijy = Dij*(costh*eijy - ekjy);
    vec_dijz = Dij*(costh*eijz - ekjz);

    vec_dkjx = Dkj*(costh*ekjx - eijx);
    vec_dkjy = Dkj*(costh*ekjy - eijy);
    vec_dkjz = Dkj*(costh*ekjz - eijz);

    pres[ai+0] += vec_dijx;
    pres[ai+1] += vec_dijy;
    pres[ai+2] += vec_dijz;

    pres[aj+0] -= vec_dijx;
    pres[aj+1] -= vec_dijy;
    pres[aj+2] -= vec_dijz;

    pres[ak+0] += vec_dkjx;
    pres[ak+1] += vec_dkjy;
    pres[ak+2] += vec_dkjz;

    pres[aj+0] -= vec_dkjx;
    pres[aj+1] -= vec_dkjy;
    pres[aj+2] -= vec_dkjz;
  }

  Vector3F pos, dF;
  float f;

  if (m_bUseMap) {
    for (i=0; i<npart; ++i) {
      id1 = i*3;
      pos.x() = m_posary[id1+0];
      pos.y() = m_posary[id1+1];
      pos.z() = m_posary[id1+2];

      f = m_pipol->calcAt(pos) - m_isolev;

      dF = m_pipol->calcDiffAt(pos);
      dF = dF.scale(2.0*f*m_mapscl);

      //F = f^2 = (val-iso)^2;
      //dF = 2*f * d(f);

      pres[id1+0] += dF.x();
      pres[id1+1] += dF.y();
      pres[id1+2] += dF.z();

      eng += f*f*m_mapscl;
    }
  }

  return eng;
}

void ParticleRefine::refineSetup(MapBsplIpol *pipol, Mesh &cgm)
{
  int i;
  Vector3F pt;

  m_pipol = pipol;
  // m_isolev = m_dLevel;
  m_bUseMap = true;
  m_bUseProj = false;
  m_nBondType = BOND_SHRINK;

  int nv = cgm.number_of_vertices();
  int nf = cgm.number_of_faces();
  int ne = cgm.number_of_edges();
  int nangl = 0;
  /*for(vid_t vd : cgm.vertices()){
      nangl += cgm.degree(vd);
    }*/

  allocData(nv, ne, nangl);

  i=0;
  for(vid_t vd : cgm.vertices()){
    pt = convToV3F( cgm.point(vd) );
    setPos(i, int(vd), pt);
    ++i;
  }

  Vector3F v0, v1;
  i=0;
  float edge_len = 0.0f;
  for(Mesh::Edge_index ei : cgm.edges()){
    v0 = convToV3F(cgm.point( cgm.target(cgm.halfedge(ei, 0))));
    v1 = convToV3F(cgm.point( cgm.target(cgm.halfedge(ei, 1))));
    edge_len += (v0-v1).length();
    i++;
  }
  edge_len /= float(i);
  MB_DPRINTLN("average edge length: %f", edge_len);
  m_averEdgeLen = edge_len;

  i=0;
  for(Mesh::Edge_index ei : cgm.edges()){
    Mesh::Halfedge_index h0 = cgm.halfedge(ei, 0);
    vid_t vid0 = cgm.target(h0);
    Mesh::Halfedge_index h1 = cgm.halfedge(ei, 1);
    vid_t vid1 = cgm.target(h1);

    setBond(i, int(vid0), int(vid1), edge_len * 1.0);
    ++i;
    if (cgm.is_border(ei)) {
      setFixed(int(vid0));
      setFixed(int(vid1));
    }
  }

  /*
    i=0;
    int j;
    for(vid_t vd : cgm.vertices()){
      int ndgr = cgm.degree(vd);
      std::vector<vid_t> svs(ndgr);
      j=0;
      BOOST_FOREACH(vid_t avd, vertices_around_target(cgm.halfedge(vd), cgm)){
        svs[j] = avd;
        ++j;
      }
      float anglsum = 0.0f;
      for (j=0; j<ndgr; ++j) {
        anglsum += calcAngle(int(svs[j]), int(vd), int(svs[(j+1)%ndgr]));
      }
      for (j=0; j<ndgr; ++j) {
        setAngle(i, int(svs[j]), int(vd), int(svs[(j+1)%ndgr]), anglsum/ndgr);
        ++i;
        ++j;
      }
    }
   */

}

void ParticleRefine::refine()
{
  //m_refilog.clear();

  if (m_bUseProj) {
    m_sol.m_pipol = m_pipol;
    m_sol.m_isolev = m_isolev;
    m_sol.m_eps = FLT_EPSILON*100.0f;
  }

  int ncrd = m_posary.size();
  int nbon = m_bonds.size();

  float tolerance = 0.06;
  float deltat;// * gsl_blas_dnrm2(x);

  //MB_DPRINTLN("set step=%f, tol=%f", deltat, tolerance);
  //MB_DPRINTLN("set OK");

  int npart = m_posary.size()/3;
  int id1;
  int iter, i;
  float eng, len, lenmax = -1.0e10;
  float grad_max = 0.01;

  for (iter=0; iter<m_nMaxIter; ++iter) {

    eng = calcFdF(m_grad);

    lenmax = -1.0e10;
    for (i=0; i<npart; ++i) {
      id1 = i*3;
      len = sqrt(m_grad[id1+0]*m_grad[id1+0] +
                 m_grad[id1+1]*m_grad[id1+1] +
                 m_grad[id1+2]*m_grad[id1+2]);
      lenmax = qlib::max(lenmax, len);
    }

    /*if (lenmax>grad_max)
          deltat = grad_max/lenmax;
        else*/
    deltat = grad_max;
    MB_DPRINTLN("grad lenmax = %f scale %f", lenmax, deltat);


    for (i=0; i<npart; ++i) {
      id1 = i*3;
      m_posary[id1+0] -= deltat * m_grad[id1+0];
      m_posary[id1+1] -= deltat * m_grad[id1+1];
      m_posary[id1+2] -= deltat * m_grad[id1+2];
    }

    if (m_bUseProj)
      project(NULL);

    /*if (m_bUseAdp) {
          m_averEdgeLen = 1.0f;
          setAdpBondWeights();
        }*/

    MB_DPRINTLN("iter = %d energy=%f", iter, eng);

    m_refilog.push_back(RefineLog(iter, eng, lenmax));
  }

}

static inline void copyToGsl(gsl_vector *dst, const std::vector<float> &src)
{
  int i;
  const int ncrd = src.size();
  for (i=0; i<ncrd; ++i)
    gsl_vector_set(dst, i, src[i]);
}

static inline void copyToVec(std::vector<float> &dst, const gsl_vector *src)
{
  int i;
  const int ncrd = dst.size();
  for (i=0; i<ncrd; ++i)
    dst[i] = float( gsl_vector_get(src, i) );
}

static void calc_fdf(const gsl_vector *x, void *params, double *f, gsl_vector *g)
{
  ParticleRefine *pMin = static_cast<ParticleRefine *>(params);

  copyToVec(pMin->m_posary, x);

  float energy = pMin->calcFdF(pMin->m_grad);

  //printf("copy to gsl %p from vec %p\n", g, &grad);
  if (g!=NULL)
    copyToGsl(g, pMin->m_grad);
  *f = energy;

  // printf("target fdf OK\n");
}

static double calc_f(const gsl_vector *x, void *params)
{
  double energy;
  calc_fdf(x, params, &energy, NULL);
  return energy;
}

static void calc_df(const gsl_vector *x, void *params, gsl_vector *g)
{
  double dummy;
  calc_fdf(x, params, &dummy, g);
}


void ParticleRefine::project(gsl_vector *x)
{
  int i, id1;
  Vector3F pos;
  float del;
  int ncrds = m_posary.size();
  int npart = ncrds/3;

  if (x)
    copyToVec(m_posary, x);

  for (i=0; i<npart; ++i) {
    id1 = i*3;
    pos.x() = m_posary[id1+0];
    pos.y() = m_posary[id1+1];
    pos.z() = m_posary[id1+2];
    m_sol.setup(pos);
    if (m_sol.solve(del)) {
      pos = m_sol.getV(del);
      m_posary[id1+0] = pos.x();
      m_posary[id1+1] = pos.y();
      m_posary[id1+2] = pos.z();
    }
    else {
      MB_DPRINTLN("proj failed.");
    }
  }

  if (x)
    copyToGsl(x, m_posary);
}

void ParticleRefine::refineGsl(int ntype/*=MIN_BFGS*/)
{
  //m_bUseMap = false;

  if (m_bUseProj) {
    m_sol.m_pipol = m_pipol;
    m_sol.m_isolev = m_isolev;
    m_sol.m_eps = FLT_EPSILON*100.0f;
  }

  int ncrd = m_posary.size();
  int nbon = m_bonds.size();

  gsl_multimin_function_fdf targ_func;

  MB_DPRINTLN("RefineGSL> ncrd=%d, nbond=%d", ncrd, nbon);
  targ_func.n = ncrd;
  targ_func.f = calc_f;
  targ_func.df = calc_df;
  targ_func.fdf = calc_fdf;
  targ_func.params = this;

  const gsl_multimin_fdfminimizer_type *pMinType;
  gsl_multimin_fdfminimizer *pMin;

  if (ntype==MIN_BFGS)
    pMinType = gsl_multimin_fdfminimizer_vector_bfgs2;
  else if (ntype==MIN_SD)
    pMinType = gsl_multimin_fdfminimizer_steepest_descent;
  else
    pMinType = gsl_multimin_fdfminimizer_conjugate_fr;

  //pMinType = gsl_multimin_fdfminimizer_conjugate_pr;

  pMin = gsl_multimin_fdfminimizer_alloc(pMinType, ncrd);

  gsl_vector *x = gsl_vector_alloc(ncrd);
  copyToGsl(x, m_posary);
  //float tolerance = 0.06;
  float tolerance = 0.1;
  double step_size = 0.01 * gsl_blas_dnrm2(x);

  //MB_DPRINTLN("set step=%f, tol=%f", step_size, tolerance);

  gsl_multimin_fdfminimizer_set(pMin, &targ_func, x, step_size, tolerance);
  //MB_DPRINTLN("set OK");

  int iter=0, status;

  /*if (m_bUseAdp) {
        m_averEdgeLen = 1.0f;
        setAdpBondWeights();
      }*/

  do {

    iter++;
    status = gsl_multimin_fdfminimizer_iterate(pMin);

    if (status)
      break;

    status = GSL_CONTINUE;
    //status = gsl_multimin_test_gradient(pMin->gradient, 1e-3);
    //if (status == GSL_SUCCESS)
    //MB_DPRINTLN("Minimum found");
    double norm = gsl_blas_dnrm2(pMin->gradient);

    MB_DPRINTLN("iter = %d energy=%f grad=%f", iter, pMin->f, norm);
    m_refilog.push_back(RefineLog(iter, pMin->f, norm));

    if (m_bUseProj)
      project(pMin->x);

  }
  while (status == GSL_CONTINUE && iter < m_nMaxIter);

  MB_DPRINTLN("End status = %d", status);
  copyToVec(m_posary, pMin->x);

  //printf("Atom0 %f,%f,%f\n", pMol->m_crds[0], pMol->m_crds[1], pMol->m_crds[2]);

  gsl_multimin_fdfminimizer_free(pMin);
  gsl_vector_free(x);
}


float ParticleRefine::calcAverEdgeLen() const
{
  const int nbon = m_bonds.size();

  Vector3F v0, v1;
  int id1, id2, i;
  i=0;
  float edge_len = 0.0f;
  for(i=0; i<nbon; ++i){
    id1 = m_bonds[i].id1 * 3;
    id2 = m_bonds[i].id2 * 3;
    v0 = Vector3F(&m_posary[id1+0]);
    v1 = Vector3F(&m_posary[id2+0]);
    edge_len += (v0-v1).length();
  }
  edge_len /= float(nbon);
  MB_DPRINTLN("average edge length: %f", edge_len);

  return edge_len;
}

void ParticleRefine::setAdpBond()
{
  MB_DPRINTLN("Update adaptive bond weights ave=%f", m_averEdgeLen);
  const int nbon = m_bonds.size();

  float fh = 1.0f;
  Vector3F v0, v1;
  int id1, id2, i;

  i=0;
  for(i=0; i<nbon; ++i){
    id1 = m_bonds[i].id1 * 3;
    id2 = m_bonds[i].id2 * 3;
    v0 = Vector3F(&m_posary[id1+0]);
    v1 = Vector3F(&m_posary[id2+0]);
    fh = calcIdealL(v0, v1);
    m_bonds[i].r0 = fh;
    m_bonds[i].kf = 1.0f;
  }
}

void ParticleRefine::showMeshCurvCol(DisplayContext *pdl, const Mesh &cgm)
{
  int i;
  int id1, id2;
  Vector3F v0, v1;

  pdl->setLineWidth(3.0);
  pdl->setLighting(false);
  pdl->startLines();
  //pdl->color(r,g,b);
  float cmin=1.0e10, cmax=-1.0e10;

  const int nbon = m_bonds.size();
  for(i=0; i<nbon; ++i){
    id1 = m_bonds[i].id1 * 3;
    id2 = m_bonds[i].id2 * 3;
    v0 = Vector3F(&m_posary[id1+0]);
    v1 = Vector3F(&m_posary[id2+0]);
    float c = m_pipol->calcMaxCurv((v0+v1).scale(0.5));
    cmin = qlib::min(c,cmin);
    cmax = qlib::max(c,cmax);
    pdl->color(gfx::SolidColor::createHSB(c/3.0, 1, 1));
    pdl->vertex(v0);
    pdl->vertex(v1);
  }
  pdl->end();
  pdl->setLighting(true);
}

void ParticleRefine::dumpRefineLog(const LString &fname)
{
  FILE *fp = fopen(fname.c_str(), "w");
  if (fp==NULL) return;
  for (const RefineLog &ent : m_refilog)
    {
      fprintf(fp, "niter %d eng %f movmax %f\n", ent.niter, ent.eng, ent.mov_max);
    }
  fclose(fp);
}

