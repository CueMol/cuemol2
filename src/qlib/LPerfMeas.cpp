//
// Performance measurement manager implementation
//

#include <common.h>

#include "LPerfMeas.hpp"
#include <chrono>

static qlib::qint64 getNowNs()
{
  return std::chrono::duration_cast<std::chrono::nanoseconds>(
    std::chrono::high_resolution_clock::now().time_since_epoch()).count();
}

#define NAVER_SIZE 10

namespace qlib {
  SINGLETON_BASE_IMPL(PerfMeasManager);
}

using namespace qlib;

PerfMeasManager::PerfMeasManager()
     : m_busytimes(NAVER_SIZE), m_nBusyTimeIndex(0), m_nActiveTimerID(-1), m_startTimeNs(0)
{
}

PerfMeasManager::~PerfMeasManager()
{
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
  if (nID != m_nActiveTimerID) return;
  m_startTimeNs = getNowNs();
}

void PerfMeasManager::end(int nID)
{
  if (nID != m_nActiveTimerID || m_startTimeNs == 0) return;
  setBusyTime(static_cast<quint64>(getNowNs() - m_startTimeNs));
  m_startTimeNs = 0;
}

//////////

AutoTimeMeas::AutoTimeMeas(const char *msg)
{
  if (msg != nullptr)
    m_msg = msg;
  m_startTimeNs = getNowNs();
}

AutoTimeMeas::~AutoTimeMeas()
{
  if (m_startTimeNs == 0) return;
  qint64 ns = getNowNs() - m_startTimeNs;
  LOG_DPRINTLN("%s> %lld ns (%.3f ms)", m_msg.c_str(), (long long)ns, ns / 1e6);
}

