// -*-Mode: C++;-*-
//
// MD trajectory block data class
//

#include <common.h>
#include "TrajBlock.hpp"
#include "Trajectory.hpp"

#include <qsys/SceneManager.hpp>

using namespace mdtools;

TrajectoryPtr TrajBlockReader::getTargTraj() const
{
  TrajectoryPtr pTraj;
  qlib::uid_t ttuid = getTargTrajUID();
  if (ttuid!=qlib::invalid_uid) {
    pTraj = qsys::SceneManager::getObjectS(ttuid);
  }
  else {
    TrajBlockPtr pTrajBlk( getTarget<TrajBlock>() );
    if (pTrajBlk.isnull()) {
      MB_THROW(qlib::NullPointerException, "TrajBlockReader not attached to TrajBlock");
      return pTraj;
    }
    qlib::uid_t nTrajUID = pTrajBlk->getTrajUID();
    pTraj = qsys::SceneManager::getObjectS(nTrajUID);
  }
  return pTraj;
}


///////////

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

  // allocate cell dim array
  m_cells.resize(CELL_SIZE*m_nSize);
}

void TrajBlock::clear()
{
  for (int i=0; i<m_nSize; ++i) {
    delete m_data[i];
  }
  //m_data.clear();
  m_data.destroy();
  m_flags.clear();
  m_cells.clear();
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
  
  if (m_pReader->getPath().isEmpty()) {
    // TO DO: check readability of source path of reader
    m_pReader->setPath(getSource());
  }

  m_pReader->loadFrm(ifrm, this);
  
  m_flags[ifrm] = true;

  if (isAllLoaded()) {
    // all frms loaded --> cleanup reader
    m_pReader = TrajBlockReaderPtr();
    LOG_DPRINTLN("TrajBlk> load %d-%d done", m_nIndex, m_nIndex+m_nSize-1);
  }
}

