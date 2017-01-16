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
  clear();
}

void TrajBlock::allocate(int natom, int nsize)
{
  m_nCrds = natom * 3;
  m_nSize = nsize;

  //m_data.allocate(m_nCrds * m_nSize);
  m_data.allocate(m_nSize);
  m_flags.resize(m_nSize);
  for (int i=0; i<m_nSize; ++i) {
    m_data[i] = MB_NEW PosArray();
    m_data[i]->allocate(m_nCrds);
    m_flags[i] = false;
  }

}

void TrajBlock::clear()
{
  for (int i=0; i<m_nSize; ++i) {
    delete m_data[i];
  }
  //m_data.clear();
  m_data.destroy();
  m_flags.clear();
}

