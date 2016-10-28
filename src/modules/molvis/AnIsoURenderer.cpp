// -*-Mode: C++;-*-
//
//  Ball & Stick model with ORTEP-like anisou display
//
//  $Id: AnIsoURenderer.cpp,v 1.6 2010/11/03 11:34:20 rishitani Exp $

#include <common.h>
#include "molvis.hpp"

#include "AnIsoURenderer.hpp"

#include <qlib/Matrix3D.hpp>

#include <gfx/DisplayContext.hpp>
#include <gfx/Hittest.hpp>

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>

using namespace molvis;
using qlib::Matrix3D;
using qlib::Matrix4D;

AnIsoURenderer::AnIsoURenderer()
     : m_pSphrTab(NULL)
{
}

AnIsoURenderer::~AnIsoURenderer()
{
  if (m_pSphrTab!=NULL)
    delete m_pSphrTab;
}

const char *AnIsoURenderer::getTypeName() const
{
  return "anisou";
}

void AnIsoURenderer::display(DisplayContext *pdc)
{
  // avoid to use BallStick implementation of display() (using VBO/shader)
  MolAtomRenderer::display(pdc);
  return;
}

void AnIsoURenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("detail")) {
    buildSphrTab();
  }
  else if (ev.getName().equals("drawdisc") ||
           ev.getName().equals("discscale") ||
           ev.getName().equals("discthick")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void AnIsoURenderer::buildSphrTab()
{
  int j, ndet = getDetail();

  double thdel = M_PI/2.0/double(ndet);

  m_pSphrTab = MB_NEW std::valarray<double>((ndet+1)*2);
  
  for (j=0; j<=ndet; ++j) {
    double c = ::cos(double(j)*thdel);
    double s = ::sin(double(j)*thdel);
    (*m_pSphrTab)[j*2] = c;
    (*m_pSphrTab)[j*2+1] = s;
  }
}

void AnIsoURenderer::drawDisc(DisplayContext *pdl, double norm)
{
  int i, j, ndet = getDetail();

  pdl->startTriangleFan();
  pdl->normal(0, 0, norm);
  pdl->vertex(0, 0, 0);
  for (i=ndet; i>=0; --i) {
    double c1 = sphrcos(i);
    double s1 = sphrsin(i);
    pdl->vertex(c1, s1, 0);
  }
  pdl->end();
}

void AnIsoURenderer::drawQsphere(DisplayContext *pdl,
                                 bool bSphere/*=true*/,
                                 bool bCap/*=true*/,
                                 double fCapDir/*=-1.0*/)
{
  int i, j, ndet = getDetail();

  if (m_pSphrTab==NULL ||
      (ndet+1)*2!=m_pSphrTab->size())
    buildSphrTab();

  if (bSphere) {
    //pdl->startLineStrip();
    for (j=0; j<ndet; ++j) {
      double z1 = sphrcos(j);
      double sc1 = sphrsin(j);
      double z2 = sphrcos(j+1);
      double sc2 = sphrsin(j+1);

      if (j==0) {
        pdl->startTriangleFan();
        pdl->normal(0, 0, 1);
        pdl->vertex(0, 0, 1);
        for (i=0; i<=ndet; ++i) {
          double c1 = sphrcos(i);
          double s1 = sphrsin(i);

          pdl->normal(sc2*c1, sc2*s1, z2);
          pdl->vertex(sc2*c1, sc2*s1, z2);
        }
        pdl->end();
        continue;
      }

      pdl->startTriangleStrip();
      for (i=0; i<ndet; ++i) {
        double c1 = sphrcos(i);
        double s1 = sphrsin(i);
        double c2 = sphrcos(i+1);
        double s2 = sphrsin(i+1);

        pdl->normal(sc1*c1, sc1*s1, z1);
        pdl->vertex(sc1*c1, sc1*s1, z1);

        pdl->normal(sc2*c1, sc2*s1, z2);
        pdl->vertex(sc2*c1, sc2*s1, z2);

        pdl->normal(sc1*c2, sc1*s2, z1);
        pdl->vertex(sc1*c2, sc1*s2, z1);

        pdl->normal(sc2*c2, sc2*s2, z2);
        pdl->vertex(sc2*c2, sc2*s2, z2);
      }
      pdl->end();
    }
  }
  
  if (bCap) {
    Matrix4D r;

    // Z
    drawDisc(pdl, fCapDir);

    // X
    r.aij(1,1) = 0.0; r.aij(1,2) = 1.0; r.aij(1,3) = 0.0;
    r.aij(2,1) = 0.0; r.aij(2,2) = 0.0; r.aij(2,3) = 1.0;
    r.aij(3,1) = 1.0; r.aij(3,2) = 0.0; r.aij(3,3) = 0.0;
    pdl->pushMatrix();
    pdl->multMatrix(r);
    drawDisc(pdl, fCapDir);
    pdl->popMatrix();

    // Y
    r.aij(1,1) = 0.0; r.aij(1,2) = 0.0; r.aij(1,3) = 1.0;
    r.aij(2,1) = 1.0; r.aij(2,2) = 0.0; r.aij(2,3) = 0.0;
    r.aij(3,1) = 0.0; r.aij(3,2) = 1.0; r.aij(3,3) = 0.0;
    pdl->pushMatrix();
    pdl->multMatrix(r);
    drawDisc(pdl, fCapDir);
    pdl->popMatrix();
  }
}

void AnIsoURenderer::drawSphere(DisplayContext *pdl)
{
  Matrix4D r;
  
  if (m_fDrawDisc) {
    pdl->cylinderCap(m_dDiscScale, Vector4D(0, 0, m_dDiscThick/2.0), Vector4D(0, 0, -m_dDiscThick/2.0));
    pdl->cylinderCap(m_dDiscScale, Vector4D(0, m_dDiscThick/2.0, 0), Vector4D(0, -m_dDiscThick/2.0, 0));
    pdl->cylinderCap(m_dDiscScale, Vector4D(m_dDiscThick/2.0, 0, 0), Vector4D(-m_dDiscThick/2.0, 0, 0));
  }
  //else {
  //}
  
  ////

  r.aij(1,1) = 0.0; r.aij(1,2) =-1.0; r.aij(1,3) = 0.0;
  r.aij(2,1) = 1.0; r.aij(2,2) = 0.0; r.aij(2,3) = 0.0;
  r.aij(3,1) = 0.0; r.aij(3,2) = 0.0; r.aij(3,3) = 1.0;
  pdl->pushMatrix();
  pdl->multMatrix(r);
  drawQsphere(pdl, true, false);
  pdl->popMatrix();

  r.aij(1,1) = 0.0; r.aij(1,2) = 1.0; r.aij(1,3) = 0.0;
  r.aij(2,1) =-1.0; r.aij(2,2) = 0.0; r.aij(2,3) = 0.0;
  r.aij(3,1) = 0.0; r.aij(3,2) = 0.0; r.aij(3,3) = 1.0;
  pdl->pushMatrix();
  pdl->multMatrix(r);
  drawQsphere(pdl, true, false);
  pdl->popMatrix();

  r.aij(1,1) =-1.0; r.aij(1,2) = 0.0; r.aij(1,3) = 0.0;
  r.aij(2,1) = 0.0; r.aij(2,2) =-1.0; r.aij(2,3) = 0.0;
  r.aij(3,1) = 0.0; r.aij(3,2) = 0.0; r.aij(3,3) = 1.0;
  pdl->pushMatrix();
  pdl->multMatrix(r);
  drawQsphere(pdl, true, false);
  pdl->popMatrix();

  //

  r.aij(1,1) = 0.0; r.aij(1,2) = 1.0; r.aij(1,3) = 0.0;
  r.aij(2,1) = 1.0; r.aij(2,2) = 0.0; r.aij(2,3) = 0.0;
  r.aij(3,1) = 0.0; r.aij(3,2) = 0.0; r.aij(3,3) =-1.0;
  pdl->pushMatrix();
  pdl->multMatrix(r);
  drawQsphere(pdl, true, false);
  pdl->popMatrix();

  r.aij(1,1) =-1.0; r.aij(1,2) = 0.0; r.aij(1,3) = 0.0;
  r.aij(2,1) = 0.0; r.aij(2,2) = 1.0; r.aij(2,3) = 0.0;
  r.aij(3,1) = 0.0; r.aij(3,2) = 0.0; r.aij(3,3) =-1.0;
  pdl->pushMatrix();
  pdl->multMatrix(r);
  drawQsphere(pdl, true, false);
  pdl->popMatrix();

  r.aij(1,1) = 1.0; r.aij(1,2) = 0.0; r.aij(1,3) = 0.0;
  r.aij(2,1) = 0.0; r.aij(2,2) =-1.0; r.aij(2,3) = 0.0;
  r.aij(3,1) = 0.0; r.aij(3,2) = 0.0; r.aij(3,3) =-1.0;
  pdl->pushMatrix();
  pdl->multMatrix(r);
  drawQsphere(pdl, true, false);
  pdl->popMatrix();

  r.aij(1,1) = 0.0; r.aij(1,2) =-1.0; r.aij(1,3) = 0.0;
  r.aij(2,1) =-1.0; r.aij(2,2) = 0.0; r.aij(2,3) = 0.0;
  r.aij(3,1) = 0.0; r.aij(3,2) = 0.0; r.aij(3,3) =-1.0;
  pdl->pushMatrix();
  pdl->multMatrix(r);
  drawQsphere(pdl, true, false);
  pdl->popMatrix();
  
}


void AnIsoURenderer::rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool)
{
  pdl->color(super_t::ColSchmHolder::getColor(pAtom));

  if (!pAtom->hasAnIsoU()) {
    double u = pAtom->getBfac()/(8.0*M_PI*M_PI);
    pdl->sphere(::sqrt(u)*getSphr(), pAtom->getPos());
  }
  else {
    Matrix3D aiu;
    aiu.aij(1,1) = pAtom->getU(0, 0);
    aiu.aij(2,1) = aiu.aij(1,2) = pAtom->getU(0, 1);
    aiu.aij(3,1) = aiu.aij(1,3) = pAtom->getU(0, 2);
    aiu.aij(2,2) = pAtom->getU(1, 1);
    aiu.aij(3,2) = aiu.aij(2,3) = pAtom->getU(1, 2);
    aiu.aij(3,3) = pAtom->getU(2, 2);

    Matrix3D U;
    Vector4D lam, lam_orig;
    if (!aiu.diag(U, lam)) {
      LOG_DPRINTLN("ANISOU> fatal error: diagonalization failed for "
                   "%s %s %s %s",
                   pAtom->getChainName().c_str(),
                   pAtom->getResName().c_str(),
                   pAtom->getResIndex().toString().c_str(),
                   pAtom->getName().c_str());
      return;
    }

    bool bDumpErr=false;
    lam_orig = lam;
    if (lam.x()<=0) {
      lam.x() = -lam.x();
      bDumpErr = true;
    }
    if (lam.y()<=0) {
      lam.y() = -lam.y();
      bDumpErr = true;
    }
    if (lam.z()<=0) {
      lam.z() = -lam.z();
      bDumpErr = true;
    }

    if (bDumpErr) {
      LOG_DPRINTLN("ANISOU> Error, tensor is not positive-definitive!!"
                   "for %s %s%s %s",
                   pAtom->getChainName().c_str(),
                   pAtom->getResName().c_str(),
                   pAtom->getResIndex().toString().c_str(),
                   pAtom->getName().c_str());
      LOG_DPRINTLN("ANISOU> B:");
      LOG_DPRINTLN("ANISOU>   [%f %f %f]", aiu.aij(1,1), aiu.aij(1,2), aiu.aij(1,3));
      LOG_DPRINTLN("ANISOU>   [%f %f %f]", aiu.aij(2,1), aiu.aij(2,2), aiu.aij(2,3));
      LOG_DPRINTLN("ANISOU>   [%f %f %f]", aiu.aij(3,1), aiu.aij(3,2), aiu.aij(3,3));
      LOG_DPRINTLN("ANISOU> evals: {%f %f %f]", lam_orig.x(), lam_orig.y(), lam_orig.z());

      Matrix3D tmp(U);
      Matrix3D tmpt(U);
      tmp = tmp.transpose();

      tmp.matprod(aiu);
      tmp.matprod(tmpt);

      LOG_DPRINTLN("ANISOU> Diag: (tU.B.U)");
      LOG_DPRINTLN("ANISOU>   [%.5f %.5f %.5f]", tmp.aij(1,1), tmp.aij(1,2), tmp.aij(1,3));
      LOG_DPRINTLN("ANISOU>   [%.5f %.5f %.5f]", tmp.aij(2,1), tmp.aij(2,2), tmp.aij(2,3));
      LOG_DPRINTLN("ANISOU>   [%.5f %.5f %.5f]", tmp.aij(3,1), tmp.aij(3,2), tmp.aij(3,3));
    }
    
    pdl->pushMatrix();
    pdl->translate(pAtom->getPos());
    pdl->multMatrix(Matrix4D(U));
    pdl->scale(Vector4D(::sqrt(lam.x())*getSphr(),
                        ::sqrt(lam.y())*getSphr(),
                        ::sqrt(lam.z())*getSphr()));
    //pdl->sphere();

    drawSphere(pdl);

/*    pdl->startLines();
    pdl->vertex(0,0,0);
    pdl->vertex(2,0,0);
    pdl->vertex(0,0,0);
    pdl->vertex(0,2,0);
    pdl->vertex(0,0,0);
    pdl->vertex(0,0,2);
    pdl->end();*/

    pdl->popMatrix();

  }

  checkRing(pAtom->getID());
}

