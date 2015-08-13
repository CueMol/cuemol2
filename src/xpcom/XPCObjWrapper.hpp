//
// $Id: XPCObjWrapper.hpp,v 1.9 2009/11/15 11:50:41 rishitani Exp $
//

#ifndef XPC_OBJ_WRAPPER_HPP__
#define XPC_OBJ_WRAPPER_HPP__

#include "xpcom.hpp"

#include "qIObjWrapper.h"
#include <qlib/LString.hpp>

namespace qlib {
  class LVarArgs;
  class LScriptable;
}

namespace xpcom {

  using qlib::LScriptable;
  using qlib::LVarArgs;
  using qlib::LString;

  class XPCCueMol;

  class XPCObjWrapper : public qIObjWrapper
  {
  private:
    XPCCueMol *m_pParent;
    int m_nIndex;

    LScriptable *m_pWrapped;

#ifdef MB_DEBUG
    LString m_dbgmsg;
#endif

  private:
    virtual ~XPCObjWrapper();

  public:
    XPCObjWrapper(XPCCueMol *pParent, int ind);

    // Implementation

    void setWrappedObj(LScriptable *pobj);

    void detach();

    LScriptable *getWrappedObj() const;

    // XPCOM iface Implementation

    NS_DECL_ISUPPORTS;

    NS_DECL_QIOBJWRAPPER;

  private:
    nsresult invokeChk1(const char *name);
    nsresult invokeImpl(const char *name, LVarArgs &largs, nsIVariant **_retval);
    
    nsresult checkPropImpl(const char *propname, bool *rval = NULL);

  };

}

#endif
