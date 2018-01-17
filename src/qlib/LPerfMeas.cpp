//
// Performance measurement manager implementation
//

#include <common.h>

#include "LPerfMeas.hpp"

#ifdef USE_BOOST_TIMER
#include <boost/timer/timer.hpp>
#endif  

#define NAVER_SIZE 10

namespace qlib {
  SINGLETON_BASE_IMPL(PerfMeasManager);
}

using namespace qlib;

PerfMeasManager::PerfMeasManager()
     : m_busytimes(NAVER_SIZE), m_nBusyTimeIndex(0), m_nActiveTimerID(-1)
{
#ifdef USE_BOOST_TIMER
  m_pTimer = MB_NEW boost::timer::cpu_timer();
#endif
}

PerfMeasManager::~PerfMeasManager()
{
#ifdef USE_BOOST_TIMER
  boost::timer::cpu_timer *pTimer = static_cast<boost::timer::cpu_timer *>(m_pTimer);
  delete pTimer;
#endif
}

void PerfMeasManager::enable(int nID)
{
  m_nActiveTimerID = nID;
}

void PerfMeasManager::disable()
{
  m_nActiveTimerID = -1;
}

void PerfMeasManager::setBusyTime(quint64 nanosec)
{
  m_busytimes[m_nBusyTimeIndex] = nanosec;
  m_nBusyTimeIndex ++;
  if (m_nBusyTimeIndex>=NAVER_SIZE) {
    m_nBusyTimeIndex = 0;
    double aver = 0.0;
    for (int i=0; i<NAVER_SIZE; ++i) {
      aver += double(m_busytimes[i]);
    }
    aver /= double(NAVER_SIZE);
    LOG_DPRINTLN("Average busy time for ID=%d: %f microsec (FPS=%f)", m_nActiveTimerID, aver/1000.0, 1000.0*1000.0*1000.0/aver);
  }
}

void PerfMeasManager::start(int nID)
{
  if (nID!=m_nActiveTimerID)
    return;
  
#ifdef USE_BOOST_TIMER
  boost::timer::cpu_timer *pTimer = static_cast<boost::timer::cpu_timer *>(m_pTimer);
  pTimer->start();
#endif
}

void PerfMeasManager::end(int nID)
{
  if (nID!=m_nActiveTimerID)
    return;

#ifdef USE_BOOST_TIMER
  boost::timer::cpu_timer *pTimer = static_cast<boost::timer::cpu_timer *>(m_pTimer);
  pTimer->stop();
  boost::timer::cpu_times t = pTimer->elapsed();
  setBusyTime(t.wall);
#endif
}

//////////

AutoTimeMeas::AutoTimeMeas(const char *msg)
{
  if (msg!=NULL)
    m_msg = msg;
#ifdef USE_BOOST_TIMER
  boost::timer::cpu_timer *p = new boost::timer::cpu_timer();
  p->start();
  m_pTimerObj = p;
#endif
}

AutoTimeMeas::~AutoTimeMeas()
{
#ifdef USE_BOOST_TIMER
  boost::timer::cpu_timer *p = static_cast<boost::timer::cpu_timer *>(m_pTimerObj);
  boost::timer::cpu_times t = p->elapsed();
  delete p;
  m_pTimerObj = NULL;
  
  LString msg = boost::timer::format(t);
  msg = msg.chomp();
  
  LOG_DPRINTLN( "%s> %s",
                m_msg.c_str(),
                msg.c_str() );
#endif
}

