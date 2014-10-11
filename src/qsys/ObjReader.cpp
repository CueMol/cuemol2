// -*-Mode: C++;-*-
//
// object reader
//
// $Id: ObjReader.cpp,v 1.6 2011/01/03 16:47:05 rishitani Exp $

#include <common.h>

#include "ObjReader.hpp"
#include <qlib/FileStream.hpp>
#include <qlib/GzipStream.hpp>
#include <qlib/Base64Stream.hpp>
// #include <qlib/ClassRegistry.hpp>
// #include <qlib/LClassUtils.hpp>

#include <qlib/LDOM2Tree.hpp>

using namespace qsys;

// MC_SCRIPTABLE_EMPTY_IMPL(ObjReader);
// MC_DYNCLASS_IMPL(ObjReader, ObjReader, qlib::LSpecificClass<ObjReader>);

ObjReader::ObjReader()
     : m_nCompMode(COMP_NONE), m_fUseBase64(false)
{
}

ObjReader::~ObjReader()
{
}

/// Attach to and lock the target object
void ObjReader::attach(ObjectPtr pObj)
{
  m_pTarget = pObj;
  m_pTarget->readerAttached();
}
    
/// Detach from the target object
ObjectPtr ObjReader::detach()
{
  ObjectPtr pret = m_pTarget;
  m_pTarget = ObjectPtr();
  pret->readerDetached();
  return pret;
}

ObjectPtr ObjReader::load(qlib::InStream &ins)
{
  ObjectPtr robj = createDefaultObj();
  attach(robj);

  bool res;
  if (getCompressMode()==COMP_GZIP) {
    qlib::GzipInStream gzins(ins);
    res = read(gzins);
  }
  else {
    res = read(ins);
  }

  if (!res)
    return ObjectPtr();

  return detach();
}

void ObjReader::read2(qlib::InStream &ins)
{
  qlib::InStream *pIn = &ins;
  qlib::InStream *pTIn = pIn;
  qlib::InStream *pB64In = NULL;
  qlib::InStream *pZIn = NULL;

  if (getBase64Flag()) {
    pB64In = new qlib::Base64InStream(*pTIn);
    pTIn = pB64In;
  }
  
  if (getCompressMode()==COMP_NONE) {
  }
  else if (getCompressMode()==COMP_GZIP) {
    pZIn = new qlib::GzipInStream(*pTIn);
    pTIn = pZIn;
  }
  else {
    MB_THROW(qlib::FileFormatException, "unsupported compression method");
    return;
  }

  if (!read(*pTIn)) {
    MB_THROW(qlib::FileFormatException, "read() returned false");
    return;
  }

  if (pZIn) {
    pZIn->close();
    delete pZIn;
  }

  if (pB64In) {
    pB64In->close();
    delete pB64In;
  }
  
}

void ObjReader::read()
{
  qlib::InStream *pIn = createInStream();

  try {
    read2(*pIn);
  }
  catch (...) {
    delete pIn;
    throw;
  }

  pIn->close();
  delete pIn;
  
  m_pTarget->setSourceType(getName());
  m_pTarget->setSource(getPath());

  // save reader options
  qlib::LDom2Tree tree("ropts");
  
  // Set reader options from this reader
  //   Reader(options) --> LDOM2 tree
  tree.serialize(this, false);
  tree.dump();
  m_pTarget->setReaderOpts(tree.detach());

  return;
}

int ObjReader::getCompressMode() const
{
  return m_nCompMode;
}

void ObjReader::setCompressMode(int n)
{
  m_nCompMode = n;
}

bool ObjReader::getBase64Flag() const
{
  return m_fUseBase64;
}

void ObjReader::setBase64Flag(bool flag)
{
  m_fUseBase64 = flag;
}

