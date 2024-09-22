#pragma once

#include "api.hpp"

namespace qlib {
  class LString;
  class LScriptable;
  class LVariant;
  class LVarArgs;
  // class LDynamic;
}

namespace cuemol2 {

  LIBCUEMOL_API bool hasClass(const qlib::LString &clsname,
                              bool *retval,
                              qlib::LString &errmsg) noexcept;

  LIBCUEMOL_API bool getAllClassNamesJSON(qlib::LString &retval,
                                      qlib::LString &errmsg) noexcept;

  LIBCUEMOL_API bool getService(const qlib::LString &svcname,
                                qlib::LScriptable **prval,
                                qlib::LString &errmsg) noexcept;

  LIBCUEMOL_API bool createObj(const qlib::LString &svcname,
                               const qlib::LString &strval,
                               qlib::LScriptable **prval,
                               qlib::LString &errmsg) noexcept;

  //////////

  LIBCUEMOL_API bool hasProp(qlib::LScriptable *pthis,
                             const qlib::LString &propname,
                             bool &retval,
                             qlib::LString &errmsg) noexcept;
    
  LIBCUEMOL_API bool getProp(qlib::LScriptable *pthis,
                             const qlib::LString &propnm,
                             qlib::LVariant &val,
                             qlib::LString &errmsg) noexcept;
  
  LIBCUEMOL_API bool setProp(qlib::LScriptable *pthis,
                             const qlib::LString &propnm,
                             const qlib::LVariant &val,
                             qlib::LString &errmsg) noexcept;

  LIBCUEMOL_API bool invokeMethod(qlib::LScriptable *pthis,
                                  const qlib::LString &mthnm,
                                  qlib::LVarArgs &args,
                                  qlib::LString &errmsg) noexcept;

  LIBCUEMOL_API bool toString(qlib::LScriptable *pthis,
                              qlib::LString &val,
                              qlib::LString &errmsg) noexcept;

  LIBCUEMOL_API bool resetProp(qlib::LScriptable *pthis,
                               const qlib::LString &propname,
                               qlib::LString &errmsg) noexcept;

  LIBCUEMOL_API bool getPropsJSON(qlib::LScriptable *pthis,
                                  qlib::LString &retval,
                                  qlib::LString &errmsg) noexcept;

  LIBCUEMOL_API bool getPropDefaultStatus(qlib::LScriptable *pthis,
                                          const qlib::LString &propnm,
                                          int &retval,
                                          qlib::LString &errmsg) noexcept;

} // namespace cuemol2
