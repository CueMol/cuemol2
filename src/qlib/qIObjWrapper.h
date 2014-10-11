/*
 * DO NOT EDIT.  THIS FILE IS GENERATED FROM qIObjWrapper.idl
 */

#ifndef __gen_qIObjWrapper_h__
#define __gen_qIObjWrapper_h__


#ifndef __gen_nsISupports_h__
#include "nsISupports.h"
#endif

/* For IDL files that don't want to include root IDL files. */
#ifndef NS_NO_VTABLE
#define NS_NO_VTABLE
#endif
namespace qlib {
     class LScriptable;
}

/* starting interface:    qIObjWrapper */
#define QIOBJWRAPPER_IID_STR "59def3d1-26ca-4cd4-9184-5100c201b76b"

#define QIOBJWRAPPER_IID \
  {0x59def3d1, 0x26ca, 0x4cd4, \
    { 0x91, 0x84, 0x51, 0x00, 0xc2, 0x01, 0xb7, 0x6b }}

class NS_NO_VTABLE qIObjWrapper : public nsISupports {
 public: 

  NS_DECLARE_STATIC_IID_ACCESSOR(QIOBJWRAPPER_IID)

  /* [noscript] void wrapperGetObj (out LScriptablePtr pp); */
  NS_IMETHOD WrapperGetObj(qlib::LScriptable * *pp) = 0;

};

  NS_DEFINE_STATIC_IID_ACCESSOR(qIObjWrapper, QIOBJWRAPPER_IID)

/* Use this macro when declaring classes that implement this interface. */
#define NS_DECL_QIOBJWRAPPER \
  NS_IMETHOD WrapperGetObj(qlib::LScriptable * *pp); 

/* Use this macro to declare functions that forward the behavior of this interface to another object. */
#define NS_FORWARD_QIOBJWRAPPER(_to) \
  NS_IMETHOD WrapperGetObj(qlib::LScriptable * *pp) { return _to WrapperGetObj(pp); } 

/* Use this macro to declare functions that forward the behavior of this interface to another object in a safe way. */
#define NS_FORWARD_SAFE_QIOBJWRAPPER(_to) \
  NS_IMETHOD WrapperGetObj(qlib::LScriptable * *pp) { return !_to ? NS_ERROR_NULL_POINTER : _to->WrapperGetObj(pp); } 

#if 0
/* Use the code below as a template for the implementation class for this interface. */

/* Header file */
class _MYCLASS_ : public qIObjWrapper
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_QIOBJWRAPPER

  _MYCLASS_();

private:
  ~_MYCLASS_();

protected:
  /* additional members */
};

/* Implementation file */
NS_IMPL_ISUPPORTS1(_MYCLASS_, qIObjWrapper)

_MYCLASS_::_MYCLASS_()
{
  /* member initializers and constructor code */
}

_MYCLASS_::~_MYCLASS_()
{
  /* destructor code */
}

/* [noscript] void wrapperGetObj (out LScriptablePtr pp); */
NS_IMETHODIMP _MYCLASS_::WrapperGetObj(qlib::LScriptable * *pp)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

/* End of implementation class template. */
#endif


#endif /* __gen_qIObjWrapper_h__ */
