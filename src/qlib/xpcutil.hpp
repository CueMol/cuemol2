//
//
// $Id: xpcutil.hpp,v 1.6 2008/07/11 12:53:33 rishitani Exp $

#ifndef QLIB_XPCOM_UTIL_HPP_
#define QLIB_XPCOM_UTIL_HPP_

#include "qIObjWrapper.h"
//#include "LScrSmartPtr.hpp"

struct xpcutil {

  /**
     Make a copy of string for returning to the XPCOM side.
  */
  static char *copy_string(const char *pstr){
    const int nlen = ::strlen(pstr);
    char *pret = (char *)NS_Alloc(nlen+1);
    ::strcpy(pret, pstr);
    return pret;
  }

  /**
     Get the scriptable obj wrapped in the wrapper "pif".
  */
  static qlib::LScriptable *getInternalObj(qIObjWrapper *pif) {
    qlib::LScriptable *tmp = NULL;
    pif->WrapperGetObj(&tmp);
    //nsresult rv = pif->WrapperGetObj(&tmp);
    // NS_ENSURE_SUCCESS(rv, rv);
    if (!tmp) {
      LOG_DPRINTLN("getInternalObj: qIObjWrapper[%p].WrapperGetObj() returned NULL!!",
		   pif);
      return NULL;
    }

    return tmp;
  }

  template <class _XPCType, class _XPCIface>
  static bool setupRvalObj(qlib::LScriptable* prval, _XPCIface **vrval) {
    qlib::LWrapper *ptmp = prval->createWrapper(LWRAPPERID_XPC);
    // We don't own the prval ptr after here!!
    prval->destruct();
    _XPCType *tmp_ptmp = dynamic_cast<_XPCType *>(ptmp);
    (*vrval) = dynamic_cast<_XPCIface *>(tmp_ptmp);
    if (!(*vrval)) {
      LOG_DPRINTLN("Cannot convert prval(%s) to %s",
		   typeid(*prval).name(),
		   typeid(_XPCIface).name());
      delete ptmp;
      return false;
    }
    NS_ADDREF((*vrval));
    return true;
  }

};

#endif //

