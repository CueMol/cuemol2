// -*-Mode: C++;-*-
//
// Molecular selection compiler/decompiler
//
// $Id: SelCompiler.hpp,v 1.6 2011/02/05 07:13:08 rishitani Exp $

#ifndef MOLSEL_COMPILER_HPP_INCLUDED
#define MOLSEL_COMPILER_HPP_INCLUDED

#include "molstr.hpp"

#include <qlib/LString.hpp>
#include <qlib/SingletonBase.hpp>

#define YY_NO_UNISTD_H

namespace molstr {

  class SelSuperNode;

  using qlib::LString;

  class MOLSTR_API SelCompiler : public qlib::SingletonBase<SelCompiler>
  {
  public:
    SelCompiler();
    ~SelCompiler();

    SelSuperNode *compile(const LString &);

    /**
       Change to the number scanning state.
       Only used from parser implementation.
    */
    static void setSelNumState();
    static void setSelRexState();
    static void setSelState();

    /// Check validity of name reference
    static bool checkNameRef(const char *name);

    int yyInput(char *buf, int nmax);

    void evalNode(SelSuperNode *pNode);

    void setErrorMsg(const LString &msg) {
        m_errorMsg = msg;
    }
    LString getErrorMsg() const {
        return m_errorMsg;
    }

  private:
    SelSuperNode *m_pBuilt;
    char *m_sbuf;
    int m_nsize;
    LString m_errorMsg;

    int yyparse_wrapper();
    static void resetScannerState();
    static void resetParserState();
  };

}

#if !defined(isatty)
inline int isatty (int ) { return 0; }
#endif

SINGLETON_BASE_DECL(molstr::SelCompiler);

#endif
