// -*-Mode: C++;-*-
//
// RMI Manager (superclass)
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

  class XRBR_API MgrImpl
  {
  public:
    virtual ~MgrImpl() {}
    virtual void start()=0;
  };

  ///
  ///  Singleton class for RMI Manager
  ///
  class XRBR_API RMIMgr
    : public qlib::LSingletonScrObject,
      public qlib::SingletonBase<RMIMgr>
  {
    MC_SCRIPTABLE;

  private:
    MgrImpl *m_pMgrImpl;

  public:
    
    RMIMgr();
    virtual ~RMIMgr();
    
    ///////////////////////

  private:

    /// Request-object queue
    ReqEvtQueue m_que;

  public:
    /// Process RMI requests by the main thread
    /// @param n wait request for n millisec at least
    void processReq(int n);

    ///////////////////////

  private:
    struct Entry {
      LScriptable *p;
      int icnt;
    };

    typedef map<qlib::uid_t, Entry> ObjTable;

    /// UID --> object ptr table
    ObjTable m_objtab;

    qlib::uid_t m_uidgen;

    qlib::uid_t createNewUID() {
      return ++m_uidgen;
    }

  public:

    qlib::uid_t registerObj(LScriptable *pObj);

    LScriptable *getObj(qlib::uid_t uid);

    /// Push request of createObj
    ///  (server-thread side method)
    qlib::uid_t createObj(const LString &clsname);

    qlib::uid_t getService(const LString &clsname);

    bool destroyObj(qlib::uid_t uid);

    int hasProp(qlib::uid_t uid, const LString &propnm);

    bool getProp(qlib::uid_t uid, const LString &propnm, qlib::LVariant &result);

    bool setProp(qlib::uid_t uid, const LString &propnm, const qlib::LVariant &value);

    bool callMethod(qlib::uid_t uid, const LString &mthnm,
		    qlib::LVarArgs &largs);

  private:
    LString m_errmsg;

  public:
    const LString &getErrMsg() const { return m_errmsg; }

  private:
    std::set<LString> m_creds;

  public:
    bool chkCred(const LString &c);

  public:

    void registerCred(const LString &c);
    void unregisterCred(const LString &c);

    bool startServer();
  };

}

#endif

