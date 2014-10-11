//
// Interface for serializable objects
//
// $Id: LSerializable.hpp,v 1.4 2009/11/09 14:12:52 rishitani Exp $

#ifndef QLIB_LSERIALIZABLE_HPP_INCLUDED_
#define QLIB_LSERIALIZABLE_HPP_INCLUDED_

#include "qlib.hpp"

namespace qlib {

  class ObjOutStream;
  class ObjInStream;
  class LDom2Node;

  class QLIB_API LSerializable
  {
  public:
    virtual void writeTo2(LDom2Node *pNode) const {}
    virtual void readFrom2(LDom2Node *pNode) {}
  };

}

#endif

