// -*-Mode: C++;-*-
//
// que library exception classes
//
// $Id: LExceptions.hpp,v 1.3 2010/12/26 12:26:17 rishitani Exp $

#ifndef QUE_LIBRARY_EXCEPTIONS_HPP_
#define QUE_LIBRARY_EXCEPTIONS_HPP_

//////////////////////////////////////

#define MB_DECL_EXCPT_CLASS(APINAME, CLASSNAME, SUPCLSNAME) \
class APINAME CLASSNAME : public SUPCLSNAME { \
public: \
  CLASSNAME() noexcept {} \
  explicit CLASSNAME(const qlib::LString &msg) noexcept : SUPCLSNAME(msg) {} \
};\


#undef MB_THROW
#ifdef __func__
#define MB_THROW(TYPE, MSG) \
  { TYPE __e(MSG);\
     __e.setFileName(__FILE__);\
     __e.setLineNo(__LINE__);\
     __e.setFuncName(__func__);\
     throw __e; }
#else
#define MB_THROW(TYPE, MSG) \
  { TYPE __e(MSG);\
     __e.setFileName(__FILE__);\
     __e.setLineNo(__LINE__);\
     throw __e; }
#endif

//////////////////////////////////////

#include "qlib.hpp"

#include <exception>
#include "LString.hpp"

namespace qlib {

  class QLIB_API LException
  {
  private:
    LString m_msg;
    LString m_fileName;
    LString m_funcName;
    int m_lineNo;

  public:
    LException() noexcept {}
    explicit LException(const LString &msg) noexcept 
      : m_msg(msg), m_fileName("unknown"), m_funcName("unknown"), m_lineNo(-1)
    {
    }

    virtual ~LException() noexcept {}

    virtual LString getMsg() const noexcept { return m_msg; }
    virtual void setMsg(const LString &msg) noexcept { m_msg = msg; }

    void setFileName(const char *str) const noexcept { ((LException *)this)->m_fileName = str; }
    void setFuncName(const char *str) noexcept { m_funcName = str; }
    void setLineNo(int n) noexcept { m_lineNo = n; }

    LString getFmtMsg() const noexcept {
      return LString::format("%s @ %s in %s:%d", m_msg.c_str(), m_funcName.c_str(), m_fileName.c_str(), m_lineNo);
    }
  };

  /** superclass of general runtime exceptions */
  MB_DECL_EXCPT_CLASS(QLIB_API, RuntimeException, LException);

  MB_DECL_EXCPT_CLASS(QLIB_API, OutOfMemoryException, RuntimeException);

  MB_DECL_EXCPT_CLASS(QLIB_API, IndexOutOfBoundsException, RuntimeException);
  
  MB_DECL_EXCPT_CLASS(QLIB_API, NullPointerException, RuntimeException);

  MB_DECL_EXCPT_CLASS(QLIB_API, IllegalArgumentException, RuntimeException);
  
  MB_DECL_EXCPT_CLASS(QLIB_API, InvalidCastException, RuntimeException);

  MB_DECL_EXCPT_CLASS(QLIB_API, SecurityException, RuntimeException);

  MB_DECL_EXCPT_CLASS(QLIB_API, InterruptedException, RuntimeException);

  MB_DECL_EXCPT_CLASS(QLIB_API, PropNotFoundException, RuntimeException);

  template <typename _Type>
  _Type *ensureNotNull(_Type *pArg) {
    if (pArg==NULL) {
      MB_THROW(NullPointerException, "ensureNotNull failed");
    }
    return pArg;
  }

  ////////////////////////////////////////////////

  /** superclass of general I/O exceptions */
  MB_DECL_EXCPT_CLASS(QLIB_API, IOException, LException);

  /** End-of-file exceptions */
  MB_DECL_EXCPT_CLASS(QLIB_API, EOFException, IOException);

  /** File format exception */
  MB_DECL_EXCPT_CLASS(QLIB_API, FileFormatException, IOException);

}

#endif // QUE_LIBRARY_EXCEPTIONS_HPP_

