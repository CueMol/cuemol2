// -*-Mode: C++;-*-
//
// Client Request Queue
// XML-RPC Manager
//

#ifndef REQ_EVT_QUEUE_HPP_INCLUDED
#define REQ_EVT_QUEUE_HPP_INCLUDED

#include "xrbr.hpp"
#include <qlib/LString.hpp>
#include <qlib/LVarArgs.hpp>
#include <boost/thread/condition.hpp>

namespace qlib {
  class LScriptable;
}

namespace xrbr {

  using qlib::LString;

  class ReqEvtObj
  {
  public:
    bool m_bOK;
    LString m_errmsg;

    ReqEvtObj() : m_bOK(false) {}
    virtual ~ReqEvtObj();

    enum {
      REO_CREATEOBJ,
    };

    // virtual int getType() const =0;

    virtual void doit() =0;
  };

  class ReoCreateObj : public ReqEvtObj
  {
  public:
    LString m_clsname;
    
    qlib::LScriptable *m_pRval;

    // virtual int getType() const;

    virtual void doit();
  };

  class ReoCallMethod : public ReqEvtObj
  {
  public:
    ReoCallMethod(int nargs) : m_vargs(nargs) {}

    qlib::LScriptable *m_pObj;
    LString m_mthname;
    qlib::LVarArgs m_vargs;

    virtual void doit();
  };



  class ReqEvtQueue
  {
  private:
    ReqEvtObj *m_pData1;
    boost::mutex m_mu1;
    boost::condition m_cond1;

    ReqEvtObj *m_pData2;
    boost::mutex m_mu2;
    boost::condition m_cond2;

  public:
    ReqEvtQueue() : m_pData1(NULL), m_pData2(NULL) {}

    void putWait(ReqEvtObj *pObj);

    void processReq(int nWait);

  private:
    ReqEvtObj *peek1();
    ReqEvtObj *wait1(int nWait);

  };


}


#endif

