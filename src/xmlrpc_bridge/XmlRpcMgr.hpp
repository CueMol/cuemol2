//
// Singleton class for
// XML-RPC Manager
//

#ifndef XML_RPC_MANAGER_HPP_INCLUDED
#define XML_RPC_MANAGER_HPP_INCLUDED

#include "xrbr.hpp"

#include <qlib/SingletonBase.hpp>
#include <qlib/LScriptable.hpp>

#include <xmlrpc-c/base.hpp>

namespace xrbr {

  using std::map;
  using qlib::LString;
  using qlib::LScriptable;

  ///
  ///  Singleton class for
  ///  XML-RPC Manager
  ///
  class XRBR_API XmlRpcManager : public qlib::SingletonBase<XmlRpcManager>
  {
  private:
    struct Entry {
      LScriptable *p;
      int icnt;
    };

    typedef map<qlib::uid_t, Entry> ObjTable;

    /// UID --> object ptr table
    ObjTable m_objtab;

    typedef map<uintptr_t, qlib::uid_t> RevTable;

    /// object ptr table --> UID table
    RevTable m_revtab;

    qlib::uid_t m_uidgen;

  public:
    
    XmlRpcManager();
    virtual ~XmlRpcManager();
    
    ///////////////////////

  private:
    qlib::uid_t createNewUID() {
      return ++m_uidgen;
    }

    qlib::uid_t registerObj(LScriptable *pObj);

    bool convLvar2Xrval(qlib::LVariant &variant, xmlrpc_c::value *pVal);
    bool convXrval2Lvar(const xmlrpc_c::value *pVal, qlib::LVariant &variant);

    ///////////////////////

  public:
    qlib::uid_t createObj(const LString &clsnm);
    qlib::uid_t getService(const LString &clsname);
    bool destroyObj(qlib::uid_t uid);
    qlib::LScriptable *getObj(qlib::uid_t uid);

    bool getProp(qlib::uid_t uid, const LString &propnm, xmlrpc_c::value *pRval);
    bool setProp(qlib::uid_t uid, const LString &propnm, const xmlrpc_c::value *pVal);

    bool callMethod(qlib::uid_t uid, const LString &mthnm, const xmlrpc_c::carray &vargs, xmlrpc_c::value *pRval);

    ///////////////////////

    void run();
  };

}

#endif

