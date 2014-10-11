// -*-Mode: C++;-*-
//
//  Thread object
//

#ifndef QLIB_THREAD_HPP
#define QLIB_THREAD_HPP

#include "qlib.hpp"
#include <boost/thread.hpp>
#include <boost/bind.hpp>

namespace qlib {

  class LThread
  {
  private:
    boost::thread *m_pthr;

    //////////

  public:
    LThread() : m_pthr(NULL) {}

    virtual ~LThread()
    {
      if (m_pthr)
        delete m_pthr;
    }

    //////////

    virtual void run() =0;

    void kick()
    {
      m_pthr = MB_NEW boost::thread(boost::bind(&LThread::run, this));
    }

    void waitTermination()
    {
      MB_DPRINTLN("wait termination ...");
      if (m_pthr!=NULL) {
        m_pthr->join();
        delete m_pthr;
        m_pthr = NULL;
      }
      MB_DPRINTLN("wait termination OK.");
    }

    bool waitTermination(int nsec)
    {
      MB_DPRINTLN("wait (%d sec) termination ...", nsec);
      if (m_pthr!=NULL) {
        if (m_pthr->timed_join(boost::posix_time::seconds(nsec)))
          return false; // timeout
        // OK
        delete m_pthr;
        m_pthr = NULL;
      }
      MB_DPRINTLN("wait termination OK.");
	  return true;
    }

    bool isRunning() const {
      if (m_pthr!=NULL) {
        if (m_pthr->timed_join(boost::posix_time::seconds(0)))
          return false;
        return true;
      }
      else
        return false;
    }

  };
}

#endif


