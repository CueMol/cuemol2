// -*-Mode: C++;-*-
//
//  Thread object
//

#include <common.h>
#include "LThread.hpp"

#include <boost/thread.hpp>
#include <boost/bind.hpp>

namespace qlib {
  class LTThreadImpl
  {
  public:
    boost::thread *m_pthr;
  };
}

using namespace qlib;

LThread::LThread()
{
  m_pimp = new LTThreadImpl();
  m_pimp->m_pthr = NULL;
}

LThread::~LThread()
{
  if (m_pimp->m_pthr)
    delete m_pimp->m_pthr;
  delete m_pimp;
}

void LThread::kick()
{
  MB_ASSERT(m_pimp->m_pthr==NULL);
  m_pimp->m_pthr = MB_NEW boost::thread(boost::bind(&LThread::run, this));
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
  if (m_pimp->m_pthr!=NULL) {
    if (m_pimp->m_pthr->timed_join(boost::posix_time::seconds(nsec)))
      return false; // timeout
    // OK
    delete m_pimp->m_pthr;
    m_pimp->m_pthr = NULL;
  }
  MB_DPRINTLN("wait termination OK.");
  return true;
}

bool LThread::isRunning() const {
  if (m_pimp->m_pthr!=NULL) {
    if (m_pimp->m_pthr->timed_join(boost::posix_time::seconds(0)))
      return false;
    return true;
  }
  else
    return false;
}

