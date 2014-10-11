// -*-Mode: C++;-*-
//
// qlib's library-related routines
//
// $Id: qlib.cpp,v 1.14 2010/09/12 12:52:38 rishitani Exp $

#include <common.h>

#include "qlib.hpp"
#include "ClassRegistry.hpp"
#include "LMsgLog.hpp"
#include "ObjectManager.hpp"
#include "EventManager.hpp"
// #include "TestClass.hpp"

/*
//static
ClassA *ClassA::fromStringS(const LString &aStr)
{
  MB_DPRINTLN("!!!! ClassA::fromStringS(%s) called.", aStr.c_str());
  if (aStr.equals("B"))
    return MB_NEW ClassB();
  else
    return MB_NEW ClassA();
}
*/

void qlib_regClasses();

static int s_nInitCount = 0;

bool qlib::init()
{
  bool res;

  if (s_nInitCount==0) {
    LMsgLog::init();
    EventManager::init();
    ObjectManager::init();
    ClassRegistry::init();
    qlib_regClasses();
    res = true;
  }
  else
    res = false;

  MB_DPRINTLN("qlib::init() init count %d", s_nInitCount);

  ++s_nInitCount;
  return res;
}

void qlib::fini()
{
  if (s_nInitCount<=0)
    return;

  --s_nInitCount;
  MB_DPRINTLN("qlib::fini() init count %d", s_nInitCount);

  if (s_nInitCount==0) {
    MB_DPRINTLN("qlib::fini() finalized.");
    ClassRegistry::fini();
    ObjectManager::fini();
    EventManager::fini();
    LMsgLog::fini();
  }

  return;
}

// ClassS *ClassS::s_pInst = NULL;

////////////////////////////////////////////////////////////////////////////////
// LOG functions

#define MAX_SBUF_SIZE 1024*64

#define CALL_VSNPRINTF(sbuf, msg) \
  char sbuf[MAX_SBUF_SIZE];\
  va_list marker;\
  va_start(marker, msg);\
  myvsnprintf(sbuf, sizeof sbuf, msg, marker);\
  va_end(marker);

namespace {
  inline void myvsnprintf(char *sbuf, size_t nsize, const char *msg, va_list marker) {
#ifdef WIN32
    _vsnprintf(sbuf, nsize, msg, marker);
    //      _vsnprintf_s(sbuf, nsize, _TRUNCATE, msg, marker);
#else
# ifdef HAVE_VSNPRINTF
    vsnprintf(sbuf, nsize, msg, marker);
# else
    vsprintf(sbuf, msg, marker);
# endif
#endif
  }
}

namespace qlib {

void LOG_verb_printfmt(const char *msg, ...)
{
  CALL_VSNPRINTF(sbuf,msg);
  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf, stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(LMsgLog::DL_VERBOSE, sbuf);
}

void LOG_verb_printlnfmt(const char *msg, ...)
{
  CALL_VSNPRINTF(sbuf,msg);
  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf, stderr);
    fputc('\n', stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(LMsgLog::DL_VERBOSE, sbuf, true);
}

void LOG_err_printfmt(const char *msg, ...)
{
  CALL_VSNPRINTF(sbuf,msg);
  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf, stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(LMsgLog::DL_ERROR, sbuf);
}

void LOG_err_printlnfmt(const char *msg, ...)
{
  CALL_VSNPRINTF(sbuf,msg);
  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf, stderr);
    fputc('\n', stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(LMsgLog::DL_ERROR, sbuf, true);
}

void LOG_printfmt(int nlev, const char *msg, ...)
{
  CALL_VSNPRINTF(sbuf,msg);
  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf, stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(nlev, sbuf);
}

void LOG_printlnfmt(int nlev, const char *msg, ...)
{
  CALL_VSNPRINTF(sbuf,msg);
  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf, stderr);
    fputc('\n', stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(nlev, sbuf, true);
}

}

