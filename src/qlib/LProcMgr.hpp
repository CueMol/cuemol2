// -*-Mode: C++;-*-
//
//  Process manager
//

#include "qlib.hpp"
#include "LScrObjects.hpp"
#include "LScrSmartPtr.hpp"
#include "SingletonBase.hpp"
#include "mcutils.hpp"
#include "LThread.hpp"
#include "EventManager.hpp"

#ifndef QLIB_PROCESS_MANAGER_HPP
#define QLIB_PROCESS_MANAGER_HPP

namespace qlib {

  class ProcInThread;

  /// OS-dependent process mgr implementation
  class LProcMgrImpl
  {
  public:
    LProcMgrImpl() {}
    virtual ~LProcMgrImpl() {}
    
    virtual int getCPUCount() const =0;

    virtual ProcInThread *createProcess(const LString &path,
                                        const LString &args,
					const LString &wdir) =0;

    virtual void kill(ProcInThread *) =0;

  };

  class ProcEnt
  {
  public:
    std::list<int> m_waitIDs;
    int m_nProcID;
    LString m_path;
    LString m_cmdline;
    LString m_wdir;
    ProcInThread *m_pThr;

    ProcEnt() : m_nProcID(-1), m_pThr(NULL) {}

    void removeWaitID(int id) {
      if (m_waitIDs.empty()) return;
      std::list<int>::iterator i = std::find(m_waitIDs.begin(), m_waitIDs.end(), id);
      if (i==m_waitIDs.end())
        return;
      m_waitIDs.erase(i);
    }
  };

  ///
  /// Process manager singleton class
  /// 
  class QLIB_API LProcMgr
       : public LSingletonScrObject,
         public qlib::SingletonBase<LProcMgr>,
         public qlib::IdleTask
  {
    MC_SCRIPTABLE;
    
  private:
    LProcMgrImpl *m_pImpl;

    /// running task slot
    std::vector<ProcEnt *> m_tab;

    /// waiting task queue
    int m_nNextIndex;
    typedef std::map<int, ProcEnt *> queue_t;
    queue_t m_queue;

    /// ended task list
    typedef std::deque<ProcEnt *> endq_t;
    endq_t m_endq;

    /// Log file path
    LString m_logpath;
    
    /// show cmdline flag
    bool m_bShowCmdLine;

  public:
    void setLogPath(const LString &logpath) {
      m_logpath = logpath;
    }

  private:
    /// Error message (empty if no error occured)
    LString m_errormsg;

  public:
    LString getErrorMsg() const { return m_errormsg; }

    /////////////////////////////

  public:
    LProcMgr();
    virtual ~LProcMgr();

    void setSlotSize(int n);
    int getSlotSize() const { return m_tab.size(); }

    int getQueueLen() const { return m_queue.size(); }

    /// Kill all tasks, clean-up all queues, and clear error
    void killAll();

    bool isEmpty() const;

    int queueTask(const LString &path,
                  const LString &args,
                  const LString &wait_ids,
		  const LString &wdir = LString());

    enum {
      PM_QUEUED=0,
      PM_RUNNING=1,
      PM_ENDED=2,
      PM_UNKNOWN=3
    };
    
    int getState(int id);

    bool isAlive(int id) {
      int stat = getState(id);
      return (stat==PM_QUEUED||
              stat==PM_RUNNING);
    }

    bool isEnded(int id) {
      return (getState(id)==PM_ENDED);
    }

    void waitForExit(int id);

    void kill(int id);

    LString peekResultOutput(int id);
    LString getResultOutput(int id);

    LString doneTaskListJSON() {
      LString rval = "[";
      bool bstart = true;
      BOOST_FOREACH (ProcEnt *pEnt, m_endq) {
        if (bstart)
          bstart = false;
        else
          rval += ",";
        rval += LString::format("%d", pEnt->m_nProcID);
      }
      rval += "]";
      return rval;
    }

    void checkQueue();

  private:
    void waitForRunningExit(int id);

    void waitEmptySlot();

    int getEmptySlot();

    void finishTask(int isl);

    int findInSlot(int id);

    ProcEnt *findInSlot2(int id) {
      int isl = findInSlot(id);
      if (isl<0) return NULL;
      return m_tab[isl];
    }

    void killSlot(int isl);

    endq_t::iterator findInEndq(int id)
    {
      endq_t::iterator iter = m_endq.begin();
      for (; iter!=m_endq.end(); ++iter) {
        ProcEnt *pEnt = *iter;
        if (pEnt->m_nProcID==id) {
          return iter;
        }
      }
      return iter;
    }

    void updateWaitIDs(ProcEnt *pEnt);

    void writeLogFile(const LString &);

  public:

    /// Idle task support:
    /// Check process queue periodically
    virtual void doIdleTask();
    
    // these methods are called by ClassReg (ignore)
    static bool initClass(qlib::LClass *);
    static void finiClass(qlib::LClass *);

  };

}

SINGLETON_BASE_DECL(qlib::LProcMgr);
#endif

