// -*-Mode: C++;-*-
//
// LDataSrcContainer.cpp
//   data source container interface (default implementation of)
//

#include <common.h>

#include "LDataSrcContainer.hpp"
#include "FileStream.hpp"
#include "Utils.hpp"
#include "LExceptions.hpp"

using namespace qlib;

//LDataSrcContainer::~LDataSrcContainer()
//{
//}

bool LDataSrcContainer::isDataSrcWritable() const
{
  return false;
}

LString LDataSrcContainer::getDataChunkReaderName(int nQdfVer) const
{
  return LString();
}

void LDataSrcContainer::setDataChunkName(const LString &name, LDom2Node *pNode, int nQdfVer)
{
}

void LDataSrcContainer::writeDataChunkTo(LDom2OutStream &oos) const
{
}

void LDataSrcContainer::readFromStream(qlib::InStream &ins)
{
}

void LDataSrcContainer::readFromPath(const LString &path)
{
  qlib::FileInStream fis;
  fis.open(path);
  readFromStream(fis);
  fis.close();
}

// static
LString  LDataSrcContainer::selectSrcAltSrc(const LString &src,
                                            const LString &altsrc,
                                            const LString &aBasePath,
                                            bool &rbReadFromAltSrc)
{
  MB_DPRINTLN("LDataSrcContainer.selectSrcAltSrc> called");
  MB_DPRINTLN("  > src=<%s>", src.c_str());
  MB_DPRINTLN("  > altsrc=<%s>", altsrc.c_str());
  MB_DPRINTLN("  > base_path=<%s>", aBasePath.c_str());

  bool bReadFromAltSrc = false;

  LString abs_path;
  LString base_path = aBasePath;

  if (base_path.isEmpty() && altsrc.isEmpty()) {
    // only the src is supplied: load from cwd (this occurs in the CUI case)
    base_path = ".";
  }

  // First, try to convert "src" to abs path
  if (isAbsolutePath(src)) {
    abs_path = src;
  }
  else if (!base_path.isEmpty()) {
    // Convert src to abs path using base_path
    MB_DPRINTLN("Abs path (orig)>");
    abs_path.dump();
    MB_DPRINTLN("Base path>");
    base_path.dump();
    abs_path = makeAbsolutePath(src, base_path);
    MB_DPRINTLN("Abs path (changed)>");
    abs_path.dump();
    LOG_DPRINTLN("selSrcAltSrc> abs_path is changed to %s", abs_path.c_str());
  }  

  if (abs_path.isEmpty() || !isFileReadable(abs_path)) {
    // Second, try to convert "altsrc" to abs path
    if (altsrc.isEmpty()) {
      // empty alt src --> no src path info available (ERROR)
      LString msg = LString::format("Fatal error, cannot open file: \"%s\"",
                                    abs_path.c_str());
      LOG_DPRINTLN("SceneXML> %s", msg.c_str());
      MB_THROW(qlib::IOException, msg);
      return LString();
    }

    if (isAbsolutePath(altsrc))
      abs_path = altsrc;
    else if (!base_path.isEmpty())
      abs_path = makeAbsolutePath(altsrc, base_path);

    if (!isFileReadable(abs_path)) {
      LString msg = LString::format("Fatal error, cannot open file: \"%s\"",
                                    abs_path.c_str());
      LOG_DPRINTLN("SceneXML> %s", msg.c_str());
      MB_THROW(qlib::IOException, msg);
      return LString();
    }
    // read from alt_src property (abs_path==alt_src)
    bReadFromAltSrc = true;
  }

  rbReadFromAltSrc = bReadFromAltSrc;
  return abs_path;
}

LString  LDataSrcContainer::readFromSrcAltSrc(const LString &src,
                                              const LString &altsrc,
                                              const LString &base_path,
                                              bool &rbReadFromAltSrc)
{
  LString abs_path = selectSrcAltSrc(src, altsrc, base_path, rbReadFromAltSrc);

  readFromPath(abs_path);

  return abs_path;
}

