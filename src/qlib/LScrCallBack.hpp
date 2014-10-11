//
// Superclass of script callback (function) object
//
// $Id: LScrCallBack.hpp,v 1.2 2009/08/15 11:29:04 rishitani Exp $

#include "qlib.hpp"
#include "LScrSmartPtr.hpp"
#include "LScrObjects.hpp"
#include "mcutils.hpp"

#ifndef __QLIB_SCR_CALLBACK_HPP__
#define __QLIB_SCR_CALLBACK_HPP__

namespace qlib {
  class LVarArgs;
  //class LVariant;

  class QLIB_API LScrCallBack : public qlib::LSimpleCopyScrObject
    {
      MC_SCRIPTABLE;

    public:

      /** invoke the callback method */
      virtual bool invoke(LVarArgs &args) =0;

    };

  typedef LScrSp<LScrCallBack> LSCBPtr;
}

#endif

