// -*-Mode: C++;-*-
//
//  Backbone spline-trace renderer class
//
//  $Id: TubeRenderer.cpp,v 1.10 2010/11/03 11:34:20 rishitani Exp $

#include <common.h>

#include "TubeRenderer.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/ResidIterator.hpp>

//#include <molstr/ResiToppar.hpp>
//#include <molstr/ResiLink.hpp>
#include <qlib/Vector2D.hpp>
using qlib::Vector2D;

using namespace molvis;
using namespace molstr;

TubeRenderer::TubeRenderer()
     : SplineRenderer(), m_pts(MB_NEW TubeSection())
{
  super_t::setupParentData("section");

  m_dParLo = 0.0;
  m_dParAver= 10.0;
  m_dParHi= 20.0;

  m_dPuttyScl = 3.0;
  m_nPuttyMode = TBR_PUTTY_OFF;
  m_nPuttyTgt = TBR_PUTTY_BFAC;

  //resetAllProps();
}

TubeRenderer::~TubeRenderer()
{
}

const char *TubeRenderer::getTypeName() const
{
  return "tube";
}

/////////////////////////////////////////////////////

void TubeRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(true);
}

void TubeRenderer::beginRend(DisplayContext *pdl)
{
  if (!m_pts->isValid())
    m_pts->setupSectionTable();

  super_t::beginRend(pdl);

  if (m_nPuttyMode==TBR_PUTTY_OFF) {
    return;
  }

  // calc max bfac/occ in the putty mode

  SelectionPtr pSel;
  MolCoordPtr pMol = getClientMol();
  //MolRenderer *pMolRend = dynamic_cast<MolRenderer *>(pRend);
  //if (pMolRend!=NULL && m_nAuto==BFA_REND)
  pSel = getSelection();

  double dmin = 1.0e100, dmax = -1.0e100, val, dsum = 0.0;
  int nadd=0;
  ResidIterator iter(pMol, pSel);
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolResiduePtr pRes = iter.get();
    MolAtomPtr pAtom = getPivotAtom(pRes);

    if (pAtom.isnull()) continue;
    
    if (m_nPuttyTgt==TBR_PUTTY_OCC)
      val = pAtom->getOcc();
    else
      val = pAtom->getBfac();
    
    dsum += val;
    dmin = qlib::min(dmin, val);
    dmax = qlib::max(dmax, val);
    ++nadd;
  }
  
  m_dParHi = dmax;
  m_dParLo = dmin;
  m_dParAver = dsum/double(nadd);

  MB_DPRINTLN("Tube> init high=%f, low=%f, aver=%f OK.", dmax, dmin, m_dParAver);
}

/////////////////////////////////////////////////////

//virtual
void TubeRenderer::renderSpline(DisplayContext *pdl, SplineCoeff *pCoeff,
                                MolResiduePtr pStartRes, double fstart,
                                MolResiduePtr pEndRes, double fend)
{
  // Calculate num of drawing points "ndelta"
  const int naxdet = getAxialDetail();
  int ndelta = (int) ::floor( (fend-fstart)* naxdet );
  if (ndelta<=0) {
    // degenerated (single point)
    // TO DO: impl
    return;
  }
  const double fdelta = (fend-fstart)/double(ndelta);

  pdl->setLighting(true);
  pdl->setPolygonMode(DisplayContext::POLY_FILL_NORGLN);
  //pdl->setPolygonMode(DisplayContext::POLY_LINE);

  // ???
  // pdl->color(pCol);

  // Declare Vector variables used in the loop
  Vector4D bnorm, vpt, e11, e12, e21, e22, f1, f2;
  Vector4D prev_bnorm, prev_e1, prev_e2, prev_f;
  Vector4D g1, g2, dg1, dg2;

  // Color objects used in the loop
  ColorPtr pCol, pPrevCol;

  // Main loop for each drawing point
  //  i: drawing point index from 0 to ndelta
  //  par: spline coeffcient parameter (from fstart to fend)

  int i, j;
  for (i=0; i<=ndelta; i++) {
    double par = fstart + double(i)*fdelta; ///double( naxdet );

    pCol = calcColor(par, pCoeff);

    Vector2D escl = getEScl(par, pCoeff); //Vector2D(1.0, 1.0);

    pCoeff->interpNormal(par, &bnorm);
    pCoeff->interpAxis(par, &f1, &vpt);

    /*
    e12 = ( bnorm - f1 ).normalize();
    e11 = ( e12.cross(vpt) ).normalize();
     */

    double vlen = vpt.length();
    Vector4D e10 = vpt.divide(vlen);
    Vector4D bnf = bnorm - f1;
    Vector4D v12 = bnf-e10.scale(e10.dot(bnf));
    e12 = v12.normalize();
    e11 = e12.cross(e10);

    // e11/e12 scaling
    e11 = e11.scale(escl.x());
    e12 = e12.scale(escl.y());

    e21 = prev_e1, e22 = prev_e2, f2 = prev_f;

    if (i==0) {
      // Starting point of the segment:
      prev_e1 = e11;
      prev_e2 = e12;
      prev_f = f1;
      pPrevCol = pCol;

      if (!isSegEndFade() || !isSegEnd(par, pCoeff)) {
        // make the tube cap.
        pdl->color(pCol);
        m_pts->makeCap(pdl, true, getStartCapType(), f1, vpt, e11, e12);
      }
      continue;
    }

    if ((e11.isZero() || e12.isZero()) &&
        (!e21.isZero() && !e22.isZero())) {
      e11 = e21;
      e12 = e22;
    }
    else if ((e21.isZero() || e22.isZero()) &&
             (!e11.isZero() && !e12.isZero())) {
      e21 = e11;
      e22 = e12;
    }

    //
    // Render tube body
    //

    //std::deque<Vector4D> tmpv;
    pdl->startTriangleStrip();

    for (j=0; j<=m_pts->getSize(); j++) {
      g1 = m_pts->getVec(j, e11, e12);
      g2 = m_pts->getVec(j, e21, e22);
      dg1 = m_pts->getNormVec(j, e11, e12);
      dg2 = m_pts->getNormVec(j, e21, e22);
      pdl->normal(dg1);
      pdl->color(pCol);
      pdl->vertex(f1+g1);

      pdl->normal(dg2);
      if (isSmoothColor())
        pdl->color(pPrevCol);
      pdl->vertex(f2+g2);

      //tmpv.push_back(f1+g1);
      //tmpv.push_back(f1+g1+dg1.scale(0.2));
    }

    pdl->end();

    //pdl->startLines();
    //BOOST_FOREACH (const Vector4D &elem, tmpv) {
    //pdl->vertex(elem);
    //}
    //pdl->end();

    // Post processing
    if (i==ndelta) {
      if (!isSegEndFade() || !isSegEnd(par, pCoeff)) {
        // make cap at the end point.
        pdl->color(pCol);
        m_pts->makeCap(pdl, false, getEndCapType(), f1, vpt, e11, e12);
      }
    }

    prev_e1 = e11;
    prev_e2 = e12;
    prev_f = f1;
    pPrevCol = pCol;
  }
  
  pdl->setLighting(false);

  test(pdl, pCoeff, fstart, fend);
}

qlib::Vector2D TubeRenderer::getEScl(double par, SplineCoeff *pCoeff)
{
  if (m_nPuttyMode==TBR_PUTTY_OFF)
    return Vector2D(1,1);

  const double prod = 1.0;
  const double plus = 0.0;
  
  int nprev = int(::floor(par));
  int nnext = int(::ceil(par));
  double rho = par - double(nprev);
  
  MolResiduePtr pNext(pCoeff->getResidue(nnext));
  MolResiduePtr pPrev(pCoeff->getResidue(nprev));
  MolAtomPtr pAtom1, pAtom2;
  double par1 = 1.0, par2 = 1.0;

  if (!pPrev.isnull()) {
    pAtom1 = getPivotAtom(pPrev);
    if (m_nPuttyTgt==TBR_PUTTY_OCC)
      par1 = pAtom1->getOcc();
    else
      par1 = pAtom1->getBfac();

  }
  if (!pNext.isnull()) {
    pAtom2 = getPivotAtom(pNext);
    if (m_nPuttyTgt==TBR_PUTTY_OCC)
      par2 = pAtom2->getOcc();
    else
      par2 = pAtom2->getBfac();
  }
      
  // linear interpolation between two residues (if exists)
  double val;
  if (rho<F_EPS4)
    val = par1;
  else if (1.0-F_EPS4<rho)
    val = par2;
  else
    val = par1 * (1.0-rho) + par2 * rho;

  // convert val to scaling factor
  if (m_nPuttyMode==TBR_PUTTY_LINEAR1) {
    // linear conversion
    val = (val-m_dParLo)/(m_dParHi-m_dParLo);
    val = (m_dPuttyScl-1.0/m_dPuttyLoScl)*val + 1.0/m_dPuttyLoScl;
  }
  else if (m_nPuttyMode==TBR_PUTTY_SCALE1) {
    // multiplication conversion 1
    // scale val to (1/Nlo -- 1.0 -- Nhi) for (min -- aver -- max)
    if (val<m_dParAver) {
      val = (val-m_dParLo)/(m_dParAver-m_dParLo);
      // val = ::pow(m_dPuttyLoScl, val-1.0);
      val = ((m_dPuttyLoScl-1)*val+1.0)/m_dPuttyLoScl;
    }
    else {
      val = (val-m_dParAver)/(m_dParHi-m_dParAver);
      // val = ::pow(m_dPuttyScl, val);
      val = (m_dPuttyScl-1.0)*val + 1.0;
    }
  }
  else {
    // ERROR
    MB_ASSERT(false);
  }

  return Vector2D(val, val);
}


void TubeRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getParentName().equals("section")||
      ev.getParentName().startsWith("section.")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

////////////////////////////////////////////////////////////

#include <libpng/png.h>

void TubeRenderer::st2pos(SplineCoeff *pCoeff, double s, double t, Vector4D &pos)
{

  Vector4D bnorm, vpt, e11, e12, f1;
  Vector4D g1, g2, dg1, dg2;

  pCoeff->interpNormal(s, &bnorm);
  pCoeff->interpAxis(s, &f1, &vpt);

  double vlen = vpt.length();
  Vector4D e10 = vpt.divide(vlen);
  Vector4D bnf = bnorm - f1;
  // Vector4D v12 = bnf-e10.scale(e10.dot(bnf));

  //e12 = v12.normalize();
  e12 = bnf.normalize();
  e11 = e12.cross(e10);
  
  // // e11/e12 scaling
  // Vector2D escl = getEScl(s, pCoeff);
  // e11 = e11.scale(escl.x());
  // e12 = e12.scale(escl.y());
  
  const double tubew1 = m_pts->getWidth();
  const double tubew2 = m_pts->getWidth()*m_pts->getTuber();
  const double theta = 2.0*M_PI*t;
  g1 = e11.scale(cos(theta)*tubew1) + e12.scale(sin(theta)*tubew2);
  //g1 = m_pts->getVec(j, e11, e12);
  pos = f1 + g1;
  pos.w() = 1.0;
}

void TubeRenderer::st2pos_dt(SplineCoeff *pCoeff, double s, double t, Vector4D &pos)
{

  Vector4D bnorm, vpt, e11, e12, f1;
  Vector4D g1, g2, dg1, dg2;

  pCoeff->interpNormal(s, &bnorm);
  pCoeff->interpAxis(s, &f1, &vpt);

  double vlen = vpt.length();
  Vector4D e10 = vpt.divide(vlen);
  Vector4D bnf = bnorm - f1;

  e12 = bnf.normalize();
  e11 = e12.cross(e10);
  
  const double tubew1 = m_pts->getWidth();
  const double tubew2 = m_pts->getWidth()*m_pts->getTuber();
  const double theta = 2.0*M_PI*t;

  g1 = e11.scale(-sin(theta)*tubew1*2.0*M_PI) + e12.scale(cos(theta)*tubew2*2.0*M_PI);

  pos = g1;
  pos.w() = 0.0;
}

void TubeRenderer::st2pos_ds(SplineCoeff *pCoeff, double s, double t, Vector4D &pos)
{
  Vector4D f1, df1, ddf1;
  pCoeff->interpAxis(s, &f1, &df1, &ddf1);
  const double dflen = df1.length();

  Vector4D bnf1, dbnf1, ddbnf1;
  pCoeff->interpNormal(s, &bnf1, &dbnf1, &ddbnf1);
  Vector4D bn = bnf1 - f1;
  Vector4D dbn = dbnf1 - df1;
  Vector4D ddbn = ddbnf1 - ddf1;
  const double bnlen = bn.length();

  Vector4D e10, e11, e12;

  e10 = df1.divide(dflen);
  e12 = bn.divide(bnlen);
  e11 = e12.cross(e10);
  
  const double tubew1 = m_pts->getWidth();
  const double tubew2 = m_pts->getWidth()*m_pts->getTuber();
  const double theta = 2.0*M_PI*t;

  const double tx = cos(theta)*tubew1;
  const double ty = sin(theta)*tubew2;

  Vector4D de0, de1, de2;
  // s derivative of df1/|df1|
  de0 = ( df1.cross(ddf1.cross(df1)) ).divide(dflen*dflen*dflen);
  // s derivative of bnf/|bnf|
  de2 = ( bn.cross(dbn.cross(bn)) ).divide(bnlen*bnlen*bnlen);
  de1 = de2.cross(e10) + e12.cross(de0);

  pos = df1 + de1.scale(tx) + de2.scale(ty);
  //pos = de0;
  pos.w() = 0.0;
}

struct PixElem {
  double s;
  double t;
};

void TubeRenderer::st2posx(SplineCoeff *pCoeff, double s, double t, Vector4D &pos)
{

  Vector4D bnorm, vpt, e11, e12, f1;
  Vector4D g1, g2, dg1, dg2;

  pCoeff->interpNormal(s, &bnorm);
  pCoeff->interpAxis(s, &f1, &vpt);

  double vlen = vpt.length();
  Vector4D e10 = vpt.divide(vlen);
  Vector4D bnf = bnorm - f1;
  // Vector4D v12 = bnf-e10.scale(e10.dot(bnf));

  //e12 = v12.normalize();
  e12 = bnf.normalize();
  e11 = e12.cross(e10);
  
  // // e11/e12 scaling
  // Vector2D escl = getEScl(s, pCoeff);
  // e11 = e11.scale(escl.x());
  // e12 = e12.scale(escl.y());
  
  const double tubew1 = m_pts->getWidth();
  const double tubew2 = m_pts->getWidth()*m_pts->getTuber();
  const double theta = 2.0*M_PI*t;
  const double tx = cos(theta)*tubew1;
  const double ty = sin(theta)*tubew2;

  pos = f1 + e11.scale(tx) + e12.scale(ty);
  //pos = e10;
  pos.w() = 1.0;
}

bool TubeRenderer::solve_st(SplineCoeff *pCoeff, const Matrix4D &xfm, double x0, double y0, double &s, double &t, Vector4D &rpos)
{
  const double ftol = 1e-5;

  double delx, dely, dist;
  Vector4D pos;

  //double s = s0;
  //double t = t0;

  for (int k=0; k<6; ++k) {
    st2pos(pCoeff, s, t, pos);
    pos.w() = 1.0;
    xfm.xform4D(pos);
    
    delx = pos.x() - x0;
    dely = pos.y() - y0;
    dist = sqrt(delx*delx + dely*dely);
    
    if (dist<ftol) break;
    
    Vector4D pos_ds, pos_dt;
    st2pos_ds(pCoeff, s, t, pos_ds);
    xfm.xform4D(pos_ds);
    st2pos_dt(pCoeff, s, t, pos_dt);
    xfm.xform4D(pos_dt);
    
    const double j11 = pos_ds.x();
    const double j12 = pos_dt.x();
    const double j21 = pos_ds.y();
    const double j22 = pos_dt.y();
	
    const double det = 1.0/(j11*j22-j12*j21);
    const double rj11 = j22 * det;
    const double rj22 = j11 * det;
    const double rj12 = -j12 * det;
    const double rj21 = -j21 * det;
    
    s = s - ( rj11 * delx + rj12 * dely );
    t = t - ( rj21 * delx + rj22 * dely );
    
    //fprintf(fp, "d%d= %f ", k, dist);
    //LOG_DPRINT("d%d= %f ", k, dist);
  }
	
  st2pos(pCoeff, s, t, pos);
  pos.w() = 1.0;
  xfm.xform4D(pos);
  
  delx = pos.x() - x0;
  dely = pos.y() - y0;
  dist = sqrt(delx*delx + dely*dely);
  
  if (dist>ftol) {
    //fprintf(fp, "nconv %f\n", dist);
    //LOG_DPRINT("nconv %f\n", dist);
    return false;
  }

  //fprintf(fp, "conv %f\n", dist);
  //LOG_DPRINT("conv %f\n", dist);
  rpos = pos;
  return true;
}

void TubeRenderer::test(DisplayContext *pdl, SplineCoeff *pCoeff, double fstart, double fend)
{
  int i, j;
  const int naxdet = getAxialDetail();
  const int ndelta = (int) ::floor( (fend-fstart)* naxdet );
  const double fdelta = (fend-fstart)/double(ndelta);

  Vector4D bnorm, vpt, e11, e12, f1;
  Vector4D g1, g2, dg1, dg2;

  Matrix4D xfm = pdl->getMatrix();

  double slabdepth = (double) pdl->getSlabDepth();
  if (slabdepth<=0.1)
    slabdepth = 0.1;
  
  double zoom = pdl->getZoom(), dist = pdl->getViewDist();

  // double fHitPrec = 10.0; //(double) getHitPrec();
  double slabnear = dist-slabdepth/2.0;
  double slabfar  = dist+slabdepth;
  double vw = zoom/2.0;
  double fasp = 1.0;

  Matrix4D orthmat;
  const double left = -vw*fasp;
  const double right = vw*fasp;
  const double bottom = -vw;
  const double top = vw;
  const double nearVal = slabnear;
  const double farVal = slabfar;
  orthmat.aij(1,1) = 2.0/(right-left);
  orthmat.aij(2,2) = 2.0/(top-bottom);
  orthmat.aij(3,3) = -2.0/(farVal-nearVal);
  orthmat.aij(1,4) = - (right+left)/(right-left);
  orthmat.aij(2,4) = - (top+bottom)/(top-bottom);
  orthmat.aij(3,4) = - (farVal+nearVal)/(farVal-nearVal);
  orthmat.aij(4,4) = 1.0;
  //glOrtho(-vw*fasp, vw*fasp,
  //-vw, vw, slabnear, slabfar);
  xfm = orthmat.mul(xfm);

  const int width = 1024;
  const int height = 1024;
  unsigned char **ppImage;
  std::vector<float> depthbuf(width*height);
  std::vector<PixElem> stbuf(width*height);

  ppImage = new png_bytep[height];
  for (int i = 0; i < height; i++) {
    ppImage[i] = (png_bytep) new unsigned char[width*3];
    for (int j = 0; j < width; j++) {
      depthbuf[i*width + j] = 1.0e10;
    }
  }

  FILE *fp = fopen("xxx.dat", "w");
  const double eps = 0.00001;

  const int nSectSize = m_pts->getSize();
  const double tubew1 = m_pts->getWidth();
  const double tubew2 = m_pts->getWidth()*m_pts->getTuber();

  for (i=0; i<=ndelta; i++) {
    for (j=0; j<=nSectSize; j++) {
      const double s = fstart + double(i)*fdelta;
      const double t = double(j)/double(m_pts->getSize());
      Vector4D pos;
      st2pos(pCoeff, s, t, pos);
      pos.w() = 1.0;
      xfm.xform4D(pos);

      if (pos.x()<-1.0||pos.x()>1.0)
	continue;
      if (pos.y()<-1.0||pos.y()>1.0)
	continue;

      pos.x() = (pos.x()+1.0)*0.5;
      pos.y() = (pos.y()+1.0)*0.5;
      int x = int(pos.x() * width);
      int y = int((1.0-pos.y()) * height);

      //quint32 cc = gfx::AbstractColor::HSBtoRGB(t,s,1.0);
      /*{
	Vector4D pos_dt;
	st2pos_dt(pCoeff, s, t, pos_dt);
	//xfm.xform3D(pos_dt);

	Vector4D pos_ndt, pos1, pos2;
	st2pos(pCoeff, s, t-eps*0.5, pos1);
	//xfm.xform4D(pos1);
	st2pos(pCoeff, s, t+eps*0.5, pos2);
	//xfm.xform4D(pos2);
	pos_ndt = (pos2-pos1).divide(eps);
	
	const double diff = (pos_dt-pos_ndt).length();

	//fprintf(fp, "%d,%d, adt=%f,%f,%f, ndt=%f,%f,%f\n", i, j,
	//pos_dt.x(), pos_dt.y(), pos_dt.z(),
	//pos_ndt.x(), pos_ndt.y(), pos_ndt.z());

	fprintf(fp, "%d,%d, t diff %f\n", i, j, diff);
	}*/
      /*{
	Vector4D pos_ds;
	st2pos_ds(pCoeff, s, t, pos_ds);
	xfm.xform4D(pos_ds);

	Vector4D pos_nds, pos1, pos2;
	st2pos(pCoeff, s-eps*0.5, t, pos1);
	xfm.xform4D(pos1);
	st2pos(pCoeff, s+eps*0.5, t, pos2);
	xfm.xform4D(pos2);
	pos_nds = (pos2-pos1).divide(eps);
	
	const double diff = (pos_ds-pos_nds).length();
	
	//fprintf(fp, "%f,%f, adt=%f,%f,%f, ndt=%f,%f,%f\n", s, t,
	//pos_ds.x(), pos_ds.y(), pos_ds.z(),
	//pos_nds.x(), pos_nds.y(), pos_nds.z());

	fprintf(fp, "%f,%f, s diff %f\n", s, t, diff);
	}*/

      int ii, jj;
      const int px = 4;
      for (ii=-px; ii<=px; ii++) {
	for (jj=-px; jj<=px; jj++) {
	  int xx = x + ii;
	  int yy = y + jj;
	  if (xx<0||xx>=width) continue;
	  if (yy<0||yy>=height) continue;

	  double x0 = 2.0*double(xx)/width - 1.0;
	  double y0 = 1.0 - 2.0*double(yy)/height;

	  double sn = s, tn = t;
	  bool bconv = solve_st(pCoeff, xfm, x0, y0, sn, tn, pos);
	  if (!bconv) continue;

	  if (depthbuf[yy*width + xx] < pos.z()) continue;

	  const int ind = yy*width + xx;
	  depthbuf[ind] = pos.z();
	  //stbuf[ind].s = s;
	  //stbuf[ind].t = t;
	  
	  quint32 cc = gfx::AbstractColor::HSBtoRGB(fmod(sn, 1.0),tn,1.0);

	  ppImage[yy][xx*3+0] = gfx::getRCode(cc);
	  ppImage[yy][xx*3+1] = gfx::getGCode(cc);
	  ppImage[yy][xx*3+2] = gfx::getBCode(cc);
	  
	}
      }
    }
  }

#if 0
  const double ftol = 1e-5;

  for (j=0; j<height; j++) {
    for (i=0; i<width; i++) {
      const int ind = j*width + i;
      if (depthbuf[ind]>100.0)
	continue;

      double x0 = 2.0*double(i)/width - 1.0;
      double y0 = 1.0 - 2.0*double(j)/height;

      double s = stbuf[ind].s;
      double t = stbuf[ind].t;
      double delx, dely;
      Vector4D pos;

      fprintf(fp, "%.2f,%.2f, ", x0, y0);

      for (int k=0; k<6; ++k) {
	st2pos(pCoeff, s, t, pos);
	pos.w() = 1.0;
	xfm.xform4D(pos);
	
	delx = pos.x() - x0;
	dely = pos.y() - y0;
	dist = sqrt(delx*delx + dely*dely);
	
	if (dist<ftol) break;

	Vector4D pos_ds, pos_dt;
	st2pos_ds(pCoeff, s, t, pos_ds);
	xfm.xform4D(pos_ds);
	st2pos_dt(pCoeff, s, t, pos_dt);
	xfm.xform4D(pos_dt);
	
	const double j11 = pos_ds.x();
	const double j12 = pos_dt.x();
	const double j21 = pos_ds.y();
	const double j22 = pos_dt.y();
	
	const double det = 1.0/(j11*j22-j12*j21);
	const double rj11 = j22 * det;
	const double rj22 = j11 * det;
	const double rj12 = -j12 * det;
	const double rj21 = -j21 * det;
	
	s = s - ( rj11 * delx + rj12 * dely );
	t = t - ( rj21 * delx + rj22 * dely );

	fprintf(fp, "d%d= %f ", k, dist);
      }
	
      st2pos(pCoeff, s, t, pos);
      pos.w() = 1.0;
      xfm.xform4D(pos);

      delx = pos.x() - x0;
      dely = pos.y() - y0;
      dist = sqrt(delx*delx + dely*dely);

      if (dist>ftol) {
	fprintf(fp, "nconv %f\n", dist);
	continue;
      }
      fprintf(fp, "conv %f\n", dist);
      
      //s = s - () * (f(s)-x);

      /*
      pos.x() = (pos.x()+1.0)*0.5;
      pos.y() = (pos.y()+1.0)*0.5;
      const double x = (pos.x() * width);
      const double y = ((1.0-pos.y()) * height);
      */

      
      //quint32 cc = gfx::AbstractColor::HSBtoRGB(dist*50.0,
      //1.0,
      //1.0
      //);

      quint32 cc = gfx::AbstractColor::HSBtoRGB(t,
						s,
						1.0
						);

      ppImage[j][i*3+0] = gfx::getRCode(cc);
      ppImage[j][i*3+1] = gfx::getGCode(cc);
      ppImage[j][i*3+2] = gfx::getBCode(cc);

      //fprintf(fp, "%.2f,%.2f, x=%f, y=%f, dist= %f\n", x0, y0, pos.x(), pos.y(), dist);
    }
  }
#endif

  fclose(fp);

  png_structp     png_ptr;
  png_infop       info_ptr;
  FILE *fpng = fopen("xxx.png", "wb");
  png_ptr = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
  info_ptr = png_create_info_struct(png_ptr);
  png_init_io(png_ptr, fpng);
  png_set_IHDR(png_ptr, info_ptr, width, height,
	       8, PNG_COLOR_TYPE_RGB, PNG_INTERLACE_NONE,
	       PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);
  png_write_info(png_ptr, info_ptr);
  png_write_image(png_ptr, ppImage);
  png_write_end(png_ptr, info_ptr);
  png_destroy_write_struct(&png_ptr, &info_ptr);
  fclose(fpng);
}
