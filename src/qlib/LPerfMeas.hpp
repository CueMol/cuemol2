// -*-Mode: C++;-*-
//
//  Performance measurement using boost::timer
//

#ifndef QLIB_PERF_MEAS_HPP
#define QLIB_PERF_MEAS_HPP

#include "qlib.hpp"
#include "LTypes.hpp"
#include "LString.hpp"
#include "SingletonBase.hpp"

#define PM_IDLE_TIMER 0
#define PM_DRAW_SCENE 1
#define PM_LABEL_RENDER 2
#define PM_RENDER_SCENE 3

namespace qlib {

  class QLIB_API PerfMeasManager : public SingletonBase<PerfMeasManager>
  {
  private:
    static const int NAVER_SIZE = 100;

    std::vector<qint64> m_busytimes;
    void *m_pTimer;
    int m_nBusyTimeIndex;

    int m_nActiveTimerID;
    
    void setBusyTime(quint64 nanosec);

  public:
    
    PerfMeasManager();
    virtual ~PerfMeasManager();

    void enable(int naver);
    void disable();


    void start(int nID);
    void end(int nID);

  };
  
  /// Auto performance measurement class for iterative execution
  class QLIB_API AutoPerfMeas
  {
  private:
    int m_nID;
    PerfMeasManager *m_pPM;

  public:
    AutoPerfMeas(int nID) : m_nID(nID), m_pPM(NULL)
    {
      BeginRequest();
    }
    
    ~AutoPerfMeas()
    {
      EndRequest();
    }
    
  private:

    void EndRequest()
    {
      if (m_pPM==NULL)
        m_pPM = PerfMeasManager::getInstance();
      m_pPM->end(m_nID);
    }
    
    void BeginRequest()
    {
      if (m_pPM==NULL)
        m_pPM = PerfMeasManager::getInstance();
      m_pPM->start(m_nID);
    }
  };
  
  /// Auto performance measurement class for single execution
  class QLIB_API AutoTimeMeas
  {
  private:
    void *m_pTimerObj;

    LString m_msg;

  public:
    AutoTimeMeas(const char *msg=NULL);

    ~AutoTimeMeas();

  };

}

SINGLETON_BASE_DECL(qlib::PerfMeasManager);

#endif

