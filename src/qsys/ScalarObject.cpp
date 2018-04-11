// -*-Mode: C++;-*-
//
// Object: base class of data object
//
// $Id: ScalarObject.cpp,v 1.1 2010/09/11 17:54:46 rishitani Exp $
//

#include <common.h>

#include "ScalarObject.hpp"

using namespace qsys;

ScalarObject::ScalarObject()
{
}

ScalarObject::~ScalarObject()
{
}

void ScalarObject::calcBaseHistogram()
{
  m_dHisMin = getMinDensity();
  m_dHisMax = getMaxDensity();

  // ???
  double dbinw = getRmsdDensity()/1000.0;
  
  int nbins = int( (m_dHisMax-m_dHisMin)/dbinw );

  MB_DPRINTLN("ScalarObj.hist> basehist nbins=%d", nbins);

  m_bashist.resize(nbins);
  m_dBinSz = (m_dHisMax-m_dHisMin)/double(nbins);

  for (int i=0; i<nbins; ++i)
    m_bashist[i] = 0;
  
  int ni = getColNo();
  int nj = getRowNo();
  int nk = getSecNo();

  for (int i=0; i<ni; ++i)
    for (int j=0; j<nj; ++j)
      for (int k=0; k<nk; ++k) {
        int ind = (int) ::floor( (atFloat(i,j,k)-m_dHisMin)/m_dBinSz );
        if (ind<0 || ind>=nbins) {
          //MB_DPRINTLN("ERROR!! invalid density value at (%d,%d,%d)=%f", i,j,k,rho);
        }
        else {
          m_bashist[ind]++;
        }
      }
}

namespace {
  inline void getInd(double par, double dHisMin, double dBinSz, int &na, double &del)
  {
    double a = par - dHisMin;
    double dna = floor(a/dBinSz);
    na = int(dna);
    del = a - dna*dBinSz;
  }
}

LString ScalarObject::getHistogramJSON(double min, double max, int nbins)
{
  if (m_bashist.size()==0)
    calcBaseHistogram();
  
  double dbinw = (max-min)/double(nbins);
  MB_DPRINTLN("ScalarObj.hist> nbins=%d", nbins);

  int i,j;
  std::vector<double> histo(nbins);
  for (i=0; i<nbins; ++i)
    histo[i] = 0;
  
  double xlo, xhi, delo, dehi, rho;
  int ilo, ihi;
  for (j=0; j<m_bashist.size(); ++j) {
    xlo = m_dHisMin + double(j)*m_dBinSz;
    xhi = xlo + m_dBinSz;
    // get index/delta for the new bin size
    getInd(xlo, min, dbinw, ilo, delo);
    getInd(xhi, min, dbinw, ihi, dehi);

    if ( (ilo<0 || ilo>=nbins) &&
         (ihi<0 || ihi>=nbins) ) {
      // both lo&hi boundaries are out of the range of the new histogram
      // --> skip data point (in the base histogram)
      continue;
    }
    
    if (ilo==ihi) {
      // both lo&hi are in one range (ilo) of the new histogram
      // --> simply add to hist[ilo]
      histo[ilo] += m_bashist[j];
    }
    else {
      double rhosum = 0.0;

      rho = ( ((ilo+1)*dbinw + min) - xlo ) / m_dBinSz;
      rhosum += rho;
      MB_DPRINTLN("ilo=%d rho=%f", ilo, rho);
      if (0<=ilo && ilo<nbins) {
        histo[ilo] += m_bashist[j] * rho;
      }
      
      for (i=ilo+1; i<ihi; ++i) {
        rho = dbinw / m_dBinSz;
        rhosum += rho;
        MB_DPRINTLN("i=%d rho=%f", i, rho);
        if (0<=i && i<nbins) {
          histo[i] += m_bashist[j] * rho;
        }
      }

      rho = ( xhi - (ihi*dbinw + min) ) / m_dBinSz;
      rhosum += rho;
      MB_DPRINTLN("ihi=%d rho=%f", ihi, rho);
      if (0<=ihi && ihi<nbins) {
        histo[ihi] += m_bashist[j] * rho;
      }
    }
  }

  double nmax = 0;
  for (int i=0; i<nbins; ++i)
    nmax = qlib::max(histo[i], nmax);

  LString rval = "{";
  rval += LString::format("\"min\":%f,\n", m_dHisMin);
  rval += LString::format("\"max\":%f,\n", m_dHisMax);
  rval += LString::format("\"nbin\":%d,\n", nbins);
  rval += LString::format("\"nmax\":%f,\n", nmax);
  rval += LString::format("\"sig\":%f,\n", getRmsdDensity());
  rval += "\"histo\":[";
  for (int i=0; i<nbins; ++i) {
    //MB_DPRINTLN("%d %f", i, histo[i]);
    if (i>0)
      rval += ",";
    rval += LString::format("%f", histo[i]);
  }
  rval += "]}\n";
  
  return rval;
}

