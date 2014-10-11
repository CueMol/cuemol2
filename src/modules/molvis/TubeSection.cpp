// -*-Mode: C++;-*-
//
//  Tube section class
//
//  $Id: TubeSection.cpp,v 1.4 2011/01/02 13:11:02 rishitani Exp $

#include <common.h>

#include "TubeSection.hpp"
#include <qlib/Vector4D.hpp>

#include <gfx/DisplayContext.hpp>

using namespace molvis;
//using namespace molstr;

TubeSection::TubeSection()
{
  m_pSectTab = NULL;

  //m_nSectType = TS_ELLIPTICAL;
  //m_lw = 0.35;
  //m_tuber = 1.0;
  //m_alpha = 0.4;
  //m_nSectDetail = 16;

  resetAllProps();
}

TubeSection::~TubeSection()
{
  if (m_pSectTab!=NULL)
    delete [] m_pSectTab;
}

static double convTheta(double tuber, double phi)
{
  double dn = ::floor(phi/M_PI);
  double dphi = ::fmod(phi, M_PI);
  double th;
  if (dphi<M_PI/2.0) {
    th = ::atan(tuber * ::tan(dphi));
  }
  else {
    dphi = M_PI - dphi;
    th = ::atan(tuber * ::tan(dphi));
    th = M_PI - th;
  }
  return th + M_PI*dn;
}

void TubeSection::setupEllipticalSection()
{
  int i, j;

  std::set<double> thset;

  double max_dth = 2.0*M_PI/double(m_nSectDetail) + 0.001;
  for (i=0; i<m_nSectDetail; i++) {
    const double phi = (double(i)*2.0)*M_PI/double(m_nSectDetail);
    const double th = convTheta(m_tuber, phi); 

    const double nx_phi = (double(i+1)*2.0)*M_PI/double(m_nSectDetail);
    const double nx_th = convTheta(m_tuber, nx_phi); 

    thset.insert(th);

    double del_th = nx_th - th;

    if (del_th>max_dth) {
      MB_DPRINTLN("del_th %f (%f-%f) > max_dth %f",
		  qlib::toDegree(del_th),
		  qlib::toDegree(nx_th),
		  qlib::toDegree(th),
		  qlib::toDegree(max_dth));
      // divide theta so that del_th is less than max_dth
      int ndiv = ::ceil(del_th/max_dth);
      double divth = del_th/double(ndiv);
      for (j=1; j<ndiv; ++j) {
	const double th2 = th + double(j)*divth;
	if (th2<2.0*M_PI) {
	  MB_DPRINTLN("add %f", qlib::toDegree(th2));
	  thset.insert(th2);
	}
      }
    }
  }


    //m_nSectTabSz = m_nSectDetail * 2;
  m_nSectTabSz = thset.size();
  m_pSectTab = MB_NEW Vector4D[m_nSectTabSz];
  MB_DPRINTLN("TS.ses> detail= %d , tabsz = %d", m_nSectDetail, m_nSectTabSz);
  
  m_sftypes.resize(m_nSectTabSz);

  double dth = M_PI/double(m_nSectTabSz);
  
  //for (i=0; i<m_nSectTabSz; i++) {
  //const double phi = double(i)*2.0*M_PI/double(m_nSectTabSz) + dth;
  //const double th = convTheta(m_tuber, phi); 

  i=0;
  BOOST_FOREACH (double th, thset) {
    MB_DPRINTLN("TS.ses> i= %d , th= %f", i, qlib::toDegree(th));
    const double si = ::sin(th);
    const double co = ::cos(th);
    const double dlen = ::sqrt(co*co*m_tuber*m_tuber + si*si);
    m_pSectTab[i].x() = co*m_lw;
    m_pSectTab[i].y() = si*m_lw*m_tuber;
    m_pSectTab[i].z() = co*m_tuber/dlen;
    m_pSectTab[i].w() = si/dlen;
    m_sftypes[i] = TSSF_UNKNOWN;
    ++i;
  }
}

void TubeSection::setupSquareSection()
{
  double Rx, Ax, Ay;
  if (m_tuber>1.0) {
    Rx = m_lw*(1-m_alpha);
    Ax = m_lw*m_alpha;
    Ay = m_lw*m_tuber - Rx;
  }
  else {
    Rx = m_lw*m_tuber*(1-m_alpha);
    Ax = m_lw - Rx;
    Ay = m_lw*m_tuber*m_alpha;
  }

  const double len = (Ax+Ay)*2.0 + Rx*M_PI*2.0;
  const double ddel = len/double(m_nSectDetail);
  const int Nx = qlib::max(1, int(::floor(Ax*2.0/ddel)));
  const int Ny = qlib::max(1, int(::floor(Ay*2.0/ddel)));
  const int Nr = qlib::max(1, int(::floor(Rx*M_PI*0.5/ddel))) * 2;
  m_nSectTabSz = Nx*2 + Ny*2 + Nr*4;
  m_pSectTab = MB_NEW Vector4D[m_nSectTabSz];
  m_sftypes.resize(m_nSectTabSz);

  int i,j;
  double th, si, co;


  for (j=0, i=0; j<Nr; i++, j++) {
    th = double(j)*M_PI/(2.0*double(Nr));
    si = ::sin(th); co = ::cos(th);
    m_pSectTab[i].x() = Ax + co*Rx;
    m_pSectTab[i].y() = Ay + si*Rx;
    m_pSectTab[i].z() = co;
    m_pSectTab[i].w() = si;
    m_sftypes[i] = TSSF_SIDE2;
  }
  for (j=0; j<Nx; i++, j++) {
    const double d = 2.0*Ax * double(j)/double(Nx);
    m_pSectTab[i].x() = Ax - d;
    m_pSectTab[i].y() = Ay + Rx;
    m_pSectTab[i].z() = 0.0;
    m_pSectTab[i].w() = 1.0;
    m_sftypes[i] = TSSF_SIDE2;
  }
  for (j=0; j<Nr; i++, j++) {
    th = double(j)*M_PI/(2.0*double(Nr)) + M_PI*0.5;
    si = ::sin(th); co = ::cos(th);
    m_pSectTab[i].x() = - Ax + co*Rx;
    m_pSectTab[i].y() = Ay + si*Rx;
    m_pSectTab[i].z() = co;
    m_pSectTab[i].w() = si;
    m_sftypes[i] = TSSF_SIDE2;
  }
  for (j=0; j<Ny; i++, j++) {
    const double d = 2.0*Ay * double(j)/double(Ny);
    m_pSectTab[i].x() = -Ax - Rx;
    m_pSectTab[i].y() = Ay - d;
    m_pSectTab[i].z() = -1.0;
    m_pSectTab[i].w() =  0.0;
    m_sftypes[i] = TSSF_FRONT;
  }
  for (j=0; j<Nr; i++, j++) {
    th = double(j)*M_PI/(2.0*double(Nr)) + M_PI;
    si = ::sin(th); co = ::cos(th);
    m_pSectTab[i].x() = - Ax + co*Rx;
    m_pSectTab[i].y() = - Ay + si*Rx;
    m_pSectTab[i].z() = co;
    m_pSectTab[i].w() = si;
    m_sftypes[i] = TSSF_SIDE1;
  }
  for (j=0; j<Nx; i++, j++) {
    const double d = 2.0*Ax * double(j)/double(Nx);
    m_pSectTab[i].x() = -Ax + d;
    m_pSectTab[i].y() = -Ay - Rx;
    m_pSectTab[i].z() =  0.0;
    m_pSectTab[i].w() = -1.0;
    m_sftypes[i] = TSSF_SIDE1;
  }
  for (j=0; j<Nr; i++, j++) {
    th = double(j)*M_PI/(2.0*double(Nr)) + M_PI*1.5;
    si = ::sin(th); co = ::cos(th);
    m_pSectTab[i].x() = Ax + co*Rx;
    m_pSectTab[i].y() = - Ay + si*Rx;
    m_pSectTab[i].z() = co;
    m_pSectTab[i].w() = si;
    m_sftypes[i] = TSSF_SIDE1;
  }
  for (j=0; j<Ny; i++, j++) {
    const double d = 2.0*Ay * double(j)/double(Ny);
    m_pSectTab[i].x() =  Ax + Rx;
    m_pSectTab[i].y() = -Ay + d;
    m_pSectTab[i].z() =  1.0;
    m_pSectTab[i].w() =  0.0;
    m_sftypes[i] = TSSF_BACK;
  }
}

void TubeSection::setupRectSection()
{
  const double Ax = m_lw;
  const double Ay = m_lw*m_tuber;
  const double Wx = Ax*2.0;
  const double Wy = Ay*2.0;

  const double delta = (2.0*Wx+2.0*Wy)/double(m_nSectDetail);
  //MB_DPRINTLN("TubSec> delta = %f", delta);
  const int Nx = qlib::max(1, int(::floor(Wx/delta)));
  const int Ny = qlib::max(1, int(::floor(Wy/delta)));
  //MB_DPRINTLN("TubSec> Wx(%f)/del = Nx = %d", Wx, Nx);
  //MB_DPRINTLN("TubSec> Wy(%f)/del = Ny = %d", Wy, Ny);
  m_nSectTabSz = 8 + (Nx-1)*2 + (Ny-1)*2;
  m_pSectTab = MB_NEW Vector4D[m_nSectTabSz];
  m_sftypes.resize(m_nSectTabSz);

  // const double Rx = m_lw*(1-m_alpha);
  int i = 0, j;

  for (j=0; j<=Nx; ++j, ++i) {
    m_pSectTab[i] = Vector4D(Ax - (Wx*double(j))/double(Nx), Ay, 0.0, 1.0);
    m_sftypes[i] = TSSF_SIDE2;
  }
  for (j=0; j<=Ny; ++j, ++i) {
    m_pSectTab[i] = Vector4D(-Ax, Ay - (Wy*double(j))/double(Ny), -1.0, 0.0);
    m_sftypes[i] = TSSF_FRONT;
  }
  for (j=0; j<=Nx; ++j, ++i) {
    m_pSectTab[i] = Vector4D(-Ax + (Wx*double(j))/double(Nx), -Ay, 0.0, -1.0);
    m_sftypes[i] = TSSF_SIDE1;
  }
  for (j=0; j<=Ny; ++j, ++i) {
    m_pSectTab[i] = Vector4D(Ax, -Ay + (Wy*double(j))/double(Ny), 1.0, 0.0);
    m_sftypes[i] = TSSF_BACK;
  }

}

void TubeSection::setupMolScrSection()
{
  const double R = m_lw;
  const double Ay = m_lw*m_tuber;

  //
  const double theta = qlib::toRadian(180.0 * m_alpha);
  MB_DPRINTLN("TubSec> theta = %f", qlib::toDegree(theta));

  const double costh = ::cos(theta);
  const double sinth = ::sin(theta);
  //const double R = Ax / sinth;
  const double Ax = R * sinth;
  const double By = qlib::max(Ay - R*(1+costh), 0.0);
  const double Cy = By + R*costh;

  // const double arc = 
  const double phi = 2.0*(M_PI-theta);
  const double Wx = phi * R;
  const double Wy = By*2.0;

  const double delta = (2.0*Wy + 2.0*Wx)/double(m_nSectDetail);
  MB_DPRINTLN("TubSec> delta = %f", delta);

  const int Nx = qlib::max(4, int(::floor(Wx/delta))) * 2;
  const int Ny = qlib::max(1, int(::floor(Wy/delta)));
  MB_DPRINTLN("TubSec> Wx(%f)/del = Nx = %d", Wx, Nx);
  MB_DPRINTLN("TubSec> Wy(%f)/del = Ny = %d", Wy, Ny);
  m_Nx = Nx;
  m_Ny = Ny;

  m_nSectTabSz = (Nx+1)*2 + (Ny+1)*2;
  m_pSectTab = MB_NEW Vector4D[m_nSectTabSz];
  m_sftypes.resize(m_nSectTabSz);

  int i = 0, j;

  const double dphi = phi / double(Nx);

  double xi0 = - (M_PI/2.0-theta);
  for (j=0; j<=Nx; ++j, ++i) {
    const double xi = xi0 + double(j) * dphi;
    const double cosxi = ::cos(xi);
    const double sinxi = ::sin(xi);
    m_pSectTab[i] = Vector4D(cosxi*R, sinxi*R + Cy,
                             cosxi, sinxi);
    m_sftypes[i] = TSSF_SIDE2;
  }

  //////////

  for (j=0; j<=Ny; ++j, ++i) {
    m_pSectTab[i] = Vector4D(-Ax, By - (Wy*double(j))/double(Ny),
                             -1.0, 0.0);
    m_sftypes[i] = TSSF_FRONT;
  }

  //////////
  
  xi0 = M_PI/2.0 + theta;
  for (j=0; j<=Nx; ++j, ++i) {
    const double xi = xi0 + double(j) * dphi;
    const double cosxi = ::cos(xi);
    const double sinxi = ::sin(xi);
    m_pSectTab[i] = Vector4D(cosxi*R, sinxi*R - Cy,
                             cosxi, sinxi);
    m_sftypes[i] = TSSF_SIDE1;
  }

  //////////

  for (j=0; j<=Ny; ++j, ++i) {
    m_pSectTab[i] = Vector4D(Ax, -By + (Wy*double(j))/double(Ny),
                             1.0, 0.0);
    m_sftypes[i] = TSSF_BACK;
  }
}

void TubeSection::setupSectionTable()
{
  if (m_pSectTab!=NULL)
    delete [] m_pSectTab;

  switch (m_nSectType) {
  default:
  case TS_ELLIPTICAL: {
    setupEllipticalSection();
    break;
  }
    
  case TS_SQUARE: {
    setupSquareSection();
    break;
  }

  case TS_RECT: {
    setupRectSection();
    break;
  }
    
  case TS_MOLSCR: {
    setupMolScrSection();
    break;
  }

  } // switch

  return;
}

void TubeSection::invalidate()
{
  if (m_pSectTab!=NULL)
    delete [] m_pSectTab;
  m_pSectTab = NULL;
}

bool TubeSection::resetProperty(const LString &propnm)
{
  bool res = StyleResetPropImpl::resetProperty(propnm, this);
  if (!res) {
    // stylesheet value is not found --> default behaviour
    return super_t::resetProperty(propnm);
  }

  return true;
}

///////////////////////////////////////////////////////
// Cap rendering routine

void TubeSection::makeCap(DisplayContext *pdl,
                           bool fStart, int nType,
                           const Vector4D &f, const Vector4D &vpt,
                           const Vector4D &e1, const Vector4D &e2)
{
  switch (nType) {
  case 2:
  default:
    // no cap (transparent)
    break;

  case 1:
    // Flat cap
    makeFlatCap(pdl, fStart, f, vpt, e1, e2);
    break;

  case 0:
    // Spherical cap
    makeSpherCap(pdl, fStart, f, vpt, e1, e2);
    break;
  }
}

void TubeSection::makeFlatCap(DisplayContext *pdl,
                               bool fStart,
                               const Vector4D &f, const Vector4D &vpt,
                               const Vector4D &e1, const Vector4D &e2)
{
  int j;
  Vector4D norm = vpt.normalize();

  if (fStart)
    norm = -norm;

  if (m_nSectType==TS_MOLSCR) {
    //pdl->setPolygonMode(DisplayContext::POLY_LINE);

    Vector4D g0 = getVec(0, e1, e2);
    Vector4D gnx = getVec(m_Nx, e1, e2);
    Vector4D f2 = (g0+gnx).divide(2.0) + f;

    pdl->startTriangleFan();
    pdl->normal(norm);
    pdl->vertex(f2);
    if (fStart) {
      for (j=m_Nx; j>=0; j--) {
        Vector4D gj = getVec(j, e1, e2);
        pdl->vertex(f + gj);
      }
    }
    else {
      for (j=0; j<=m_Nx; j++) {
        Vector4D gj = getVec(j, e1, e2);
        pdl->vertex(f + gj);
      }
    }
    pdl->end();

    ///

    g0 = getVec(m_Nx+m_Ny+2, e1, e2);
    gnx = getVec(2*m_Nx+m_Ny+2, e1, e2);
    Vector4D f3 = (g0+gnx).divide(2.0) + f;

    pdl->startTriangleFan();
    pdl->vertex(f3);
    if (fStart) {
      for (j=m_Nx; j>=0; j--) {
        Vector4D gj = getVec(j+m_Nx+m_Ny+2, e1, e2);
        pdl->vertex(f + gj);
      }
    }
    else {
      for (j=0; j<=m_Nx; j++) {
        Vector4D gj = getVec(j+m_Nx+m_Ny+2, e1, e2);
        pdl->vertex(f + gj);
      }
    }
    pdl->end();

    ///

    pdl->startTriangleFan();
    pdl->vertex(f);
    if (fStart) {
      pdl->vertex(f2);
      for (j=m_Ny; j>=0; j--) {
        Vector4D gj = getVec(j+2*m_Nx+m_Ny+3, e1, e2);
        pdl->vertex(f + gj);
      }
      pdl->vertex(f3);
      for (j=m_Ny; j>=0; j--) {
        Vector4D gj = getVec(j+m_Nx+1, e1, e2);
        pdl->vertex(f + gj);
      }
      pdl->vertex(f2);
    }
    else {
      pdl->vertex(f2);
      for (j=0; j<=m_Ny; j++) {
        Vector4D gj = getVec(j+m_Nx+1, e1, e2);
        pdl->vertex(f + gj);
      }
      pdl->vertex(f3);
      for (j=0; j<=m_Ny; j++) {
        Vector4D gj = getVec(j+2*m_Nx+m_Ny+3, e1, e2);
        pdl->vertex(f + gj);
      }
      pdl->vertex(f2);
    }
    pdl->end();

  }
  else {
    // std::deque<Vector4D> tmpv;
    pdl->startTriangleFan();
    pdl->normal(norm);
    pdl->vertex(f);

    const int nsize = getSize();
    if (!fStart) {
      for (j=0; j<=nsize; j++) {
        Vector4D g2 = getVec(j, e1, e2);
        pdl->vertex(f+g2);
        //tmpv.push_back(f+g2);
        //tmpv.push_back(f+g2+norm);
      }
    }
    else {
      for (j=nsize; j>=0; j--) {
        Vector4D g2 = getVec(j, e1, e2);
        pdl->vertex(f+g2);
        //tmpv.push_back(f+g2);
        //tmpv.push_back(f+g2-norm);
      }
    }
    pdl->end();

    /*
  pdl->startLines();
  BOOST_FOREACH (const Vector4D &elem, tmpv) {
    pdl->vertex(elem);
  }
  pdl->end();
     */
  }
}

void TubeSection::makeSpherCap(DisplayContext *pdl,
                                bool fStart,
                                const Vector4D &f, const Vector4D &vpt,
                                const Vector4D &e1, const Vector4D &e2)
{
  int i,j;

  const int detail = 5;
  double sign, e1len = getVec(0, e1, e2).length();
  sign = (fStart) ? -1.0 : 1.0;
  
  Vector4D v = vpt.scale(1.0/vpt.length());
  v = v.scale(sign*e1len/double(detail));
  
  double gpar2, t2;
  Vector4D f2, e21, e22;
  
  //  int stab_sz =
  for (i=0; i<=detail; i++) {
    double t = double(i)/double(detail);
    double gpar = ::sqrt(1.0-t*t);
    //double dgp = -t/gpar;
    Vector4D f1 = f+v.scale(double(i));
    Vector4D e11 = e1.scale(gpar);
    Vector4D e12 = e2.scale(gpar);
    
    if (i==0) {
      t2 = t;
      gpar2 = gpar;
      f2 = f1;
      e21 = e11;
      e22 = e12;
      continue;
    }
    
    // render tube body
    pdl->startTriangleStrip();
    for (j=0; j<=getSize(); j++) {
      Vector4D stab = getSectTab(j);
      
      Vector4D g1 = e11.scale(stab.x()) + e12.scale(stab.y());
      Vector4D dg1 = e11.scale(stab.z()) + e12.scale(stab.w());
      Vector4D dgp1 = e11.scale(-stab.w()) + e12.scale(stab.z());
      if (i==detail)
        dg1 = v;
      else
        dg1 = dg1.scale(e1len*gpar) - (dgp1.cross(g1)).scale(t*sign);
      
      Vector4D g2 = e21.scale(stab.x()) + e22.scale(stab.y());
      Vector4D dg2 = e21.scale(stab.z()) + e22.scale(stab.w());
      Vector4D dgp2 = e21.scale(-stab.w()) + e22.scale(stab.z());
      dg2 = dg2.scale(e1len*gpar2) - (dgp2.cross(g2)).scale(t2*sign);
      
      // pdl->color(col);
      if (fStart) {
        pdl->normal(dg2);
        pdl->vertex(f2+g2);
        pdl->normal(dg1);
        pdl->vertex(f1+g1);
      }
      else {
        pdl->normal(dg1);
        pdl->vertex(f1+g1);
        pdl->normal(dg2);
        pdl->vertex(f2+g2);
        }
    }
    
    pdl->end();
    t2 = t;
    gpar2 = gpar;
      f2 = f1;
    e21 = e11;
    e22 = e12;
    
  }
}

///////////////////////////////
// Tube tesselation routines

//#define DEBUG_SHOW_NORMAL 1

void TubeSection::startTess()
{
  const int nsize = getSize();
  m_vtess.resize(nsize+1);
  m_ntess.resize(nsize+1);
  m_bTessEmpty = true;
}

void TubeSection::doTess(DisplayContext *pdl,
                         const Vector4D &f1,
                         const gfx::ColorPtr &pCol, bool bSmoothCol,
                         const Vector4D &e11, const Vector4D &e12,
                         const Vector4D &norm_shift)
{
  const int nsize = getSize();
  std::vector<Vector4D> vts(nsize+1), nts(nsize+1);

  for (int k=0; k<=nsize; k++) {
    vts[k] = f1 + getVec(k, e11, e12);
    nts[k] = ( getNormVec(k, e11, e12) + norm_shift ).normalize();
  }

  if (!m_bTessEmpty) {
    pdl->startTriangleStrip();
    for (int k=0; k<=nsize; k++) {
      pdl->normal(nts[k]);
      pdl->color(pCol);
      pdl->vertex(vts[k]);

      pdl->normal(m_ntess[k]);
      if (bSmoothCol)
        pdl->color(m_pPrevCol);
      pdl->vertex(m_vtess[k]);
    }
    pdl->end();
  }

  for (int k=0; k<=nsize; k++) {
    m_vtess[k] = vts[k];
    m_ntess[k] = nts[k];
  }
  m_pPrevCol = pCol;
  m_bTessEmpty = false;

}

void TubeSection::doTess(DisplayContext *pdl,
                         const Vector4D &f1,
                         const gfx::ColorPtr &pCol, bool bSmoothCol,
                         const Vector4D &e11, const Vector4D &e12,
                         const Vector4D &escl, const Vector4D &vpt)
{
  const int nsize = getSize();
  std::vector<Vector4D> vts(nsize+1), nts(nsize+1);

  for (int k=0; k<=nsize; k++) {
    vts[k] = f1 + getVec(k, e11, e12);
    nts[k] = ( getNormVec(k, e11, e12).normalize() + calcDnorm(k, escl, vpt) ).normalize();
    //nts[k] = ( getNormVec(k, e11, e12) ).normalize();
  }

  if (!m_bTessEmpty) {
    pdl->startTriangleStrip();
    for (int k=0; k<=nsize; k++) {
      pdl->normal(nts[k]);
      pdl->color(pCol);
      pdl->vertex(vts[k]);

      pdl->normal(m_ntess[k]);
      if (bSmoothCol)
        pdl->color(m_pPrevCol);
      pdl->vertex(m_vtess[k]);
    }
    pdl->end();
  }

#ifdef DEBUG_SHOW_NORMAL
  {
    pdl->startLines();
    for (int k=0; k<=nsize; k++) {
      pdl->vertex(vts[k]);
      pdl->vertex(vts[k]+nts[k].scale(0.25));
    }
    pdl->end();
  }
#endif

  for (int k=0; k<=nsize; k++) {
    m_vtess[k] = vts[k];
    m_ntess[k] = nts[k];
  }
  m_pPrevCol = pCol;
  m_bTessEmpty = false;

}

void TubeSection::endTess()
{
}

Vector4D TubeSection::calcDnorm(int index, const Vector4D &escl, const Vector4D &vpt)
{
  const Vector4D &sect = m_pSectTab[index%m_nSectTabSz];

  const double sz = qlib::abs(sect.z());
  const double sw = qlib::abs(sect.w());

  const double ez = escl.z() * m_lw;
  const double ew = escl.w() * m_lw * m_tuber;

  double dn = -(sz*ez + sw*ew);
  double vlen2 = vpt.sqlen();
  /*double dn =
    sect.z()*escl.y() * sect.x()*escl.z() -
      sect.w()*escl.x() * sect.y()*escl.w();
*/
  // dn /= vpt.sqlen();
  
  return vpt.scale(dn/vlen2);
}


/// Render the partitions at the arrowhead junction
void TubeSection::makeDisconJct(DisplayContext *pdl,
                                const Vector4D &f1, const Vector4D &ev,
                                const Vector4D &e11, const Vector4D &e12,
                                const Vector4D &escl, const Vector4D &escl_prev)
{

  const Vector4D pe1 = e11.scale(escl_prev.x());
  const Vector4D pe2 = e12.scale(escl_prev.y());

  const Vector4D ne1 = e11.scale(escl.x());
  const Vector4D ne2 = e12.scale(escl.y());

  pdl->setPolygonMode(gfx::DisplayContext::POLY_FILL);
//  pdl->setPolygonMode(gfx::DisplayContext::POLY_LINE);
  pdl->startTriangleStrip();
  pdl->normal(-ev);

  int j, nsize = getSize();
  for (j=0; j<=nsize; j++) {
    Vector4D pg = getVec(j, pe1, pe2);
    Vector4D ng = getVec(j, ne1, ne2);
    pdl->vertex(f1+pg);
    pdl->vertex(f1+ng);
  }

  pdl->end();


  //m_ptsSheet->makeFlatCap(pdl, false,
  // f1,
  // ev,
  // e11.scale(prev_escl.x()),
  // e12.scale(prev_escl.y()));
  //
  //m_ptsSheet->makeFlatCap(pdl, true,
  // f1,
  // ev,
  // e11.scale(escl.x()),
  // e12.scale(escl.y()));

}
