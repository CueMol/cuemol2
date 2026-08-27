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

namespace {
  inline int wrapIndex(int x, int n)
  {
    const int r = x % n;
    return (r < 0) ? r + n : r;
  }
}

void ScalarObject::extractBlock(const MapBlockSpec &spec, bool pbc, float fill,
                                float *out) const
{
  const int nc = getColNo(), nr = getRowNo(), ns = getSecNo();
  const int s = (spec.step < 1) ? 1 : spec.step;
  size_t o = 0;
  for (int ko = 0; ko < spec.size[2]; ++ko) {
    const int k = spec.start[2] + ko * s;
    for (int jo = 0; jo < spec.size[1]; ++jo) {
      const int j = spec.start[1] + jo * s;
      for (int io = 0; io < spec.size[0]; ++io, ++o) {
        const int i = spec.start[0] + io * s;
        if (pbc) {
          out[o] = (nc > 0 && nr > 0 && ns > 0)
            ? float(atFloat(wrapIndex(i, nc), wrapIndex(j, nr), wrapIndex(k, ns)))
            : fill;
        }
        else {
          out[o] = isInBoundary(i, j, k) ? float(atFloat(i, j, k)) : fill;
        }
      }
    }
  }
}

void ScalarObject::extractBlockBytes(const MapBlockSpec &spec, bool pbc,
                                     unsigned char fill, unsigned char *out) const
{
  const int nc = getColNo(), nr = getRowNo(), ns = getSecNo();
  const int s = (spec.step < 1) ? 1 : spec.step;
  size_t o = 0;
  for (int ko = 0; ko < spec.size[2]; ++ko) {
    const int k = spec.start[2] + ko * s;
    for (int jo = 0; jo < spec.size[1]; ++jo) {
      const int j = spec.start[1] + jo * s;
      for (int io = 0; io < spec.size[0]; ++io, ++o) {
        const int i = spec.start[0] + io * s;
        if (pbc) {
          out[o] = (nc > 0 && nr > 0 && ns > 0)
            ? atByte(wrapIndex(i, nc), wrapIndex(j, nr), wrapIndex(k, ns))
            : fill;
        }
        else {
          out[o] = isInBoundary(i, j, k) ? atByte(i, j, k) : fill;
        }
      }
    }
  }
}

void ScalarObject::calcBaseHistogram()
{
  m_dHisMin = getMinDensity();
  m_dHisMax = getMaxDensity();

  // Implementations with quantized storage provide the base histogram
  // directly (lossless and cheap); otherwise scan the samples.
  m_bashist.clear();
  if (getBaseHistogram(m_bashist, m_dBaseMin, m_dBinSz) && !m_bashist.empty()) {
    MB_DPRINTLN("ScalarObj.hist> basehist (impl) nbins=%d", (int) m_bashist.size());
    return;
  }
  m_bashist.clear();

  // Generic path: bins of rmsd/1000, capped so a wide-range map does not
  // allocate an unbounded table (the rebinning in getHistogramJSON copes
  // with any base bin width).
  double dbinw = getRmsdDensity()/1000.0;
  long long lnbins = (dbinw > 0.0) ? (long long) ((m_dHisMax-m_dHisMin)/dbinw) : 0;
  if (lnbins < 1) lnbins = 1;
  if (lnbins > 65536) lnbins = 65536;
  const int nbins = (int) lnbins;

  MB_DPRINTLN("ScalarObj.hist> basehist nbins=%d", nbins);

  m_dBaseMin = m_dHisMin;
  m_dBinSz = (m_dHisMax-m_dHisMin)/double(nbins);
  m_bashist.assign(nbins, 0);

  const int ni = getColNo();
  const int nj = getRowNo();
  const int nk = getSecNo();

  for (int k=0; k<nk; ++k)
    for (int j=0; j<nj; ++j)
      for (int i=0; i<ni; ++i) {
        const double a = (atFloat(i,j,k)-m_dBaseMin)/m_dBinSz;
        if (a < 0.0 || a >= double(nbins))
          continue;
        m_bashist[(int) ::floor(a)]++;
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
  const int nbase = (int) m_bashist.size();
  for (j=0; j<nbase; ++j) {
    xlo = m_dBaseMin + double(j)*m_dBinSz;
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
    
    const double cnt = double(m_bashist[j]);
    if (cnt == 0.0)
      continue;

    if (ilo==ihi) {
      // both lo&hi are in one range (ilo) of the new histogram
      // --> simply add to hist[ilo]
      histo[ilo] += cnt;
    }
    else {
      rho = ( ((ilo+1)*dbinw + min) - xlo ) / m_dBinSz;
      if (0<=ilo && ilo<nbins) {
        histo[ilo] += cnt * rho;
      }

      for (i=ilo+1; i<ihi; ++i) {
        rho = dbinw / m_dBinSz;
        if (0<=i && i<nbins) {
          histo[i] += cnt * rho;
        }
      }

      rho = ( xhi - (ihi*dbinw + min) ) / m_dBinSz;
      if (0<=ihi && ihi<nbins) {
        histo[ihi] += cnt * rho;
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

