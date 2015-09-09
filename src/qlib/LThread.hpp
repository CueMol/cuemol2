// -*-Mode: C++;-*-
//
//  Thread object
//

#ifndef QLIB_THREAD_HPP
#define QLIB_THREAD_HPP

#include "qlib.hpp"

namespace qlib {

  class LTThreadImpl;

  class QLIB_API LThread
  {
  private:
    //boost::thread *m_pthr;
    LTThreadImpl *m_pimp;

    //////////

  public:
    LThread();

    virtual ~LThread();

    //////////

    virtual void run() =0;

    void kick();
    void waitTermination();
    bool waitTermination(int nsec);
    bool isRunning() const;
  };
}

#endif


