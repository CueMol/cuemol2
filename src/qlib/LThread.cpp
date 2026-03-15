// -*-Mode: C++;-*-
//
//  Thread object
//

#include <common.h>
#include "LThread.hpp"

#include <thread>
#include <atomic>
#include <condition_variable>
#include <mutex>
#include <chrono>

namespace qlib {
  class LTThreadImpl
  {
  public:
    std::thread *m_pthr = nullptr;
    std::atomic<bool> m_finished{false};
    std::condition_variable m_cv;
    std::mutex m_cv_mtx;
  };
}

using namespace qlib;

LThread::LThread()
{
  m_pimp = new LTThreadImpl();
}

LThread::~LThread()
{
  if (m_pimp->m_pthr) {
    if (m_pimp->m_pthr->joinable())
      m_pimp->m_pthr->detach();
    delete m_pimp->m_pthr;
  }
  delete m_pimp;
}

void LThread::kick()
{
  MB_ASSERT(m_pimp->m_pthr==NULL);
  m_pimp->m_finished = false;
  m_pimp->m_pthr = MB_NEW std::thread([this]() {
    this->run();
    {
      std::lock_guard<std::mutex> lk(m_pimp->m_cv_mtx);
      m_pimp->m_finished = true;
    }
    m_pimp->m_cv.notify_all();
  });
}

void LThread::waitTermination()
{
  MB_DPRINTLN("wait termination ...");
  if (m_pimp->m_pthr!=NULL) {
    m_pimp->m_pthr->join();
    delete m_pimp->m_pthr;
    m_pimp->m_pthr = NULL;
  }
  MB_DPRINTLN("wait termination OK.");
}

bool LThread::waitTermination(int nsec)
{
  MB_DPRINTLN("wait (%d sec) termination ...", nsec);
  if (m_pimp->m_pthr != NULL) {
    std::unique_lock<std::mutex> lk(m_pimp->m_cv_mtx);
    bool finished = m_pimp->m_cv.wait_for(
        lk, std::chrono::seconds(nsec),
        [this]{ return m_pimp->m_finished.load(); });
    lk.unlock();
    if (finished) {
      m_pimp->m_pthr->join();
      delete m_pimp->m_pthr;
      m_pimp->m_pthr = NULL;
      MB_DPRINTLN("wait termination OK.");
      return true;
    }
    return false;  // timeout
  }
  MB_DPRINTLN("wait termination OK.");
  return true;
}

bool LThread::isRunning() const {
  if (m_pimp->m_pthr != NULL)
    return !m_pimp->m_finished.load();
  return false;
}
