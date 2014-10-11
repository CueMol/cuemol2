// -*-Mode: C++;-*-
//
// Scriptable vector class
//
// $Id: LScrVector4D.cpp,v 1.5 2010/12/04 10:31:09 rishitani Exp $

#include <common.h>
#include "LScrVector4D.hpp"

using namespace qlib;

LScrVector4D::~LScrVector4D()
{
}

bool LScrVector4D::isStrConv() const
{
  return true;
}

LString LScrVector4D::toString() const
{
  return Vector4D::toString();
  //return LString::format("(%.4f,%.4f,%.4f,%.4f)", x(), y(), z(), w());
}

//static
LScrVector4D *LScrVector4D::fromStringS(const LString &src)
{
  Vector4D vec;
  if (!Vector4D::fromStringS(src, vec))
    return NULL;
  return MB_NEW LScrVector4D(vec);
}

void LScrVector4D::setStrValue(const LString &val)
{
  Vector4D vec;
  if (!Vector4D::fromStringS(val, vec)) {
    LString msg = LString::format("Vector.setStrValue(): invalid argument %s", val.c_str());
    MB_THROW(qlib::RuntimeException, msg);
  }
  
  for (int i=1; i<=4; ++i)
    ai(i) = vec.ai(i);
}

