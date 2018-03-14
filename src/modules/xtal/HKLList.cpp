#include <common.h>
#include <qlib/LTypes.hpp>
#include <qlib/LString.hpp>
#include <qlib/Utils.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LineStream.hpp>
#include <qlib/PrintStream.hpp>
#include <qlib/FileStream.hpp>

#include "HKLList.hpp"

#define DEBUG 1

#undef _OPENMP

#ifdef _OPENMP
#  include <omp.h>
#endif

using namespace xtal;

void HKLList::calcMaxInd()
{
  m_nMaxH=0; m_nMaxK=0; m_nMaxL=0;
  
  for (const StrFac &elem: *this) {
    m_nMaxH = qlib::max(elem.ih, m_nMaxH);
    m_nMaxK = qlib::max(elem.ik, m_nMaxK);
    m_nMaxL = qlib::max(elem.il, m_nMaxL);
  }
  MB_DPRINTLN("max hkl = %d %d %d", m_nMaxH, m_nMaxK, m_nMaxL);
}

int HKLList::calcprime(int N, int base1, int base2, int prim)
{
  int NN, P;
  bool CLOOP;
    
  NN=0;
  N=N-1;
  while (NN!=1) {
    // increment N until base1 and base2 are factors of N
    CLOOP=true;
      
    while (CLOOP) {
      N++;
      if (MOD(N, base1)==0 && MOD(N, base2)==0)
	CLOOP=false;
    }
      
    // divide N/BASE2 by integers less equal prim
    NN = N/base2;
    P=qlib::min(NN,prim);
      
    while (P>1) {
      while (MOD(NN,P)==0) {
	NN = NN/P;
      }
      P=P-1;
    }
  }
    
  return N;
}

void HKLList::calcgrid()
{
  int na, nb, nc;
  int nap, nbp, ncp;
  int napp, nbpp, ncpp;
    
  //double mapr = 1.7;
    
  na = qlib::max(2, int(m_ci.a()/(m_mapr*m_grid)+F_EPS8));
  nb = qlib::max(2, int(m_ci.b()/(m_mapr*m_grid)+F_EPS8));
  nc = qlib::max(2, int(m_ci.c()/(m_mapr*m_grid)+F_EPS8));
    
  nap = calcprime(na, 1, 1, ftprim);
  nbp = calcprime(nb, 1, 1, ftprim);
  ncp = calcprime(nc, 1, 2, ftprim);
    
  napp = nbpp = ncpp = 1;
    
  MB_DPRINTLN("grid init guess (%d,%d,%d)", na, nb, nc);
  MB_DPRINTLN("grid init guessp(%d,%d,%d)", nap, nbp, ncp);
  MB_DPRINTLN("grid init guespp(%d,%d,%d)", napp, nbpp, ncpp);
  int basea = 2;
  int baseb = 2;
  int basec = 2;
    
  MB_DPRINTLN("fin guess p: (%d,%d,%d)", nap, nbp, ncp);
  MB_DPRINTLN("fin guess pp: (%d,%d,%d)", napp, nbpp, ncpp);
    
  na = nap*napp;
  nb = nbp*nbpp;
  nc = ncp*ncpp;
    
  LOG_DPRINTLN("MTZ> Resoln=%f A, grid=%f", m_mapr, m_grid);
  LOG_DPRINTLN("MTZ> FFT grid size : (%d,%d,%d)", na, nb, nc);
  m_na = na;
  m_nb = nb;
  m_nc = nc;
    
  if (m_nMaxH>(na-1.0)/2.0) {
    MB_THROW(qlib::RuntimeException, "Grid in x-direction too coarse");
    return;
  }
  if (m_nMaxK>(nb-1.0)/2.0) {
    MB_THROW(qlib::RuntimeException, "Grid in y-direction too coarse");
    return;
  }
  if (m_nMaxL>(nc-1.0)/2.0) {
    MB_THROW(qlib::RuntimeException, "Grid in z-direction too coarse");
    return;
  }
    
  return;
}

void HKLList::checkMapResoln()
{
  const double factor = 3.0;
    
  const double maxg_x = m_ci.a()/(factor*double(m_nMaxH));
  const double maxg_y = m_ci.b()/(factor*double(m_nMaxK));
  const double maxg_z = m_ci.c()/(factor*double(m_nMaxL));
  const double maxg = qlib::min(maxg_x, qlib::min(maxg_y, maxg_z));
    
  MB_DPRINTLN("Possible FFT grid size %f,%f,%f", maxg_x, maxg_y, maxg_z);
    
  //m_mapr = maxg/m_grid;

  bool bauto = false;
  if (m_mapr>0.1) {
    if (m_mapr*m_grid>=maxg) {
      MB_DPRINTLN("MTZ> FFT grid (resoln=%f, grid=%f) is too coarse", m_mapr, m_grid);
      bauto = true;
    }
  }
  else {
    bauto = true;
  }

  if (bauto) {
    // determine from max HKL
    m_grid = 0.33;
    m_mapr = maxg/m_grid;
    MB_DPRINTLN("MTZ> Auto resoln: resoln=%f, grid=%f", m_mapr, m_grid);
  }
}


void HKLList::convToArray(CompArray &recip, float b_factor) const
{
  const float fscl = float(1.0/(m_ci.volume()));
    
  if (recip.cols()!=m_na ||
      recip.rows()!=m_nb ||
      recip.secs()!=m_nc)
    recip.resize(m_na, m_nb, m_nc);

  int h, k, l;
  for (l=0; l<m_nc; ++l)
    for (k=0; k<m_nb; ++k)
      for (h=0; h<m_na; ++h)
	recip.at(h,k,l) = std::complex<float>();

  const int nsize = super_t::size();

#ifdef DEBUG
  MB_DPRINTLN("convtoarray before: %d", nsize);
  for (l=0; l<2; ++l)
    for (k=0; k<2; ++k)
      for (h=0; h<2; ++h)
	MB_DPRINTLN("(%d %d %d) f=%f, %f", h, k, l,
		    recip.at(h,k,l).real(), recip.at(h,k,l).imag());
#endif

  int nthr = -1;
#ifdef _OPENMP
  omp_set_num_threads(omp_get_num_procs());
  nthr = omp_get_max_threads();
  // LOG_DPRINTLN("MapSurf2> using OpenMP %d threads", nthr);
#endif

  int i;

#ifdef _OPENMP
#pragma omp parallel for schedule(dynamic)
  for (i=0; i<nsize; ++i) {
#else
  for (i=0; i<nsize; ++i) {
#endif
    const StrFac &elem = super_t::at(i);

    int ih = elem.ih;
    int ik = elem.ik;
    int il = elem.il;
      
#ifdef DEBUG
    if (i<5) {
      MB_DPRINTLN("(%d %d %d) f=%f, %f", ih, ik, il, elem.f_re, elem.f_im);
    }
#endif
    float irs = float( m_ci.invressq(ih, ik, il) );
    float fscl2 = float( exp(-b_factor * irs * 0.25) );
      
    ih = (ih+10000*m_na)%m_na;
    ik = (ik+10000*m_nb)%m_nb;
    il = (il+10000*m_nc)%m_nc;

    // Make Friedel pair index
    int mh = (m_na-ih)%m_na;
    int mk = (m_nb-ik)%m_nb;
    int ml = (m_nc-il)%m_nc;

    //std::complex<float> floc = std::polar(elem.f * fscl*fscl2, qlib::toRadian(elem.phi));
    std::complex<float> floc(elem.f_re, elem.f_im);

    recip.at(ih,ik,il) = floc;
    // Expand Friedel pair
    recip.at(mh,mk,ml) = std::conj(floc);

  }

#ifdef DEBUG
  MB_DPRINTLN("convtoarray bfac=%f", b_factor);
  for (l=0; l<2; ++l)
    for (k=0; k<2; ++k)
      for (h=0; h<2; ++h)
	MB_DPRINTLN("(%d %d %d) f=%f, %f", h, k, l,
		    recip.at(h,k,l).real(), recip.at(h,k,l).imag());
#endif
}

void HKLList::convToArrayHerm(CompArray &recip, float b_factor, float d_min) const
{
  MB_DPRINTLN("HKLList.convToArrayHerm> apply b=%f to d_min: %f", b_factor, d_min);

  const float fscl = float(1.0/(m_ci.volume()));
  const float irs_max = 1.0f/(d_min*d_min);
  
  int naa = m_na/2+1;

  if (recip.cols()!=naa ||
      recip.rows()!=m_nb ||
      recip.secs()!=m_nc)
    recip.resize(naa, m_nb, m_nc);

  int h, k, l;
  for (l=0; l<m_nc; ++l)
    for (k=0; k<m_nb; ++k)
      for (h=0; h<naa; ++h)
	recip.at(h,k,l) = std::complex<float>();

  const int nsize = super_t::size();

#ifdef DEBUG
  MB_DPRINTLN("convtoarray before: %d", nsize);
  for (l=0; l<2; ++l)
    for (k=0; k<2; ++k)
      for (h=0; h<2; ++h)
	MB_DPRINTLN("(%d %d %d) f=%f, %f", h, k, l,
		    recip.at(h,k,l).real(), recip.at(h,k,l).imag());
#endif

  for (int i=0; i<nsize; ++i) {
    const StrFac &elem = super_t::at(i);

    int ih = elem.ih;
    int ik = elem.ik;
    int il = elem.il;
      
#ifdef DEBUG
    if (i<5) {
      MB_DPRINTLN("(%d %d %d) f=%f, %f", ih, ik, il, elem.f_re, elem.f_im);
    }
#endif
    float irs = float( m_ci.invressq(ih, ik, il) );
    float fscl2 = float( exp(-b_factor * irs * 0.25) );
    if (d_min>0.0f && irs>irs_max)
      fscl2 = 1.0f;
      
    ih = (ih+10000*m_na)%m_na;
    ik = (ik+10000*m_nb)%m_nb;
    il = (il+10000*m_nc)%m_nc;

    // Make Friedel pair index
    int mh = (m_na-ih)%m_na;
    int mk = (m_nb-ik)%m_nb;
    int ml = (m_nc-il)%m_nc;

    //std::complex<float> floc = std::polar(elem.f * fscl*fscl2, qlib::toRadian(elem.phi));
    std::complex<float> floc(elem.f_re * fscl*fscl2,
                             elem.f_im * fscl*fscl2);

    // Hermitian case: fill the hemisphere (of L>ncc)
    //  with the Friedel pairs of the refls.
    if (ih<naa) {
      recip.at(ih,ik,il) = std::conj(floc);
      if (mh<naa) {
	// Both +L and -L are in the range (0...NCC)
	// ==> Fill with both F(+)&F(-)
	recip.at(mh,mk,ml) = floc;
      }
    }
    else if (mh<naa) {
      // Fill with Friedel mate
      recip.at(mh,mk,ml) = floc;
    }
    else {
      LOG_DPRINTLN("fatal error %d,%d,%d, naa=%d\n",ih,ik,il,naa);
    }
  }

#ifdef DEBUG
  MB_DPRINTLN("convtoarray bfac=%f", b_factor);
  for (l=0; l<2; ++l)
    for (k=0; k<2; ++k)
      for (h=0; h<2; ++h)
	MB_DPRINTLN("(%d %d %d) f=%f, %f", h, k, l,
		    recip.at(h,k,l).real(), recip.at(h,k,l).imag());
#endif
}

