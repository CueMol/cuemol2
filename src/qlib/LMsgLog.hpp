// -*-Mode: C++;-*-
//
//  Debug Log handling class
//
//  $Id: LMsgLog.hpp,v 1.5 2010/09/23 11:24:32 rishitani Exp $

#include "qlib.hpp"
#include "LScrCallBack.hpp"

#ifndef QLIB_LOGGER_HPP_
#define QLIB_LOGGER_HPP_

namespace qlib {

  class LMsgLogImpl;
  class LLogEventListener;

  ///
  ///  Debug Log class LMsgLog
  ///
  class QLIB_API LMsgLog : public LSingletonScrObject
  {
    MC_SCRIPTABLE;
    
  public:
    ///
    ///  Log level constants
    ///
    enum {
      DL_ERROR  =0,
      DL_WARN   =10,
      DL_NOTIFY =20,
      DL_VERBOSE=30
    };


  private:
    LMsgLogImpl *m_pImpl;

  public:
    LMsgLog();
    virtual ~LMsgLog();

    void writeLog(int nlev, const char *msg, bool bNL =false);

    // log file redirection
    void setRedirect(FILE *fp);
    void setFileRedirPath(const LString &path);
    LString getFileRedirPath() const;

    int addListener(LLogEventListener *plsn);
    bool removeListener(int nid);

    // int addListener(LSCBPtr scb);
    //void removeScrListener(LScrCallBack *plsn);
    

    /////////////////////////////
    // For the scripting interface

    void writeErr(const LString &msg) {
      writeLog(DL_ERROR, msg, false);
    }

    void writeErrLn(const LString &msg) {
      writeLog(DL_ERROR, msg, true);
    }

    LString getAccumMsg() const;
    void removeAccumMsg();

    /////////////////////////////

  public:

    static void init();
    static void fini();

    static LMsgLog *getInstance() { return s_pLog; }

    // these methods are called by ClassReg (ignore)
    static bool initClass(qlib::LClass *) { return true; }
    static void finiClass(qlib::LClass *) {}

/*
    static void verb_printfmt(const char *msg, ...);
    static void verb_printlnfmt(const char *msg, ...);

    static void err_printfmt(const char *msg, ...);
    static void err_printlnfmt(const char *msg, ...);

    static void printfmt(int nlev, const char *msg, ...);
    static void printlnfmt(int nlev, const char *msg, ...);
*/
  private:
    static LMsgLog *s_pLog;

    void resetOutput();
  };

}

#endif // LOGGER_H__

