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
  clear();
  m_pMap = pMap;

  m_pHKLList = m_pMap->getHKLList();

  m_na = m_pMap->getColNo();
  m_nb = m_pMap->getRowNo();
  m_nc = m_pMap->getSecNo();

  m_pRecipAry = MB_NEW CompArray();
  m_pFloatMap = MB_NEW FloatArray(m_na,m_nb,m_nc);
}

void BSharpTool::detach()
{
  clear();
  m_pMap = DensityMapPtr();
}

void BSharpTool::preview(double b_factor)
{
  MB_ASSERT(m_pRecipAry!=NULL);
  m_pHKLList->convToArrayHerm(*m_pRecipAry, b_factor);

  MB_ASSERT(m_pFloatMap!=NULL);

  FFTUtil fft;
  fft.doit(*m_pRecipAry, *m_pFloatMap);

  double min,max,mean,rmsd;
  DensityMap::calcMapStats(*m_pFloatMap,min,max,mean,rmsd);
  double step = (max-min)/256.0;
  double base = min;

  ByteArray *pByteMap = m_pMap->getByteMap();
  
  DensityMap::createByteMap(*m_pFloatMap, *pByteMap, base, step);
  m_pMap->updateByteMap();
}

void BSharpTool::apply(double b_factor)
{
}

