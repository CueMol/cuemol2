// -*-Mode: C++;-*-
//
// Scriptable 4D-matrix class
//
// $Id: LScrMatrix4D.cpp,v 1.2 2009/08/27 08:42:07 rishitani Exp $

#include <common.h>
#include "LScrMatrix4D.hpp"
#include "Matrix3D.hpp"
#include "Utils.hpp"
#include "LRegExpr.hpp"

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
  return true;
}

LString LScrMatrix4D::toString() const
{
  if (isIdent()) {
    return LString("(identity)");
  }

  LString ret;

  ret += "(";
  for (int i=1; i<=Matrix4D::_N_ELEM; ++i) {
    ret += LString::format("%.7f", Matrix4D::ai(i));
    if (i<Matrix4D::_N_ELEM)
      ret += ",";
  }
  ret += ")";
  return ret;
}

//static
LScrMatrix4D *LScrMatrix4D::fromStringS(const LString &src)
{
  if (src.equalsIgnoreCase("(identity)"))
    return MB_NEW LScrMatrix4D();

  LString renum("\\s*(\\S+)\\s*");

  // remove parentheses
  LRegExpr re1("\\((.+)\\)");
  if (!re1.match(src) || re1.getSubstrCount()<1+1) {
    // ERROR!!
    LString msg = LString::format("cannot convert \"%s\" to matrix", src.c_str());
    MB_THROW(RuntimeException, msg);
    return NULL;
  }

  LString val = re1.getSubstr(1);
  std::list<LString> ls;
  val.split(',', ls);
  if (ls.size()!=16) {
    // ERROR!!
    LString msg = LString::format("cannot convert \"%s\" to matrix", src.c_str());
    MB_THROW(RuntimeException, msg);
    return NULL;
  }

  double d;
  int i=1;
  LScrMatrix4D *pRes = MB_NEW LScrMatrix4D();
  BOOST_FOREACH (LString e, ls) {
    if (!e.toDouble(&d)) {
      // ERROR!!
      delete pRes;
      LString msg = LString::format("cannot convert \"%s\" to matrix", src.c_str());
      MB_THROW(RuntimeException, msg);
      return NULL;
    }
    pRes->Matrix4D::ai(i) = d;
    ++i;
  }

  return pRes;
}


namespace {
  void swaprows(LScrMatrix4D &mat, int i, int j) {
    for (int k=1; k<=4; ++k) {
      double tmp = mat.aij(i, k);
      mat.aij(i, k) = mat.aij(j, k);
      mat.aij(j, k) = tmp;
    }
  }

  void swapcols(LScrMatrix4D &mat, int i, int j) {
    for (int k=1; k<=4; ++k) {
      double tmp = mat.aij(k, i);
      mat.aij(k, i) = mat.aij(k, j);
      mat.aij(k, j) = tmp;
    }
  }
}

LScrMatrix4D LScrMatrix4D::diag3() const
{
  Matrix3D mat;
  for (int i=1; i<=3; ++i)
    for (int j=1; j<=3; ++j)
      mat.aij(i,j) = aij(i,j);

  Matrix3D evecs;
  Vector4D evals;
  mat.diag(evecs, evals);

  LScrMatrix4D rval;
  for (int i=1; i<=3; ++i)
    for (int j=1; j<=3; ++j)
      rval.aij(i,j) = evecs.aij(i,j);

  rval.aij(4,1) = evals.x();
  rval.aij(4,2) = evals.y();
  rval.aij(4,3) = evals.z();

  if ( rval.aij(4,1)>rval.aij(4,2) )
    swapcols(rval, 1, 2);
  if ( rval.aij(4,1)>rval.aij(4,3) )
    swapcols(rval, 1, 3);
  if ( rval.aij(4,2)>rval.aij(4,3) )
    swapcols(rval, 2, 3);

  return rval;
}

