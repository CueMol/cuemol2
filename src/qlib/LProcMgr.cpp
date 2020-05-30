// -*-Mode: C++;-*-
//
//  Process manager
//

#include <common.h>

#include "LProcMgr.hpp"
#include "LThread.hpp"
#include "LUnicode.hpp"
#include "Utils.hpp"

#include "FileStream.hpp"
#include "PrintStream.hpp"

#include <boost/thread.hpp>

namespace qlib {

  /// OS-dependent process mgr implementation
  class ProcInThread : public LThread
  {
  public:
    LString m_sbuf;
    int m_nExitCode;

    /// lock obj for m_sbuf access
    mutable boost::mutex m_lock;
  };
  
  SINGLETON_BASE_IMPL(LProcMgr);
}

#ifdef WIN32
#  include <windows.h>
#  include "WinProcImpl.hpp"
#else
#  include "PosixProcImpl.hpp"
#endif

using namespace qlib;

// automatic initialization by ClassRegistry
bool LProcMgr::initClass(qlib::LClass *pcls)
{
  return qlib::SingletonBase<LProcMgr>::init();
}

// automatic finalization by ClassRegistry (not used!!)
void LProcMgr::finiClass(qlib::LClass *pcls)
{
  qlib::SingletonBase<LProcMgr>::fini();
}

LProcMgr::LProcMgr()
     : m_nNextIndex(0)
{
#ifdef WIN32
  m_pImpl = MB_NEW WinProcMgrImpl();
#else
  m_pImpl = MB_NEW PosixProcMgrImpl();
#endif
  setSlotSize(-1);

  // register to idle task list
  EventManager *pEM = EventManager::getInstance();
  pEM->addIdleTask(this);

  m_bShowCmdLine = true;
}

LProcMgr::~LProcMgr()
{
  delete m_pImpl;
}

void LProcMgr::setSlotSize(int n)
{
  int nsize = n;
  if (nsize<=0) {
    nsize = m_pImpl->getCPUCount();
  }
  m_tab.resize(nsize);
}

int LProcMgr::queueTask(const LString &path,
			const LString &args,
			const LString &wait,
			const LString &wdir /*= LString()*/)
{
  int id = m_nNextIndex;
  m_nNextIndex ++;

  ProcEnt *pEnt = MB_NEW ProcEnt;
  pEnt->m_nProcID = id;
  pEnt->m_path = path;
  pEnt->m_cmdline = args;
  pEnt->m_wdir = wdir;

  // pEnt->m_pThr = NULL;
  
  int val;
  if (!wait.isEmpty()) {
      LStringList ls;
    wait.split(' ', ls);
    BOOST_FOREACH (const LString &elem, ls) {
      if (elem.toInt(&val))
        pEnt->m_waitIDs.push_back(val);
    }
  }

  m_queue.insert(queue_t::value_type(id, pEnt));

  // run the process, if possible
  checkQueue();

  return id;
}

int LProcMgr::findInSlot(int id)
{
  unsigned int i;
  for (i=0; i<m_tab.size(); ++i) {
    ProcEnt *pEnt = m_tab[i];
    if (pEnt!=NULL) {
      if (pEnt->m_nProcID==id) {
        return i;
      }
    }
  }
  return -1;
}

int LProcMgr::getState(int id)
{
  {
    // check the waiting queue list
    queue_t::iterator iter = m_queue.find(id);
    if (iter!=m_queue.end()) {
      // queued but not running
      return PM_QUEUED;
    }
  }
  
  // check the running proc slot
  ProcEnt *pEnt = findInSlot2(id);
  if (pEnt!=NULL) {
    if (pEnt->m_pThr->isRunning())
      return PM_RUNNING;
    return PM_ENDED;
  }
  
  // check in the ended proc list
  {
    endq_t::iterator iter = findInEndq(id);
    if (iter!=m_endq.end())
      return PM_ENDED;
  }

  // id is not found
  return PM_UNKNOWN;
}

void LProcMgr::finishTask(int isl)
{
  ProcEnt *pEnt = m_tab[isl];
  int iendid = pEnt->m_nProcID;
  m_endq.push_back(pEnt);
  m_tab[isl] = NULL;

  // clear the waiting list, if exists
  BOOST_FOREACH (const queue_t::value_type &elem, m_queue) {
    pEnt = elem.second;
    pEnt->removeWaitID(iendid);
  }
}

LString LProcMgr::peekResultOutput(int id)
{
  return LString();
}

LString LProcMgr::getResultOutput(int id)
{
  // check the running proc slot
  int isl = findInSlot(id);
  if (isl>=0) {
    ProcEnt *pEnt = m_tab[isl];
    if (pEnt->m_pThr->isRunning()) {
      LString res;
      {
	ProcInThread *pThr = pEnt->m_pThr;
	boost::mutex::scoped_lock lck(pThr->m_lock);
	res = pThr->m_sbuf;
	pThr->m_sbuf = LString();
      }
      writeLogFile(res);
      return res;
    }

    // remove from the slot and return the result
    m_tab[isl] = NULL;
    ProcInThread *pThr = pEnt->m_pThr;
    LString res = pThr->m_sbuf;
    delete pEnt;
    delete pThr;
    writeLogFile(res);
    return res;
  }

  // search id in the endq
  // id should exist in the endq
  endq_t::iterator iter = findInEndq(id);
  if (iter!=m_endq.end()) {
    // remove from the endq and return the result
    ProcEnt *pEnt = *iter;
    m_endq.erase(iter);
    ProcInThread *pThr = pEnt->m_pThr;
    LString res = pThr->m_sbuf;
    delete pEnt;
    delete pThr;
    writeLogFile(res);
    return res;
  }

  // should not reach here
  return LString();
}

/// wait for running process to exit
void LProcMgr::waitForRunningExit(int id)
{
  // id should be in the running slot
  // id is running --> wait termination
  int isl = findInSlot(id);
  MB_ASSERT(isl>=0);
  m_tab[isl]->m_pThr->waitTermination();
}

void LProcMgr::waitForExit(int id)
{
  int stat = getState(id);
  if (stat==PM_UNKNOWN ||
      stat==PM_ENDED)
    return;

  if (stat==PM_RUNNING) {
    waitForRunningExit(id);
    return;
  }

  // id is queued
  for (;;) {
    waitEmptySlot();
    checkQueue();
    stat = getState(id);
    if (stat==PM_QUEUED) {
      // still queued
      continue;
    }
    if (stat==PM_RUNNING) {
      waitForRunningExit(id);
      return;
    }
    // ENDED
    return;
  }
}

void LProcMgr::waitEmptySlot()
{
  unsigned int i;
  const int kWaitTime = 1;

  for (;;) {
    for (i=0; i<m_tab.size(); ++i) {
      ProcEnt *pEnt = m_tab[i];
      if (pEnt==NULL)
        return; // i is empty
      if (pEnt->m_pThr->waitTermination(kWaitTime)) {
        // i is ended
        finishTask(i);
        return;
      }
    }
  }
}

int LProcMgr::getEmptySlot()
{
  unsigned int i;

  for (i=0; i<m_tab.size(); ++i) {
    ProcEnt *pEnt = m_tab[i];
    if (pEnt!=NULL && !pEnt->m_pThr->isRunning()) {
      // pEnt is ended
      finishTask(i);
    }
  }

  // search the empty slot
  for (i=0; i<m_tab.size(); ++i) {
    ProcEnt *pEnt = m_tab[i];
    if (pEnt==NULL)
      return i;
  }

  return -1;
}

void LProcMgr::updateWaitIDs(ProcEnt *pEnt)
{
  std::list<int> newlist;
  BOOST_FOREACH (int id, pEnt->m_waitIDs) {
    int state = getState(id);
    if (state==PM_QUEUED||
        state==PM_RUNNING) {
      newlist.push_back(id);
    }
  }

  pEnt->m_waitIDs = newlist;
}

void LProcMgr::checkQueue()
{
  try {
    for (;;) {

      int isl = getEmptySlot();
      if (isl<0)
	return; // slot is full
    
      // run the task with highest priority
      queue_t::iterator iter = m_queue.begin();
      ProcEnt *pEnt = NULL;
      for (; iter!=m_queue.end(); ++iter) {
	ProcEnt *pe = iter->second;
	updateWaitIDs(pe);
	if (pe->m_waitIDs.empty()) {
	  pEnt = pe;
	  break;
	}
      }
      if (pEnt==NULL || iter==m_queue.end())
	return; // no available tasks
    
      // Print run command and args
      if (m_bShowCmdLine) {
        LOG_DPRINTLN("ProcMgr> Run: %s %s",pEnt->m_path.c_str(), pEnt->m_cmdline.c_str());
      }
      
      // create a real process
      // (This possibly fails if cmd not found...)
      ProcInThread *pThr = NULL;
      try {
        pThr = m_pImpl->createProcess(pEnt->m_path, pEnt->m_cmdline, pEnt->m_wdir);
      }
      catch (const qlib::LException &e) {
        LString msg = LString::format("Exception occurred in createProcess: %s", e.getMsg().c_str());
        LOG_DPRINTLN("ProcMgr> %s", msg.c_str());
        m_errormsg = msg;
      }
      catch (...) {
        LString msg = "Unknown exception occurred in createProcess";
        LOG_DPRINTLN("ProcMgr> %s", msg.c_str());
        m_errormsg = msg;
      }

      if (pThr==NULL) {
        m_queue.erase(iter);
        delete pEnt;
        return;
      }

      m_queue.erase(iter);
    
      // start the stdout watcher thread
      pThr->kick();
    
      // setup the process table
      pEnt->m_pThr = pThr;
      m_tab[isl] = pEnt;
    }
  }
  catch (const qlib::LException &e) {
    LString msg = LString::format("Exception occurred in checkQueue: %s", e.getMsg().c_str());
    LOG_DPRINTLN("ProcMgr> %s", msg.c_str());
    m_errormsg = msg;
  }
  catch (...) {
    LString msg = "Unknown exception occurred in checkQueue";
    LOG_DPRINTLN("ProcMgr> %s", msg.c_str());
    m_errormsg = msg;
  }
  
}

void LProcMgr::killSlot(int isl)
{
  ProcInThread *pData = m_tab[isl]->m_pThr;
  m_pImpl->kill(pData);
  pData->waitTermination();
  // transfer to the endq
  finishTask(isl);
}

void LProcMgr::kill(int id)
{
  queue_t::iterator qi = m_queue.find(id);
  if (qi!=m_queue.end()) {
    ProcEnt *pEnt = qi->second;
    delete pEnt;
    m_queue.erase(qi);
    return;
  }

  int isl = findInSlot(id);
  if (isl>=0) {
    killSlot(isl);
    return;
  }

  // unknown or in the endq
  return;
}

void LProcMgr::killAll()
{
  BOOST_FOREACH (const queue_t::value_type &elem, m_queue) {
    delete elem.second;
  }
  m_queue.clear();

  unsigned int i;
  for (i=0; i<m_tab.size(); ++i) {
    if (m_tab[i]!=NULL) {
      killSlot(i);
    }
  }

  //std::for_each(m_endq.begin(), m_endq.end(), delete_ptr<ProcEnt *>());
  //m_endq.clear();
  delete_and_clear<endq_t,ProcEnt>(m_endq);

  // clear error messgae
  m_errormsg = "";
}

bool LProcMgr::isEmpty() const
{
  if (!m_queue.empty())
    return false;
  
  unsigned int i;
  for (i=0; i<m_tab.size(); ++i) {
    ProcEnt *pEnt = m_tab[i];
    if (pEnt!=NULL) {
      return false;
    }
  }

  if (!m_endq.empty())
    return false;

  return true;
}

void LProcMgr::writeLogFile(const LString &res)
{
  if (m_logpath.isEmpty())
    return;

  try {
    FileOutStream fos;
    fos.open(m_logpath, true);
    PrintStream ps(fos);
    ps.print(res);
    ps.close();
    fos.close();
  }
  catch (...) {
    MB_DPRINTLN("ProcMgr> cannot write logfile: %s (ignored)", m_logpath.c_str());
  }
}

void LProcMgr::doIdleTask()
{
  checkQueue();
}

