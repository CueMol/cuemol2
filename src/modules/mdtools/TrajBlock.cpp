// -*-Mode: C++;-*-
//
// MD trajectory block data class
//

#include <common.h>
#include "TrajBlock.hpp"

using namespace mdtools;

TrajBlock::TrajBlock()
     : m_nIndex(0), m_nCrds(0), m_nSize(0)
{
}

TrajBlock::~TrajBlock()
{
}

void TrajBlock::allocate(int natom, int nsize)
{
  m_nCrds = natom * 3;
  m_nSize = nsize;

  m_data.resize(m_nCrds * m_nSize);
}

