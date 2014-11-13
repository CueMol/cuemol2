// -*-Mode: C++;-*-
//
// Singleton class for RMI Manager
//

#ifndef RMI_MANAGER_HPP_INCLUDED
#define RMI_MANAGER_HPP_INCLUDED

#include "xrbr.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/LThread.hpp>

#include "ReqEvtQueue.hpp"

namespace xrbr {

  using std::map;
  using qlib::LString;
  using qlib::LScriptable;

  ///
  ///  Singleton class for RMI Manager
  ///
  class XRBR_API RMIMgr
    : public qlib::LSingletonScrObject,
      public qlib::SingletonBase<RMIMgr>
  {
    MC_SCRIPTABLE;


  public:
    
    RMIMgr();
    virtual ~RMIMgr();
    
    ///////////////////////

  private:
    // XrMgrThrImpl *m_pMgrThr;

  public:
    // void run();

    void start();

    // void processReq(int n) { m_que.processReq(n); }
  };

}

#endif

