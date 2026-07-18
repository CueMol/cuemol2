// -*-Mode: C++;-*-
//
//  IOThread object
//

#ifndef QSYS_IO_THREAD_HPP
#define QSYS_IO_THREAD_HPP

#include "qsys.hpp"
#include <qlib/LThread.hpp>

namespace qsys {

  using qlib::PipeStreamImpl;
  using qlib::PipeInStream;

  class IOThread : public qlib::LThread
  {
  public:
    qlib::LScrSp<ObjReader> m_pRdr;
    ObjectPtr m_pObj;

    qlib::sp<PipeStreamImpl> m_pipeImpl;

    PipeInStream m_in;
    // PipeOutStream m_out;

    //////////

    IOThread() : LThread()
    {
      // Initialize the pipe before kick() so that supplyData() can be called
      // from the main thread immediately after loadObjectAsync() without a
      // race condition on m_pipeImpl.
      m_pipeImpl = qlib::sp<PipeStreamImpl>(MB_NEW PipeStreamImpl);
      m_in.setImpl(m_pipeImpl);
    }

    ~IOThread() override
    {
    }

    //////////

    void run() override
    {
      //MB_DPRINTLN("*** Thread %p started ***", m_pthr);
      try {
        ObjectPtr pret = m_pRdr->load(m_in);
        m_pObj = pret;
      }
      catch (qlib::LException &e) {
        LOG_DPRINTLN("Exception %s occured in worker thread: %s",
                     typeid(e).name(), e.getMsg().c_str());
        m_pObj = ObjectPtr();
        return;
      }
      catch (...) {
        LOG_DPRINTLN("Unknown Exception occured in worker thread");
        m_pObj = ObjectPtr();
        return;
      }
      //MB_DPRINTLN("*** Thread %p end ***", m_pthr);
    }

    void supplyData(const char *pbuf, int nlen) {
      MB_DPRINTLN("supply data (%d)", nlen);
      m_pipeImpl->write(pbuf, 0, nlen);
    }

    void notifyEos() {
      MB_DPRINTLN("notify EOS");
      m_pipeImpl->o_close();
    }

  };

}

#endif

