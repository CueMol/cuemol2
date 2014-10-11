// -*-Mode: C++;-*-
//
// Helper functions for Vector classes
//
// $Id: VectorHelper.cpp,v 1.8 2010/12/04 10:31:09 rishitani Exp $

#include <common.h>
#include "Vector4D.hpp"
#include "Utils.hpp"
#include "LRegExpr.hpp"

#include "LExceptions.hpp"

#include "VectorND.hpp"

using namespace qlib;

//static
double Vector4D::torsion(const Vector4D &veci,
                         const Vector4D &vecj,
                         const Vector4D &veck,
                         const Vector4D &vecl)
{
/*
  VectorND<10, char> moge, hoe;
  moge = hoe + hoe;
  if (hoe.isZero())
    hoe = moge.scale(10);
  for (int i=1; i<=moge.dimension; ++i) {
    MB_DPRINTLN("hoe(%d) = %d", i, hoe.ai(i));
  }
*/

  Vector4D Vij = vecj-veci;
  Vector4D Vjk = veck-vecj;
  Vector4D Vkl = vecl-veck;

  //
  // check the norm of atom vectors and angles
  //

  // calc bond lengths for check
  double Rij = Vij.x()*Vij.x() + Vij.y()*Vij.y() + Vij.z()*Vij.z();
  double Rjk = Vjk.x()*Vjk.x() + Vjk.y()*Vjk.y() + Vjk.z()*Vjk.z();
  double Rkl = Vkl.x()*Vkl.x() + Vkl.y()*Vkl.y() + Vkl.z()*Vkl.z();

  if (qlib::isNear8(Rij,0.0)) {
    MB_THROW(qlib::RuntimeException, "torsion: arg1 and arg2 is too close");
    return 0.0;
  }
  if (qlib::isNear8(Rjk,0.0)) {
    MB_THROW(qlib::RuntimeException, "torsion: arg2 and arg3 is too close");
    return 0.0;
  }
  if (qlib::isNear8(Rkl,0.0)) {
    MB_THROW(qlib::RuntimeException, "torsion: arg3 and arg4 is too close");
    return 0.0;
  }

  Rij = 1.0/sqrt(Rij);
  Rjk = 1.0/sqrt(Rjk);
  Rkl = 1.0/sqrt(Rkl);
  double costh1 = (Vij.x()*Vjk.x()+Vij.y()*Vjk.y()+Vij.z()*Vjk.z())*Rij*Rjk;
  double costh2 = (Vjk.x()*Vkl.x()+Vjk.y()*Vkl.y()+Vjk.z()*Vkl.z())*Rjk*Rkl;

  if (qlib::isNear8(costh1,0.0)) {
    MB_THROW(qlib::RuntimeException, "torsion: arg1-arg2-arg3 is too near to linear");
    return 0.0;
  }

  if (qlib::isNear8(costh2,0.0)) {
    MB_THROW(qlib::RuntimeException, "torsion: arg2-arg3-arg4 is too near to linear");
    return 0.0;
  }

  //
  // calc cross products
  //

  double Ax = Vij.y()*Vjk.z() - Vij.z()*Vjk.y();
  double Ay = Vij.z()*Vjk.x() - Vij.x()*Vjk.z();
  double Az = Vij.x()*Vjk.y() - Vij.y()*Vjk.x();

  double Bx = Vjk.y()*Vkl.z() - Vjk.z()*Vkl.y();
  double By = Vjk.z()*Vkl.x() - Vjk.x()*Vkl.z();
  double Bz = Vjk.x()*Vkl.y() - Vjk.y()*Vkl.x();

  double Cx = Vjk.y()*Az - Vjk.z()*Ay;
  double Cy = Vjk.z()*Ax - Vjk.x()*Az;
  double Cz = Vjk.x()*Ay - Vjk.y()*Ax;

  // calc norm & normalize
  double RecA = 1.0/sqrt(Ax*Ax+Ay*Ay+Az*Az);
  double RecB = 1.0/sqrt(Bx*Bx+By*By+Bz*Bz);
  double RecC = 1.0/sqrt(Cx*Cx+Cy*Cy+Cz*Cz);
      
  Ax *= RecA; Ay *= RecA; Az *= RecA;
  Bx *= RecB; By *= RecB; Bz *= RecB;
  Cx *= RecC; Cy *= RecC; Cz *= RecC;

  double cosph = Ax*Bx + Ay*By + Az*Bz;
  double sinph = Cx*Bx + Cy*By + Cz*Bz;

  // calc phi 
  //  make sure cos(ph)=[-1.0,1.0] and get sign from sin(ph) )
  cosph = qlib::trunc(cosph, -1.0, 1.0);
  double phi = ::acos(cosph);
  phi = qlib::sign(phi, sinph);

  return phi;
}

LString Vector4D::toString() const
{
  LString sw = LString::fromReal(w());
  if (sw.equals("0")) {
    return "("+ LString::fromReal(x()) + "," +
      LString::fromReal(y()) + "," +
        LString::fromReal(z()) + ")";
  }
  else {
    return "("+ LString::fromReal(x()) + "," +
      LString::fromReal(y()) + "," +
        LString::fromReal(z()) + "," + sw + ")";
  }
    //return LString::format("(%.4f,%.4f,%.4f,%.4f)", x(), y(), z(), w());
}


//static
bool Vector4D::fromStringS(const LString &src, Vector4D &result)
{
  // TO DO: support integer number
  //LString floatnum("\\s*(([-+]?[0-9]*\\.[0-9]+)([eE][-+]?[0-9]+)?)\\s*");
  LString renum("\\s*(\\S+)\\s*");

  LString val;
  double d;
  {
    //LRegExpr re4("\\("+floatnum+","+floatnum+","+floatnum+","+floatnum+"\\)");
    //if (re4.match(src) && re4.getSubstrCount()>=4*3) {

    LRegExpr re4("\\("+renum+","+renum+","+renum+","+renum+"\\)");
    if (re4.match(src) && re4.getSubstrCount()>=(4+1)) {
      for (int i=0; i<4; ++i) {
        //val = re4.getSubstr(i*3+1);
        val = re4.getSubstr(i+1);
	if (!val.toDouble(&d))
	  return false;
	result.ai(i+1) = d;
      }
      return true;
    }
  }

  {
    //LRegExpr re3("\\("+floatnum+","+floatnum+","+floatnum+"\\)");
    //if (re3.match(src) && re3.getSubstrCount()>=3*3) {

    LRegExpr re3("\\("+renum+","+renum+","+renum+"\\)");
    if (re3.match(src) && re3.getSubstrCount()>=(3+1)) {
      for (int i=0; i<3; ++i) {
        //val = re3.getSubstr(i*3+1);
        val = re3.getSubstr(i+1);
	if (!val.toDouble(&d))
	  return false;
	result.ai(i+1) = d;
      }
      result.ai(4) = 0.0;
      return true;
    }
  }  

  // error
  MB_DPRINTLN("ERROR!! cannot convert string \"%s\" to vector", src.c_str());
  return false;
}

