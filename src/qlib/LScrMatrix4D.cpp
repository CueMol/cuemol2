// -*-Mode: C++;-*-
//
// Scriptable 4D-matrix class
//
// $Id: LScrMatrix4D.cpp,v 1.2 2009/08/27 08:42:07 rishitani Exp $

#include <common.h>
#include "LScrMatrix4D.hpp"
#include "Utils.hpp"

using namespace qlib;

LScrMatrix4D::~LScrMatrix4D()
{
}

bool LScrMatrix4D::equals(const LScrMatrix4D &arg)
{
  return Matrix4D::equals(arg);
}

bool LScrMatrix4D::isStrConv() const
{
  // TO DO: impl
  return false;
}

LString LScrMatrix4D::toString() const
{
  return Matrix4D::toString();
}


