// -*-Mode: C++;-*-
//
// B-sharpening tool
//

#include <common.h>
#include "BSharpTool.hpp"

#ifdef _OPENMP
#  include <omp.h>
#endif

using namespace xtal;

BSharpTool::BSharpTool()
{
  m_pFloatMap = NULL;
  m_pHKLList = NULL;
  m_pRecipTmpAry = NULL;
  m_pRecipAry = NULL;
  m_dmin = -1.0;
  m_dCurBfacVal = 0.0;
  m_bForceRecipAry = false;
  //m_bForceRecipAry = true;

  m_nOmpThr = -1;
}

BSharpTool::~BSharpTool()
{
  if (m_pFloatMap!=NULL)
    delete m_pFloatMap;

  if (m_pRecipTmpAry!=NULL)
    delete m_pRecipTmpAry;

  if (m_pRecipAry!=NULL)
    delete m_pRecipAry;

}

void BSharpTool::clear()
{
  if (m_pFloatMap!=NULL)
    delete m_pFloatMap;
  m_pFloatMap = NULL;

  if (m_pRecipTmpAry!=NULL)
    delete m_pRecipTmpAry;
  m_pRecipTmpAry = NULL;

  if (m_pRecipAry!=NULL)
    delete m_pRecipAry;
  m_pRecipAry = NULL;
}

void BSharpTool::attach(const qsys::ObjectPtr &pMap)
{
  if (!m_pMap.isnull()) {
    if (m_pMap->getUID()==pMap->getUID())
      return; // already attached

    // cleanup previous map's workarea data
    clear();
  }
  m_pHKLList = NULL;

  MB_ASSERT(m_pRecipTmpAry==NULL);
  MB_ASSERT(m_pRecipAry==NULL);

  m_pMap = pMap;
  m_na = m_pMap->getColNo();
  m_nb = m_pMap->getRowNo();
  m_nc = m_pMap->getSecNo();
  int naa = m_na/2+1;
  const CrystalInfo &ci = m_pMap->getXtalInfo();

  HKLList *pHKLList = m_pMap->getHKLList();

  if (m_bForceRecipAry || pHKLList==NULL) {
    DensityMap::FloatMap *pFMap = m_pMap->getFloatMap();
    if (pFMap==NULL) {
      MB_THROW(qlib::RuntimeException, "No float map available");
      return;
    }
    
    // Create original reciprocal array
    m_pRecipAry = MB_NEW CompArray(naa, m_nb, m_nc);
    FFTUtil fft;
    fft.doit(*pFMap, *m_pRecipAry);
    const float fscl = 1.0f/float(m_na*m_nb*m_nc);
    int h, k, l;
    for (l=0; l<m_nc; ++l)
      for (k=0; k<m_nb; ++k)
        for (h=0; h<naa; ++h)
          m_pRecipAry->at(h,k,l) *= fscl;

    // Estimate d_min from Nyquist freq
    double res_a = 1.0/sqrt( ci.invressq(naa, 0, 0) );
    double res_b = 1.0/sqrt( ci.invressq(0, m_nb/2+1, 0) );
    double res_c = 1.0/sqrt( ci.invressq(0, 0, m_nc/2+1) );
    m_dmin = qlib::min( qlib::min(res_a, res_b), res_c);
    MB_DPRINTLN("BSharpTool> d_min (a*) = %.2f", res_a);
    MB_DPRINTLN("BSharpTool> d_min (b*) = %.2f", res_b);
    MB_DPRINTLN("BSharpTool> d_min (c*) = %.2f", res_c);
    //LOG_DPRINTLN("BSharpTool> Estimated d_min = %.2f", m_dmin);
  }
  else {
    m_pHKLList = pHKLList;

    // Find d_min
    int nsize = m_pHKLList->size();
    double irs_max = 0.0;
    for (int i=0; i<nsize; ++i) {
      const StrFac &elem = m_pHKLList->at(i);
      irs_max = qlib::max<double>(irs_max, ci.invressq(elem.ih, elem.ik, elem.il));
    }
    if (qlib::isNear4(irs_max, 0.0))
      m_dmin = -1.0;
    else
      m_dmin = 1.0/sqrt(irs_max);

  }
  LOG_DPRINTLN("BSharpTool> Estimated d_min = %.2f", m_dmin);
  
  m_pRecipTmpAry = MB_NEW CompArray(naa, m_nb, m_nc);
  m_pFloatMap = MB_NEW FloatArray(m_na,m_nb,m_nc);

/*
  if (pHKLList==NULL) {
    DensityMap::FloatMap *pFMap = m_pMap->getFloatMap();
    int h, k, l;
    //const CrystalInfo &ci = m_pMap->getXtalInfo();
    //const float fscl = float(1.0/(ci.volume()));
    const float fscl = 1.0f/float(m_na*m_nb*m_nc);
    for (l=0; l<m_nc; ++l)
      for (k=0; k<m_nb; ++k)
        for (h=0; h<naa; ++h)
          m_pRecipTmpAry->at(h,k,l) = m_pRecipAry->at(h,k,l)*fscl;
    
    FFTUtil fft;
    fft.doit(*m_pRecipTmpAry, *m_pFloatMap);
    for (l=0; l<m_nc; ++l)
      for (k=0; k<m_nb; ++k)
        for (h=0; h<m_na; ++h) {
          auto val1 = pFMap->at(h,k,l);
          auto val2 = m_pFloatMap->at(h,k,l);
          if (!qlib::isNear4(val1, val2)) {
            MB_DPRINTLN("XXX (%d, %d, %d) %f!=%f ratio=%f", h, k, l, val1, val2, val2/val1);
          }
        }

  }
 */
}

void BSharpTool::detach()
{
  clear();
  m_pMap = DensityMapPtr();
  m_pHKLList = NULL;
}

void BSharpTool::preview(double b_factor)
{
  if (qlib::isNear4(m_dCurBfacVal,b_factor))
    return;

  if (m_pHKLList!=NULL) {
    m_pHKLList->convToArrayHerm(*m_pRecipTmpAry, b_factor, m_dmin);
  }
  else {
    applyBfacTmpAry(b_factor);
  }

  MB_ASSERT(m_pFloatMap!=NULL);

  FFTUtil fft;
  fft.doit(*m_pRecipTmpAry, *m_pFloatMap);

  double min,max,mean,rmsd;
  DensityMap::calcMapStats(*m_pFloatMap,min,max,mean,rmsd);

  MB_DPRINTLN("BSharpTool> Preview Map statistics:");
  MB_DPRINTLN("   minimum: %f", min);
  MB_DPRINTLN("   maximum: %f", max);
  MB_DPRINTLN("   mean   : %f", mean);
  MB_DPRINTLN("   r.m.s.d: %f", rmsd);

  // m_pMap->setMapStats(min,max,mean,rmsd);

  double step = (max-min)/256.0;
  double base = min;

  // Rewrite the DensityMap obj's byte map
  ByteArray *pByteMap = m_pMap->getByteMap();
  DensityMap::createByteMap(*m_pFloatMap, *pByteMap, base, step);
  
  m_pMap->setMapStats(min,max,mean,rmsd);

  // Notify update
  m_pMap->updateByteMap();

  m_dCurBfacVal = b_factor;
}

void BSharpTool::resetPreview()
{
  // reset map stats
  m_pMap->calcMapStats();

  // reset bytemap
  m_pMap->createByteMap();

  // Notify update
  m_pMap->updateByteMap();

  m_dCurBfacVal = 0.0;
}

void BSharpTool::apply(double b_factor)
{
  if (m_pHKLList==NULL) {
  }
  else {
    // create new HKLList applied b factor
    HKLList *pNew = MB_NEW HKLList(*m_pHKLList);
    
    for (StrFac &elem: *pNew) {
      float irs = float( pNew->m_ci.invressq(elem.ih, elem.ik, elem.il) );
      float fscl2 = float( exp(-b_factor * irs * 0.25) );
      elem.f_re *= fscl2;
      elem.f_im *= fscl2;
    }
    
    m_pMap->setHKLList(pNew);
  }
  
  m_pMap->fireMapChgEvent();
  detach();
}

void BSharpTool::applyBfacTmpAry(double b_factor)
{
  int h, k, l;
  int ih, ik, il;
  int nc = m_nc;
  int nb = m_nb;
  int naa = m_na/2+1;

  const float irs_max = 1.0f/(m_dmin*m_dmin);
  const CrystalInfo &ci = m_pMap->getXtalInfo();
  const float fscl = float(1.0/(ci.volume()));
  float fscl2;

  for (l=0; l<nc; ++l)
    for (k=0; k<nb; ++k)
      for (h=0; h<naa; ++h) {
        ih = h;
        if (qlib::abs(h-m_na)<h)
          ih = h - m_na;

        ik = k;
        if (qlib::abs(k-m_nb)<k)
          ik = k - m_nb;

        il = l;
        if (qlib::abs(l-m_nc)<l)
          il = l - m_nc;

        auto val = m_pRecipAry->at(h,k,l);
        float irs = float( ci.invressq(ih, ik, il) );

        if (m_dmin>0.0f && irs>irs_max)
          fscl2 = 1.0f;
        else
          fscl2 = float( exp(-b_factor * irs * 0.25) );

        // m_pRecipTmpAry->at(h,k,l) = val * fscl2 * fscl;
        m_pRecipTmpAry->at(h,k,l) = val * fscl2;
      }
}

