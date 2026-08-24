// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: MolSurfBuilder.cpp,v 1.2 2011/02/11 06:54:22 rishitani Exp $

#include <common.h>
#include "surface.hpp"

#include <qsys/Scene.hpp>
#include <qsys/ObjectEvent.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/TopparManager.hpp>

#include "BALL/common.h"
#include "BALL/STRUCTURE/reducedSurface.h"
#include "BALL/STRUCTURE/solventExcludedSurface.h"
#include "BALL/STRUCTURE/solventAccessibleSurface.h"
#include "BALL/STRUCTURE/triangulatedSES.h"
#include "BALL/STRUCTURE/triangulatedSAS.h"

#include <chrono>
#include <cstdlib>

#ifdef HAVE_MESHMS
#include <array>
#include <cmath>
#include <stdexcept>
#include <meshms/capi.hpp>
#endif

#include "MolSurfObj.hpp"
#include "MolSurfEditInfo.hpp"

using namespace surface;
using gfx::DisplayContext;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::AtomIterator;
using molstr::TopparManager;

using namespace BALL;

namespace {
  inline bool chkAltConf(MolAtomPtr pAtom)
  {
    char confid = pAtom->getConfID();
    if (confid=='\0')
      return true; // no conf ID --> OK
    if (confid=='A')
      return true; // conf ID ='A' --> OK

    // other conf ID --> NG
    MB_DPRINTLN("MS> Atom %s alt=%c ignored", pAtom->formatMsg().c_str(), confid);
    return false;
  }

  /// What MolSurfObj::SESBK_AUTO resolves to, evaluated once per process.
  /// Normally MeshMS where it is compiled in (HAVE_MESHMS) and BALL otherwise;
  /// the CUEMOL_SES_BACKEND environment variable ("ball" / "meshms") overrides
  /// that default for headless runs and CI, where no GUI can set the object's
  /// sesbackend property. Returns true when BALL is the default.
  bool isBallBackendDefault()
  {
    static const bool s_bBall = []() -> bool {
#ifdef HAVE_MESHMS
      const bool bDefaultBall = false;
#else
      const bool bDefaultBall = true;
#endif
      const char *env = std::getenv("CUEMOL_SES_BACKEND");
      if (env == NULL || env[0] == '\0')
        return bDefaultBall;

      const LString sel(env);
      if (sel.equalsIgnoreCase("ball"))
        return true;
      if (sel.equalsIgnoreCase("meshms")) {
#ifdef HAVE_MESHMS
        return false;
#else
        LOG_DPRINTLN("MolSurfBuilder> CUEMOL_SES_BACKEND=meshms requested, but "
                     "this build has no MeshMS support --> using BALL");
        return true;
#endif
      }

      LOG_DPRINTLN("MolSurfBuilder> unknown CUEMOL_SES_BACKEND='%s' "
                   "(expected 'ball' or 'meshms') --> using default", env);
      return bDefaultBall;
    }();
    return s_bBall;
  }

}

#ifdef HAVE_MESHMS

namespace {
  /// Bit-exact array comparison for the RS-cache validity check
  /// (Vector4D::operator== compares with a tolerance, unsuitable here).
  bool sphereArysEqual(const std::vector<Vector4D> &a, const std::vector<Vector4D> &b)
  {
    if (a.size()!=b.size())
      return false;
    for (size_t i=0; i<a.size(); ++i) {
      if (a[i].x()!=b[i].x() || a[i].y()!=b[i].y() ||
          a[i].z()!=b[i].z() || a[i].w()!=b[i].w())
        return false;
    }
    return true;
  }
}

/// MeshMS backend: analytic SES via libMeshMS. The BALL "density" (points per
/// area) maps to MeshMS's target triangle edge length as 1/sqrt(density).
/// Throws (std::exception) on failure; the caller falls back to BALL.
void MolSurfObj::buildSESWithMeshMS(const std::vector<Vector4D> &pr_ary,
                                    double density, double probe_r)
{
  const double mesh_size = 1.0 / std::sqrt(density);

  std::vector< std::array<double,4> > xyzr(pr_ary.size());
  for (size_t i=0; i<pr_ary.size(); ++i)
    xyzr[i] = { pr_ary[i].x(), pr_ary[i].y(), pr_ary[i].z(), pr_ary[i].w() };

  // Reuse the density-independent RS cache when the geometry and probe are
  // unchanged (the common regenerate-with-new-density case); otherwise
  // recompute it and remember the inputs it was built from.
  if (m_pMeshMSCache.get()==NULL ||
      m_dMeshMSCachedProbeR!=probe_r ||
      !sphereArysEqual(m_meshMSCachedAry, pr_ary)) {
    m_pMeshMSCache = meshms::compute_rs_from_array(xyzr, probe_r);
    m_meshMSCachedAry = pr_ary;
    m_dMeshMSCachedProbeR = probe_r;
  }
  else {
    MB_DPRINTLN("MolSurfBuilder> MeshMS RS cache hit; re-meshing only");
  }

  meshms::MeshResult mesh =
      meshms::build_mesh_from_cache(m_pMeshMSCache, mesh_size, /*fuse=*/true);
  mesh = meshms::remove_flaps(mesh);

  const int nverts = (int) mesh.verts.size();
  const int nfaces = (int) mesh.faces.size();
  if (nverts<1 || nfaces<1)
    throw std::runtime_error("MeshMS returned an empty mesh");

  setVertSize(nverts);
  setFaceSize(nfaces);
  for (int i=0; i<nverts; ++i) {
    setVertex(i,
              Vector4D(mesh.verts[i][0], mesh.verts[i][1], mesh.verts[i][2]),
              Vector4D(mesh.vnormals[i][0], mesh.vnormals[i][1], mesh.vnormals[i][2]));
  }
  for (int i=0; i<nfaces; ++i)
    setFace(i, mesh.faces[i][0], mesh.faces[i][1], mesh.faces[i][2]);

  MB_DPRINTLN("MolSurfBuilder> MeshMS mesh_size=%f", mesh_size);
}

#endif // HAVE_MESHMS

void MolSurfObj::createSESFromArray(const std::vector<Vector4D> &pr_ary, double density, double probe_r)
{
  // Backend-independent input validation (both paths behave identically)
  if (pr_ary.empty()) {
    MB_THROW(qlib::RuntimeException, "MolSurfBuilder> SES generation failed: no atoms");
    return;
  }
  if (density<=0.0) {
    MB_THROW(qlib::RuntimeException, "MolSurfBuilder> SES generation failed: invalid density");
    return;
  }

  // Resolve the requested backend (the sesbackend property, settable from the
  // GUI; SESBK_AUTO defers to the process default).
  const bool bUseBall =
      (m_nSesBackend == SESBK_BALL) ||
      (m_nSesBackend == SESBK_AUTO && isBallBackendDefault());

  // Time the whole generation so the two backends can be compared directly.
  const char *backend = "BALL";
  const std::chrono::steady_clock::time_point t0 =
      std::chrono::steady_clock::now();

#ifdef HAVE_MESHMS
  bool bDone = false;
  if (!bUseBall) {
    try {
      buildSESWithMeshMS(pr_ary, density, probe_r);
      backend = "MeshMS";
      bDone = true;
    }
    catch (const std::exception &e) {
      LOG_DPRINTLN("MolSurfBuilder> MeshMS SES failed (%s); falling back to BALL", e.what());
    }
    catch (...) {
      LOG_DPRINTLN("MolSurfBuilder> MeshMS SES failed (unknown error); falling back to BALL");
    }
    if (!bDone)
      backend = "BALL (MeshMS fallback)";
  }
  if (!bDone)
    buildSESWithBALL(pr_ary, density, probe_r);
#else
  // No MeshMS in this build: BALL is the only backend, whatever was requested.
  (void) bUseBall;
  buildSESWithBALL(pr_ary, density, probe_r);
#endif

  const double build_ms = std::chrono::duration<double, std::milli>(
                              std::chrono::steady_clock::now() - t0)
                              .count();
  LOG_DPRINTLN("MolSurfBuilder> SES built by %s in %.1f ms: "
               "atoms=%d, verts=%d, faces=%d (density=%.2f, probe=%.2f)",
               backend, build_ms, (int) pr_ary.size(),
               getVertSize(), getFaceSize(), density, probe_r);
}

/// BALL backend: the original vendored-BALL SES path, kept compiled in every
/// build as the fallback when the MeshMS backend fails.
void MolSurfObj::buildSESWithBALL(const std::vector<Vector4D> &pr_ary, double density, double probe_r)
{
  Vector4D pos;
  int i, natoms = pr_ary.size();

  std::vector< BALL::TSphere3<double> > spheres(natoms);
  for (i=0; i<natoms; ++i)
    spheres[i] = BALL::TSphere3<double>(BALL::TVector3<double>(pr_ary[i].x(), pr_ary[i].y(), pr_ary[i].z()), pr_ary[i].w());

  double diff = probe_r < 1.5 ? 0.01 : -0.01;

  bool ok = false;
  double rad = probe_r;
  BALL::ReducedSurface *pRS = NULL;
  BALL::SolventExcludedSurface *pSES = NULL;
  for (int i=0; !ok && i<10; ++i) {
    pRS = new BALL::ReducedSurface(spheres, rad);
    pRS->compute();
    pSES = new BALL::SolventExcludedSurface(pRS);
    pSES->compute();

    if (pSES->check())
      break;

    // failed --> retry with different probe radius
    delete pRS; pRS = NULL;
    delete pSES; pSES = NULL;
    rad += diff;
    LOG_DPRINTLN("MolSurfBuilder> SES check failed --> retry (%d) with different probe r=%f", i, rad);
  }

  if (pSES==NULL) {
    //std::cout << "ses check failed" << std::endl;
    LOG_DPRINTLN("MolSurfBuilder> SES generation failed.");
    MB_THROW(qlib::RuntimeException, "MolSurfBuilder> SES generation failed.");
    return;
  }

  MB_ASSERT(pSES!=NULL&&pRS!=NULL);
  BALL::TriangulatedSES surface(pSES, density);
  surface.compute();

  int nverts = surface.getNumberOfPoints();
  int nfaces = surface.getNumberOfTriangles();

  setVertSize(nverts);
  setFaceSize(nfaces);

  {
    BALL::TriangulatedSES::ConstPointIterator iter = surface.beginPoint();
    BALL::TriangulatedSES::ConstPointIterator eiter = surface.endPoint();
    int i = 0;
    for (;iter != eiter; ++iter) {
      BALL::TrianglePoint& tri_point = **iter;
      
      Vector4D n(tri_point.normal_.x,tri_point.normal_.y,tri_point.normal_.z);
      Vector4D v(tri_point.point_.x,tri_point.point_.y,tri_point.point_.z);

      setVertex(i, v, n);
      tri_point.setIndex(i);
      i++;
    }
  }

  {
    BALL::TriangulatedSES::ConstTriangleIterator iter = surface.beginTriangle();
    BALL::TriangulatedSES::ConstTriangleIterator eiter = surface.endTriangle();
    int i=0;
    for (; iter!=eiter; ++iter, ++i) {
      //std::cout << (**iter) << std::endl;
      int v1 = (*iter)->getVertex(0)->getIndex();
      int v2 = (*iter)->getVertex(1)->getIndex();
      int v3 = (*iter)->getVertex(2)->getIndex();
      //printf("%6d %6d %6d\n", v1, v2, v3);
      setFace(i, v1, v2, v3);
    }
  }

  delete pSES;
  delete pRS;
}

void MolSurfObj::createSESFromMol(MolCoordPtr pMol, SelectionPtr pSel, double density, double probe_r)
{
  AtomIterator aiter(pMol, pSel);
  int i, natoms=0;

  // count atom number
  for (aiter.first(); aiter.hasMore(); aiter.next()) {
    MolAtomPtr pAtom = aiter.get();
    if (!chkAltConf(pAtom)) continue;
    MB_ASSERT(!pAtom.isnull());
    ++natoms;
  }

  std::vector< Vector4D > spheres(natoms);

  TopparManager *pTM = TopparManager::getInstance();
  const double vdw_default = 2.0;

  // copy to the m_data
  Vector4D pos;
  for (i=0,aiter.first(); aiter.hasMore()&&i<natoms; aiter.next()) {
    MolAtomPtr pAtom = aiter.get();
    if (!chkAltConf(pAtom)) continue;

    pos = pAtom->getPos();

    double vdw = pTM->getVdwRadius(pAtom, false);
    if (vdw<0)
      vdw = vdw_default;

    pos.w() = vdw;
    spheres[i] = pos;
    ++i;
  }

  createSESFromArray(spheres, density, probe_r);

  // save data for re-generation
  m_sOrigMol = pMol->getName();
  m_nOrigMolID = pMol->getUID();
  m_pMolSel = pSel;
  m_dDensity = density;
  m_dProbeRad = probe_r;
}

void MolSurfObj::regenerateSES(double density, double probe_r, SelectionPtr pSel)
{
  if (m_dDensity<0.0 || m_dProbeRad<0.0) {
    MB_THROW(qlib::RuntimeException, "Cannot regenerate surfobj: invalid density or proberad");
    return;
  }

  qsys::ScenePtr pScene = getScene();
  molstr::MolCoordPtr pMol;
  if (m_nOrigMolID==qlib::invalid_uid)
    pMol = pScene->getObjectByName(m_sOrigMol); 
  else
    pMol = pScene->getObject(m_nOrigMolID); 

  if (pMol.isnull()) {
    MB_THROW(qlib::RuntimeException, "Cannot regenerate surfobj: origMol is not found");
    return;
  }

  double den2 = density;
  if (den2<0.0)
    den2 = m_dDensity;

  double rad2 = probe_r;
  if (rad2<0.0)
    rad2 = m_dProbeRad;

  SelectionPtr pSel2 = pSel;
  if (pSel2.isnull()) {
    pSel2 = getOrigSel();
  }
  
  // Record undo info
  qsys::UndoUtil uu(getScene());
  if (uu.isOK()) {
    MolSurfEditInfo *pInfo = MB_NEW MolSurfEditInfo();
    pInfo->setup(this);
    uu.add(pInfo);
  }

  clean();
  createSESFromMol(pMol, pSel2, den2, rad2);

  // notify update of structure
  {
    qsys::ObjectEvent obe;
    obe.setType(qsys::ObjectEvent::OBE_CHANGED);
    obe.setTarget(getUID());
    obe.setDescr("structure");
    fireObjectEvent(obe);
  }
}

#ifdef SURF_BUILDER_TEST
////////////////////////////////////////////////////////////////

#include "MolSurfBuilder.hpp"
#include "RSCompBuilder.hpp"
#include "SESTgBuilder.hpp"

#include <gfx/DisplayContext.hpp>

using namespace surface;
using gfx::DisplayContext;
using molstr::MolAtomPtr;
using molstr::AtomIterator;

MolSurfBuilder::~MolSurfBuilder()
{
/*  RSEdgeList::iterator iter = m_edges.begin();
  for (; iter!=m_edges.end(); ++iter)
    delete *iter;
  
  RSFaceList::iterator fiter = m_faces.begin();
  for (; fiter!=m_faces.end(); ++fiter)
    delete *fiter;
	*/
}

bool MolSurfBuilder::init(MolCoordPtr pmol)
{
  AtomIterator aiter(pmol);
  int i, natoms=0;

  // count atom number
  for (aiter.first(); aiter.hasMore(); aiter.next()) {
    MolAtomPtr pAtom = aiter.get();
    MB_ASSERT(!pAtom.isnull());
    ++natoms;
  }

  // copy to the m_data
  m_data.resize(natoms);
  m_tree.alloc(natoms);
  for (i=0,aiter.first(); aiter.hasMore()&&i<natoms; aiter.next(),++i) {
    MolAtomPtr pAtom = aiter.get();
    m_data[i].pos = pAtom->getPos();
    m_data[i].rad = 1.5;
    m_data[i].aid = pAtom->getID();

    m_tree.setAt(i, m_data[i].pos, i);
  }

  // build BSP tree
  m_tree.build();

  m_rmax = 1.5;
  m_rprobe = 1.2;
  return true;
}

void MolSurfBuilder::build()
{
  RSCompBuilder rscb(this);
  rscb.build();

  SESTgBuilder tgb(this, &(rscb.m_rscomp));
  tgb.build();
}

void SurfTgSet::draw(DisplayContext *pdl)
{
  pdl->startTriangles();
  std::deque<MSFace>::const_iterator iter =  m_faces.begin();
  for ( ; iter!=m_faces.end(); ++iter) {
    const MSFace &f = *iter;
    const MSVert &v1 = m_verteces[f.id1];
    const MSVert &v2 = m_verteces[f.id2];
    const MSVert &v3 = m_verteces[f.id3];

    pdl->normal(v1.n3d());
    pdl->vertex(v1.v3d());

    pdl->normal(v2.n3d());
    pdl->vertex(v2.v3d());

    pdl->normal(v3.n3d());
    pdl->vertex(v3.v3d());
  }
  pdl->end();
}

void SurfTgSet::drawIndex(DisplayContext *pdl, int iv, int ishow)
{
  LString msg = LString::format("%d", ishow);
  const MSVert &v1 = m_verteces[iv];

  pdl->setLighting(false);
  pdl->drawString(v1.v3d(), msg);
  pdl->setLighting(true);
}

//////////////////////////////////////////////////////////////////////////

void MolSurfBuilder::drawDisk(const Vector4D &cen, const Vector4D &norm, double rad)
{
  const double thik = 0.05;
  const Vector4D start = cen - norm.scale(thik/2.0);
  const Vector4D end   = cen + norm.scale(thik/2.0);
  m_pdl->cylinderCap(rad, start, end);
}

void MolSurfBuilder::drawArc(const Vector4D &n, double rad, const Vector4D &cen,
             const Vector4D &vst, double theta2)
{
  const Vector4D &e1 = n;
  const Vector4D e2 = vst.normalize();
  const Vector4D e3 = e1.cross(e2);

  Matrix4D xfmat = Matrix4D::makeTransMat(cen);

  xfmat.aij(1,1) = e2.x();
  xfmat.aij(2,1) = e2.y();
  xfmat.aij(3,1) = e2.z();

  xfmat.aij(1,2) = e3.x();
  xfmat.aij(2,2) = e3.y();
  xfmat.aij(3,2) = e3.z();

  xfmat.aij(1,3) = e1.x();
  xfmat.aij(2,3) = e1.y();
  xfmat.aij(3,3) = e1.z();

  m_pdl->pushMatrix();
  m_pdl->multMatrix(xfmat);
  /*m_pdl->cylinder(0.05, Vector4D(0,0,0), e1);
    m_pdl->cylinder(0.05, Vector4D(0,0,0), e2);
    m_pdl->cylinder(0.05, Vector4D(0,0,0), e3);*/

  /*
    m_pdl->color_3d(1, 0, 0);
    m_pdl->cylinder(0.05, Vector4D(0,0,0), Vector4D(1,0,0));
    m_pdl->color_3d(0, 1, 0);
    m_pdl->cylinder(0.05, Vector4D(0,0,0), Vector4D(0,1,0));
    m_pdl->color_3d(0, 0, 1);
    m_pdl->cylinder(0.05, Vector4D(0,0,0), Vector4D(0,0,1));
   */

  const double arclen = qlib::abs(theta2 * rad);
  int ndiv = int(arclen/0.1);
  if (ndiv<5)
    ndiv = 5;
  const double dth = theta2/double(ndiv);
  //MB_DPRINTLN("arclen: %f, ndiv: %d, dth: %f", arclen, ndiv, dth);

  int i;
  double th = 0.0;
  m_pdl->setLighting(false);
  m_pdl->startLineStrip();
  for (i=0; i<ndiv+1; ++i) {
    m_pdl->vertex(rad*::cos(th), rad*::sin(th), 0.0);
    th += dth;
  }
  m_pdl->end();
  m_pdl->setLighting(true);
  m_pdl->popMatrix();
}

#endif // SURF_BUILDER_TEST

#include <modules/molstr/AtomPosMap.hpp>

namespace {
  Vector4D getInplaneDir(const Vector4D &norm, const Vector4D &in)
  {
    //Vector4D nin = in.normalize();
    return in - norm.scale( norm.dot(in) );
  }

  double rand_real()
  {
    int i1 = rand();
    int i2 = rand();
    while(i1==RAND_MAX)
      i1 =rand();
    while(i2==RAND_MAX)
      i2 =rand();
    double mx = RAND_MAX;
    return (i1+i2/mx)/mx;
  }

  Vector4D getRandDir(const Vector4D &norm)
  {
    Vector4D rvec(rand_real(),rand_real(),rand_real());
    Vector4D res = getInplaneDir(norm, rvec);
    return res.normalize();
  }
}

void MolSurfObj::createHoleTest1(MolCoordPtr pMol, const Vector4D &dirnorm, const Vector4D &startpos)
{
  molstr::AtomPosMap amap;
  amap.setTarget(pMol);
  amap.setSpacing(3.5);
  amap.generate();
  
  int i, j, nslice = 50;
  double dstep = 0.25;
  const double dmax = 0.3;
  
  Vector4D pos = startpos;

  std::vector<Vector4D> cen_ary(nslice);
  std::vector<double> rad_ary(nslice);

  TopparManager *pTM = TopparManager::getInstance();
  const double vdw_default = 2.0;

  double rad=-1.0;
  Vector4D dv = dirnorm.scale(dstep);

  const int nmcs = 1000;

  for (i=0; i<nslice && rad<5.0; ++i) {
    rad = -1.0;

    double temp = 0.00001;
    const double temp_scl = 0.9;

    MB_DPRINTLN("Start MC steps=%d, init T=%f", nmcs, temp);

    for (j=0; j<nmcs; ++j, temp *= temp_scl) {
      Vector4D newpos = pos;
      if (j>0)
        newpos += getRandDir(dirnorm).scale(rand_real()*dmax);
      int aid = amap.searchNearestAtom(newpos);
      MolAtomPtr pAtom = pMol->getAtom(aid);
      Vector4D rp = pAtom->getPos() - newpos;
      double vdw = pTM->getVdwRadius(pAtom, false);
      if (vdw<0)
        vdw = vdw_default;
      double new_r = rp.length() - vdw;

      if (new_r>rad) {
        // accept --> update
        MB_DPRINTLN("trial accepted for new_r=%f > rad=%f", new_r, rad);
        rad = new_r;
        pos = newpos;
      }
      else {
        double prob = exp( (new_r-rad)/temp );
        double rnd = rand_real();
        if (rnd < prob) {
          // accept --> update
          MB_DPRINTLN("T=%f, prob=%f, rnd=%f --> trial accepted for new_r=%f < rad=%f", temp, prob, rnd, new_r, rad);
          rad = new_r;
          pos = newpos;
        }
      }
      
    }        

    MB_DPRINTLN("slice %d pos=%f,%f,%f rad=%f", i, pos.x(), pos.y(), pos.z(), rad);
    rad_ary[i] = rad;
    cen_ary[i] = pos;

    pos = pos + dv;

  }
  for (;i<nslice; ++i) {
    rad_ary[i] = rad;
    cen_ary[i] = pos;
    pos = pos + dv;
  }

  //////////
  
  const int ncdiv = 40;
  const int nverts = ncdiv*nslice;
  const int nfaces = ncdiv*(nslice-1)*2;

  setVertSize(nverts);
  setFaceSize(nfaces);

  Vector4D e1 = getInplaneDir(dirnorm, Vector4D(1,0,0));
  Vector4D e2 = e1.cross(dirnorm);

  int vind = 0;
  for (i=0; i<nslice; ++i) {
    const double dth = 2.0*M_PI/double(ncdiv);
    double th = 0.0;
    for (j=0; j<ncdiv; ++j) {
      const double rr = rad_ary[i];
      Vector4D vrr = e1.scale(cos(th)) + e2.scale(sin(th));
      setVertex(vind, cen_ary[i] + vrr.scale(rr), vrr);
      ++vind;
      th += dth;
    }
  }
  
  int find = 0;
  for (i=0; i<nslice-1; ++i) {
    int ibase = i*ncdiv;
    for (j=0; j<ncdiv; ++j) {
      //int vind = i*ncdiv + j;
      setFace(find, ibase+(j+1)%ncdiv, ibase+j, ibase+ncdiv+j);
      ++find;
      setFace(find, ibase+ncdiv+j, ibase+ncdiv+(j+1)%ncdiv, ibase+(j+1)%ncdiv);
      ++find;
    }
  }
}

