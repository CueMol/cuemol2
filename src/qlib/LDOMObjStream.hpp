// -*-Mode: C++;-*-
//
// Superclass of object-serialization streams
//
// $Id: LDOMObjStream.hpp,v 1.5 2009/07/11 11:01:16 rishitani Exp $
//

#ifndef LDOM_OBJ_STREAM_HPP_INCLUDE_
#define LDOM_OBJ_STREAM_HPP_INCLUDE_

#include "qlib.hpp"
#include "ObjStream.hpp"
#include "LDOMTree.hpp"

namespace qlib {

using qlib::detail::LDomNode;

/**
  Serialize object to LDOM Tree
  This class is only aware of the properties.
 */
class QLIB_API LDOMObjOutStream : public ObjOutStream
{
protected:
  LDomTree m_data;

public:
  typedef ObjOutStream super_t;
  
public:
  LDOMObjOutStream() : super_t() {}
  
  LDOMObjOutStream(OutStream &out) : super_t(out) {}
  
  virtual ~LDOMObjOutStream();
  
  virtual void writeTop(LSerializable *pTopObj);
  virtual void writeProp(const LString &name, const LVariant &value);
  virtual void writePropObject(const LString &name, const LScriptable *pScr);
  virtual void writeListElem(const LVariant &value);
  virtual void writeListElemObject(const LScriptable *pScr);

  virtual void startList(const LString &name);
  virtual void endList();

  // close must flush the LDOM tree to the underlying stream
  // virtual void close();

  //
  // utility routines
  //
  
public:
  static LString getTypeName(const LScriptable *pScr);

protected:
  void writeObject(const LScriptable *pScr);

  void writeStr(const LString &str) {
    int nlen = str.length();
    super_t::write(str.c_str(), 0, nlen);
  }
  void writeStr(const char *str) {
    int nlen = ::strlen(str);
    super_t::write(str, 0, nlen);
  }

  void writeVariant(const LVariant &value);
  
};

////////////////////////////////////////////////

class QLIB_API LDOMObjInStream : public ObjInStream
{
protected:
  LDomTree m_data;
  LDomNode *m_pCurNode;

  NodeList::const_iterator m_nodeiter;

public:
  typedef ObjInStream super_t;
  
public:
  LDOMObjInStream() : super_t(), m_pCurNode(NULL) {}
  
  LDOMObjInStream(InStream &in) : super_t(in), m_pCurNode(NULL) {}
  
  virtual ~LDOMObjInStream();

  virtual void firstChild();
  virtual bool hasMoreChild();
  virtual void nextChild();
  virtual LString getChildID();
  virtual void readChildData(LVariant &value);
  virtual LSerializable *readChildObj();

  virtual bool startList(const LString &name);
  virtual void endList();

  virtual void reportError();

protected:
  /** Instantiate new object based on theLDOM typename record */
  LSerializable *readObjImpl();
  
};

}

#endif

