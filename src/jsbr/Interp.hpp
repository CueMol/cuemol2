// -*-Mode: C++;-*-
//
// Interpreter class for JS interpreter
//
// $Id: Interp.hpp,v 1.7 2010/12/29 16:39:53 rishitani Exp $


#ifndef JSBR_INTERP_HPP_INCLUDED__
#define JSBR_INTERP_HPP_INCLUDED__

#include "jsbr.hpp"
#include <qlib/LString.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/LScrCallBack.hpp>

namespace qlib {
  class LScriptable;
}

namespace jsbr {

class JSCallBackObj;
using qlib::LString;

  /**
     Interpreter class for JS interpreter
  */
  class JSBR_API Interp
  {
  private:
    ///
    /// Context data (an instance of JSContext) for this interp.
    ///
    void *m_pdata;

    
    ///
    /// Global objects (an instance of JSObject) for this ctxt.
    ///
    void *m_pGlob;

    /// command line arguments
    std::deque<LString> m_cmdargs;

  public:

    ///
    /// Create a new JS interperter with the context p.
    ///
    Interp(void *p) : m_pdata(p) {}

    ~Interp();

  private:
    qlib::MapTable<LString> m_pathTab;

  public:
    void setScriptPath(const LString &key, const LString &path) {
      m_pathTab.set(key, path);
    }

    void removeScriptPath(const LString &key) {
      m_pathTab.remove(key);
    }

    LString resolvePath(const LString &fname) const;

    ///

    const std::deque<LString> &getCmdArgs() const {
      return m_cmdargs;
    }

    void setCmdArgs(const std::deque<LString> &args) {
      m_cmdargs = args;
    }

    //////////////////////////

    ///
    ///  Setup the JS interperter.
    ///
    bool init(qlib::LScriptable *pGlob);

    ///
    ///  Cleanup the JS interpreter and related objects.
    ///
    void fini();

    ///
    ///  Define the variable (in the global context)
    ///
    bool defineVar(const LString &varnm, qlib::LScriptable *pvalue);

    bool invokeMethod(const LString &mthnm, qlib::LVarArgs &args, qlib::LScriptable *pobj=NULL);

    ///
    ///  Evaluate the JS expressions
    ///
    void eval(const LString &scr);

    ///
    ///  Execute the JS program file
    ///
    bool execFile(const LString &fname);

  };

}

#endif
