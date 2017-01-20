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

bool TrajBlock::isAllLoaded() const
{
  for (int i=0; i<m_nSize; ++i) {
    if (!m_flags[i])
      return false;
  }

  return true;
}

void TrajBlock::load(int ifrm)
{
  if (m_flags[ifrm])
    return;
  
  if (m_pReader.isnull()) {
    LString msg = LString::format("Cannot load TrajBlock %d (reader is null)", ifrm);
    LOG_DPRINTLN("TrajBlk> ERROR: %s", msg.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }
  
  m_pReader->loadFrm(ifrm, this);
  
  m_flags[ifrm] = true;

  if (isAllLoaded()) {
    // all frms loaded --> cleanup reader
    m_pReader = TrajBlockReaderPtr();
    LOG_DPRINTLN("TrajBlk> load %d-%d done", m_nIndex, m_nIndex+m_nSize-1);
  }
}

