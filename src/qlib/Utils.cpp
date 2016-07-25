// -*-Mode: C++;-*-
//
// utilities
//
// $Id: Utils.cpp,v 1.7 2011/03/10 13:11:55 rishitani Exp $

#include <common.h>

#include "LString.hpp"
#include "LDebug.hpp"
#include "Utils.hpp"
#include "LExceptions.hpp"

#ifdef _WIN32
#  include "LUnicode.hpp"
#  include <sys/stat.h>
#endif

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>

using namespace qlib;
namespace fs = boost::filesystem;

namespace qlib {

  LString getLeafName(const LString &aPath)
  {
    fs::path path(aPath.c_str());
#if (BOOST_FILESYSTEM_VERSION==2)
    return LString(path.filename());
#else
    return LString(path.filename().string());
#endif
  }

LString makeRelativePath(const LString &aAbs, const LString &aBase)
{
  fs::path abspath(aAbs.c_str());
  fs::path basepath(aBase.c_str());
  if (!abspath.is_complete() || !basepath.is_complete())
    return aAbs; // aAbs or aBase is not absolute path

  if (abspath.root_path()!=basepath.root_path())
    return aAbs; // root names are different; cannot make relative path

  fs::path::const_iterator iter1 = abspath.begin();
  fs::path::const_iterator iter1_end = abspath.end();
  fs::path::const_iterator iter2 = basepath.begin();
  fs::path::const_iterator iter2_end = basepath.end();

  for (; iter1!=iter1_end && iter2!=iter2_end ; ++iter1, ++iter2) {
    if (*iter1!=*iter2) break;
  }

  fs::path relpath;
  //if (iter1!=iter1_end && iter2!=iter2_end) {
    for (; iter2!=iter2_end; ++iter2)
      relpath /= "..";
    for (; iter1!=iter1_end; ++iter1)
      relpath /= *iter1;
  //}

  // string() will canonicalize the path separator to "/"
  //return relpath.file_string();
  return relpath.string();
}

LString makeAbsolutePath(const LString &aRel, const LString &aBase)
{
  MB_DPRINTLN("makeAbsPath rel=%s, base=%s", aRel.c_str(), aBase.c_str());

  fs::path relpath(aRel.c_str());
  fs::path basepath(aBase.c_str());
  if (relpath.is_complete())
    return aRel; // aRel is already in abs form

  // convert to the absolute representation

  fs::path::const_iterator iter1 = relpath.begin();
  fs::path::const_iterator iter1_end = relpath.end();

  int nup = 0;
  for (; iter1!=iter1_end; ++iter1) {
    if (*iter1=="..")
      ++nup;
    else
      break;
  }

  if (nup==0) {
    // There's no up-dir ('..') string --> just concat to make abs path.
#if (BOOST_FILESYSTEM_VERSION==2)
    relpath = fs::complete(relpath, basepath);
    return relpath.file_string();
#else
    relpath = fs::absolute(relpath, basepath);
    return relpath.string();
#endif
  }

  for (; nup>0; --nup) {
    MB_ASSERT(basepath.has_parent_path());
    basepath = basepath.parent_path();
  }
  
  for (; iter1!=iter1_end; ++iter1) {
    basepath /= *iter1;
  }

#if (BOOST_FILESYSTEM_VERSION==2)
  return basepath.file_string();
#else
  return basepath.string();
#endif
}

bool isAbsolutePath(const LString &aPath)
{
  fs::path path(aPath.c_str());
  return path.is_complete();
}

bool isFileReadable(const LString &strpath)
{
#ifdef _WIN32
  U16Char *pwcs;

  try {
    // conv pathname
    pwcs = qlib::UTF8toUCS16(strpath);
  }
  catch (const LException &ex) {
    // conversion error
    // --> file is not readable
    //return false;

    LString msg = LString::format("isFileReadable: cannot convert UTF8 file name <%s>", strpath.c_str());
    LOG_DPRINTLN(msg);
    MB_THROW(RuntimeException, msg);
    return NULL;
  }
  
  struct _stat buf;
  int result = _wstat( (wchar_t *)pwcs, &buf );
  delete [] pwcs;
  if (result==0 && (buf.st_mode&_S_IFREG))
    return true;
#else
  fs::path path(strpath);

  if (fs::exists(path) &&
      fs::is_regular_file(path))
    return true;
#endif

  return false;
}

}

