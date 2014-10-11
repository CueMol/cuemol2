// -*-Mode: C++;-*-
//
//  Junction form table for Ribbon
//
//  $Id: JctTable.cpp,v 1.4 2011/01/02 14:16:15 rishitani Exp $

#include <common.h>

#include "JctTable.hpp"
#include "TubeSection.hpp"

using namespace molvis;

JctTable::JctTable()
     : m_nTabSz(0), m_pParTab(NULL), m_pEsclTab(NULL)
{
  m_fPartition = true;
  m_nType = JT_ARROW1;
  // m_nType = JT_SMOOTH1;

  m_gamma = 2.2;
  m_basw = 0.0;
  m_arrow = 1.8;
}

JctTable::~JctTable()
{
  if (m_pParTab!=NULL)
    delete m_pParTab;
  if (m_pEsclTab!=NULL)
    delete m_pEsclTab;
}

void JctTable::invalidate()
{
  if (m_pParTab!=NULL)
    delete m_pParTab;
  if (m_pEsclTab!=NULL)
    delete m_pEsclTab;

  m_nTabSz = 0;
  m_pParTab = NULL;
  m_pEsclTab = NULL;
}

bool JctTable::setup_smo1(int ndetail, TubeSection *pts1, TubeSection *pts2, bool frev)
{
  int i;
  if (ndetail<1) return false;

  m_nTabSz = ndetail;
  m_pParTab = MB_NEW double[m_nTabSz];
  m_pEsclTab = MB_NEW ScaleDiff[m_nTabSz];

  double e1start = pts1->getWidth();
  double e2start = e1start * pts1->getTuber();

  double e1end = pts2->getWidth();
  double e2end = e1end * pts2->getTuber();

  double e1fac, e2fac, e1rng, e2rng;
  e1rng = e1end-e1start;
  e2rng = e2end-e2start;
  if (frev) {
    e1fac = e1start;
    e2fac = e2start;
  }
  else {
    e1fac = e1end;
    e2fac = e2end;
  }

//  if (frev)
//    MB_DPRINTLN("reverse");
//  else
//    MB_DPRINTLN("forward");
//  MB_DPRINTLN("X start:%f --> end:%f", e1start, e1end);
//  MB_DPRINTLN("Y start:%f --> end:%f", e2start, e2end);

  for (i=0; i<m_nTabSz; i++) {
    double t = double(i)/double(ndetail-1);
    double rho, drho;
    if (t<=0.5) {
      drho = 2.0*t;
      rho = ::pow(drho, m_gamma)/2.0;
    }
    else {
      drho = 2.0*(1.0-t);
      rho = 1.0 - ::pow(drho, m_gamma)/2.0;
    }
    drho = m_gamma*::pow(drho, m_gamma-1);

    m_pParTab[i] = t;
    m_pEsclTab[i].sclx = (e1start + rho*e1rng) / e1fac;
    m_pEsclTab[i].scly = (e2start + rho*e2rng) / e2fac;

    m_pEsclTab[i].difx = drho*e1rng/e1fac;
    m_pEsclTab[i].dify = drho*e2rng/e2fac;
        
    if (m_nType==JT_FLAT) {
      m_pEsclTab[i].scly = 1.0;
      m_pEsclTab[i].dify = 0.0;
    }

  }

//  for (i=0; i<m_nTabSz; i++) {
//    MB_DPRINTLN("%d (x,y) = (%f, %f)", i, m_pEsclTab[i].sclx, m_pEsclTab[i].scly);
//  }
//  MB_DPRINTLN("");

  return true;
}


bool JctTable::setup_arrow1(int ndetail, TubeSection *pts1, TubeSection *pts2, bool frev)
{
  int i;
  if (ndetail<2) return false;

  // ndetail must be even number.
  //ndetail++;
  //if (ndetail%2!=0)
  //ndetail++;

  m_nTabSz = ndetail+1;
  m_pParTab = MB_NEW double[m_nTabSz];
  m_pEsclTab = MB_NEW ScaleDiff[m_nTabSz];

  double e1start,e1end,e2start,e2end;

  // Reverse the start and end sizes for tail rendering mode.
  // (--> coeffs will be also reversed, after the calculation)
  if (frev) {
    e1start = pts1->getWidth();
    e1end = pts2->getWidth();
    e2start = pts1->getWidth() * pts1->getTuber();
    e2end = pts2->getWidth() * pts2->getTuber();
  }
  else {
    e1start = pts2->getWidth();
    e1end = pts1->getWidth();
    e2start = pts2->getWidth() * pts2->getTuber();
    e2end = pts1->getWidth() * pts1->getTuber();
  }
  
  // Here, we don't have to change the coeff base,
  // since the start and end was already exchanged in the code above.
  double e1fac, e2fac;
  e1fac = e1start;
  e2fac = e2start;

  int nbody = (int)::floor(double(ndetail)*m_basw);
  //if (nbody<=0) nbody = 1;
  int nhead = ndetail-nbody;
  double rho, t, drho;

  m_pParTab[0] = 0;
  m_pEsclTab[0].sclx = e1start/e1fac;
  m_pEsclTab[0].scly = e2start/e2fac;
  m_pEsclTab[0].difx = 0.0;
  m_pEsclTab[0].dify = 0.0;

  for (i=1; i<=nbody; i++) {
    t = double(i)/double(nbody)*m_basw;
    m_pParTab[i] = t;
    m_pEsclTab[i].sclx = e1start/e1fac;
    m_pEsclTab[i].scly = e2start/e2fac;
    m_pEsclTab[i].difx = 0.0;
    m_pEsclTab[i].dify = 0.0;
  }
  
  // MB_DPRINTLN("JCTTable> E2 start: %f, end: %f", e2start, e2end);

  e2start *= m_arrow;

  double e1rng = e1end-e1start;
  double e2rng = e2end-e2start;
  double rho1, drho1;

  // MB_DPRINTLN("JCTTable> E1 range: %f", e1rng);
  // MB_DPRINTLN("JCTTable> E2 range: %f", e2rng);

  for (i=0; i<nhead; i++) {
    t = double(i)/double(nhead-1);

    //////////
    // Y-direction
    //  arrow head width
    rho = ::pow(1.0-t, m_gamma);
    //drho = m_gamma*::pow(1.0-t, m_gamma-1);
    if ((1.0-t)>F_EPS4)
      drho = m_gamma*rho/(1.0-t);
    else
      drho = m_gamma*::pow(F_EPS4, m_gamma-1);
    rho = 1.0-rho;

    //////////
    // X-direction
    //  the same as smooth mode (for continuous thickness)
    if (t<=0.5) {
      if (t<F_EPS4)
        drho1 = 2.0*F_EPS4;
      else
        drho1 = 2.0*t;
      rho1 = ::pow(drho1, m_gamma)/2.0;
    }
    else {
      if ((1.0-t)<F_EPS4)
        drho1 = 2.0*F_EPS4;
      else
        drho1 = 2.0*(1.0-t);
      rho1 = 1.0 - ::pow(drho1, m_gamma)/2.0;
    }
    drho1 = m_gamma*::pow(drho1, m_gamma-1);
    
    int ind = i+nbody+1;
    m_pParTab[ind] = t*(1.0-m_basw) + m_basw;
    m_pEsclTab[ind].sclx = e1start + rho1*e1rng;
    m_pEsclTab[ind].sclx /= e1fac;
    m_pEsclTab[ind].scly = e2start + rho*e2rng;
    m_pEsclTab[ind].scly /= e2fac;

    m_pEsclTab[ind].difx = drho1*e1rng/e1fac;
    m_pEsclTab[ind].dify = drho*e2rng/e2fac;

    // MB_DPRINTLN("JCTTable> t=%f, rho=%f, drho1=%f, drho=%f", t, rho, drho1, drho);
  }

  // Reverse the coefficients in the tail mode,
  // which will result in an arrow shape in the reverse direction
  if (!frev) {
    std::reverse(m_pParTab, m_pParTab+m_nTabSz);
    std::reverse(m_pEsclTab, m_pEsclTab+m_nTabSz);
    for (i=0; i<m_nTabSz; i++)
      m_pParTab[i] = 1.0-m_pParTab[i];
  }

  // MB_DPRINTLN("JCTTable> Arrow table:");
  /*
  for (i=0; i<m_nTabSz; i++) {
    MB_DPRINTLN("JCTTable> %d t=%f (x,y) = (%f, %f), (dx,dy) = (%f, %f)",
                i, m_pParTab[i],
                m_pEsclTab[i].sclx, m_pEsclTab[i].scly,
                m_pEsclTab[i].difx, m_pEsclTab[i].dify);
  }
   */

  return true;
}

bool JctTable::setup(int ndetail, TubeSection *pts1, TubeSection *pts2, bool frev /*=false*/)
{
  // Partition polygon is required,
  // when the types of each connecting section are different,
  // to hide the holes on the surface.
  if (pts1->getType()!=pts2->getType())
    m_fPartition = true;
  else
    m_fPartition = false;

  switch (m_nType) {
  default:
  case JT_SMOOTH1:
    return setup_smo1(ndetail, pts1, pts2, frev);
    break;
  case JT_ARROW1:
    return setup_arrow1(ndetail, pts1, pts2, frev);
    break;
  case JT_FLAT:
    // Flat always needs partition
    m_fPartition = true;
    return setup_smo1(ndetail, pts1, pts2, frev);
    break;
  }

  // Not reached here.
  return false;
}

void JctTable::setType(int n)
{
  if (m_nType!=n) {
    invalidate();
    m_nType = n;
  }
}

