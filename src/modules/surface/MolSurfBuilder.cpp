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

  std::vector< BALL::TSphere3<double> > spheres(natoms);

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

    spheres.at(i) = BALL::TSphere3<double>(BALL::TVector3<double>(pos.x(), pos.y(), pos.z()), vdw);
    ++i;
  }

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

