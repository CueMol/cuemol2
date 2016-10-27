// -*-Mode: C++;-*-
//
// Object writer
//
// $Id: ObjWriter.cpp,v 1.4 2011/01/03 16:47:05 rishitani Exp $

#include <common.h>

#include "ObjWriter.hpp"
#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>
#include <qlib/FileStream.hpp>
#include <qlib/Base64Stream.hpp>
#include <qlib/GzipStream.hpp>
#include <qlib/LDOM2Tree.hpp>

#ifdef HAVE_LZMA_H
#include <qlib/XzStream.hpp>
#endif

using namespace qsys;

// MC_SCRIPTABLE_EMPTY_IMPL(ObjWriter);
// MC_DYNCLASS_IMPL(ObjWriter, ObjWriter, qlib::LSpecificClass<ObjWriter>);

ObjWriter::ObjWriter()
     : m_nCompMode(COMP_NONE), m_fUseB64(false), m_bConvToLink(false)
{
}

ObjWriter::~ObjWriter()
{
}

/** attach to and lock the target object */
void ObjWriter::attach(ObjectPtr pObj)
{
  // TO DO: lockout the pObj from other access
  m_pTarget = pObj;
}
    
/** detach from the target object */
ObjectPtr ObjWriter::detach()
{
  // TO DO: unlockout the pObj
  ObjectPtr rval = m_pTarget;
  m_pTarget = ObjectPtr();
  return rval;
}

void ObjWriter::write2(qlib::OutStream &outs)
{
  qlib::OutStream *pOut = &outs;
  qlib::OutStream *pB64O = NULL;
  qlib::OutStream *pZOut = NULL;

  qlib::OutStream *pTOut = pOut;
  
  if (getBase64Flag()) {
    pB64O = new qlib::Base64OutStream(*pOut);
    pTOut = pB64O;
  }
  
  int ncomp = getCompressMode();
  if (ncomp==COMP_NONE) {
  }
  else if (ncomp==COMP_GZIP) {
    pZOut = new qlib::GzipOutStream(*pTOut);
    pTOut = pZOut;
  }
#ifdef HAVE_LZMA_H
  else if (ncomp==COMP_XZIP) {
    pZOut = new qlib::XzOutStream(*pTOut);
    pTOut = pZOut;
  }
#endif
  else {
    MB_THROW(qlib::FileFormatException, "unsupported compression method");
    return;
  }

  if (!write(*pTOut)) {
    MB_THROW(qlib::FileFormatException, "write() returned false");
    return;
  }
  
  if (pZOut) {
    pZOut->close();
    delete pZOut;
  }

  if (pB64O) {
    pB64O->close();
    delete pB64O;
  }
  
  return;
}

void ObjWriter::write()
{
  qlib::OutStream *pOut = createOutStream();
  try {
    write2(*pOut);
  }
  catch (...) {
    delete pOut;
    throw;
  }

  pOut->close();
  delete pOut;
  
  if (m_bConvToLink) {
    MB_DPRINTLN("ObjWriter> convert to link...");

    m_pTarget->setSourceType(getName());
    m_pTarget->setSource(getPath());

    // save writer options
    qlib::LDom2Tree tree("ropts");
    
    // Set reader options from this writer
    //   Writer(options) --> LDOM2 tree
    tree.serialize(this, false);
    tree.dump();
    m_pTarget->setReaderOpts(tree.detach());
  }

  return;
}

int ObjWriter::getCompressMode() const
{
  return m_nCompMode;
}

void ObjWriter::setCompressMode(int n)
{
  m_nCompMode = n;
}

bool ObjWriter::getBase64Flag() const
{
  return m_fUseB64;
}

void ObjWriter::setBase64Flag(bool flag)
{
  m_fUseB64 = flag;
}

bool ObjWriter::isConvToLink() const
{
  return m_bConvToLink;
}

void ObjWriter::setConvToLink(bool b)
{
  m_bConvToLink = b;
}

