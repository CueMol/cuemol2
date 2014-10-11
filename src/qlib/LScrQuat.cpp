// -*-Mode: C++;-*-
//
// Scriptable quaternion class
//
// $Id: LScrQuat.cpp,v 1.4 2009/08/27 08:42:07 rishitani Exp $

#include <common.h>
#include "LScrQuat.hpp"
#include "Utils.hpp"

using namespace qlib;

LScrQuat::~LScrQuat()
{
}

bool LScrQuat::equals(const LScrQuat &arg) const
{
  return LQuat::equals(arg);
}

bool LScrQuat::isStrConv() const
{
  return true;
}

LString LScrQuat::toString() const
{
  return "("+ LString::fromReal(LQuat::Vx()) + "," +
    LString::fromReal(LQuat::Vy()) + "," +
      LString::fromReal(LQuat::Vz()) + "," +
        LString::fromReal(LQuat::a()) + ")";

  //return LString::format("(%.4f,%.4f,%.4f,%.4f)",
  //LQuat::Vx(), LQuat::Vy(), LQuat::Vz(), LQuat::a());
}

//static
LScrQuat *LScrQuat::fromStringS(const LString &src)
{
  Vector4D vec;
  if (!Vector4D::fromStringS(src, vec))
    return NULL;
  return MB_NEW LScrQuat(vec);
}

