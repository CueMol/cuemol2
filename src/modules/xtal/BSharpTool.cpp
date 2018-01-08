// -*-Mode: C++;-*-
//
// B-sharpening tool
//

#include <common.h>
#include "BSharpTool.hpp"

using namespace xtal;

BSharpTool::~BSharpTool()
{
  if (m_pFloatMap!=NULL)
    delete m_pFloatMap;
  if (m_pRecipAry!=NULL)
    delete m_pRecipAry;
}

void BSharpTool::clear()
{
  if (m_pFloatMap!=NULL)
    delete m_pFloatMap;
  m_pFloatMap = NULL;
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

  m_pMap = pMap;
  HKLList *pHKLList = m_pMap->getHKLList();
  if (pHKLList==NULL) {
    m_pMap->calcHKLfromMap();
    pHKLList = m_pMap->getHKLList();
    if (pHKLList==NULL) {
      MB_THROW(qlib::RuntimeException, "Cannot create HKLList for map");
    }
  }
  m_pHKLList = pHKLList;
  
  m_na = m_pMap->getColNo();
  m_nb = m_pMap->getRowNo();
  m_nc = m_pMap->getSecNo();

  m_pRecipAry = MB_NEW CompArray();
  m_pFloatMap = MB_NEW FloatArray(m_na,m_nb,m_nc);
}

void BSharpTool::detach()
{
  if (!m_pMap.isnull()) {
    clear();
    m_pMap = DensityMapPtr();
  }
}

void BSharpTool::preview(double b_factor, double d_min)
{
  MB_ASSERT(m_pRecipAry!=NULL);
  m_pHKLList->convToArrayHerm(*m_pRecipAry, b_factor);

  MB_ASSERT(m_pFloatMap!=NULL);

  FFTUtil fft;
  fft.doit(*m_pRecipAry, *m_pFloatMap);

  double min,max,mean,rmsd;
  DensityMap::calcMapStats(*m_pFloatMap,min,max,mean,rmsd);

  MB_DPRINTLN("Preview Map statistics:");
  MB_DPRINTLN("   minimum: %f", min);
  MB_DPRINTLN("   maximum: %f", max);
  MB_DPRINTLN("   mean   : %f", mean);
  MB_DPRINTLN("   r.m.s.d: %f", rmsd);

  m_pMap->setMapStats(min,max,mean,rmsd);
  double step = (max-min)/256.0;
  double base = min;

  ByteArray *pByteMap = m_pMap->getByteMap();
  
  DensityMap::createByteMap(*m_pFloatMap, *pByteMap, base, step);
  
  m_pMap->setMapStats(min,max,mean,rmsd);

  m_pMap->updateByteMap();
}

void BSharpTool::apply(double b_factor)
{
  // create new HKLList applied b factor
  HKLList *pNew = MB_NEW HKLList(*m_pHKLList);

  for (StrFac &elem: *pNew) {
    float irs = float( pNew->m_ci.invressq(elem.ih, elem.ik, elem.il) );
    float fscl2 = float( exp(-b_factor * irs * 0.25) );
    elem.f_re *= fscl2;
    elem.f_im *= fscl2;
  }

  m_pMap->setHKLList(pNew);
  m_pMap->fireMapChgEvent();

  m_pHKLList = NULL;
  detach();

}

