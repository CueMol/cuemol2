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
#include "LPerfMeas.hpp"
// #include "TestClass.hpp"

#include <boost/filesystem/path.hpp>
#if (BOOST_FILESYSTEM_VERSION>2)
#  include <boost/filesystem/detail/utf8_codecvt_facet.hpp>
#  include <locale>
#endif

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
void qlib_unregClasses();

static int s_nInitCount = 0;

bool qlib::init()
{
  bool res;

  if (s_nInitCount==0) {
    LString::initLocale();
    LMsgLog::init();
    EventManager::init();
    ObjectManager::init();
    ClassRegistry::init();
    PerfMeasManager::init();
    qlib_regClasses();
    res = true;

#if (BOOST_FILESYSTEM_VERSION>2)
    std::locale global_loc = std::locale();
    std::locale loc(global_loc, new boost::filesystem::detail::utf8_codecvt_facet);
    boost::filesystem::path::imbue(loc);
#endif

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
    qlib_unregClasses();
    PerfMeasManager::fini();
    ClassRegistry::fini();
    ObjectManager::fini();
    EventManager::fini();
    LMsgLog::fini();
    LString::finiLocale();
  }

  return;
}

// ClassS *ClassS::s_pInst = NULL;

////////////////////////////////////////////////////////////////////////////////
// LOG functions

namespace qlib {

void LOG_verb_printfmt(const char *fmt, ...)
{
  LString sbuf;

  va_list marker;
  va_start(marker, fmt);
  sbuf.vformat(fmt, marker);
  va_end(marker);

  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf.c_str(), stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(LMsgLog::DL_VERBOSE, sbuf);
}

void LOG_verb_printlnfmt(const char *fmt, ...)
{
  LString sbuf;

  va_list marker;
  va_start(marker, fmt);
  sbuf.vformat(fmt, marker);
  va_end(marker);

  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf, stderr);
    fputc('\n', stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(LMsgLog::DL_VERBOSE, sbuf, true);
}

void LOG_err_printfmt(const char *fmt, ...)
{
  LString sbuf;

  va_list marker;
  va_start(marker, fmt);
  sbuf.vformat(fmt, marker);
  va_end(marker);

  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf, stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(LMsgLog::DL_ERROR, sbuf);
}

void LOG_err_printlnfmt(const char *fmt, ...)
{
  LString sbuf;

  va_list marker;
  va_start(marker, fmt);
  sbuf.vformat(fmt, marker);
  va_end(marker);

  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf, stderr);
    fputc('\n', stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(LMsgLog::DL_ERROR, sbuf, true);
}

void LOG_printfmt(int nlev, const char *fmt, ...)
{
  LString sbuf;

  va_list marker;
  va_start(marker, fmt);
  sbuf.vformat(fmt, marker);
  va_end(marker);

  LMsgLog *pML = LMsgLog::getInstance();
  if (pML==NULL) {
    fputs(sbuf, stderr);
    fflush(stderr);
  }
  else
    pML->writeLog(nlev, sbuf);
}

void LOG_printlnfmt(int nlev, const char *fmt, ...)
{
  LString sbuf;

  va_list marker;
  va_start(marker, fmt);
  sbuf.vformat(fmt, marker);
  va_end(marker);

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

