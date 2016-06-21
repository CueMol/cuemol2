// -*-Mode: C++;-*-
//
// Helper functions for Matrix classes
//
// $Id: MatrixHelper.cpp,v 1.8 2011/04/09 12:17:09 rishitani Exp $

#include <common.h>
#include "Matrix3D.hpp"
#include "Matrix4D.hpp"
#include "LQuat.hpp"
#include "MatrixND.hpp"

using namespace qlib;

namespace {
  inline void diag_helper(double a_pp, double a_qq, double a_pq,
                          double &t, double &s, double &c)
  {
    if (isNear8(a_pq, 0.0)) {
      t = a_pq/(a_qq - a_pp);
    }
    else {
      double th = (a_qq - a_pp)/(2.0*a_pq);
      
      if (th>=0) {
        t = 1.0/(th + ::sqrt(th*th+1));
      }
      else {
        t = -1.0/(-th + ::sqrt(th*th+1));
      }
    }
    c = 1.0/::sqrt(t*t+1);
    s = c*t;
  }

  void diag_loop(Matrix3D &A, Matrix3D &evecs)
  {
    double t, s, c, tau;
    double A_a11, A_a12, A_a13, A_a21, A_a22, A_a23, A_a31, A_a32, A_a33;

    // Matrix3D A(*this);

    //
    // first component (p=1,q=2, r=3)
    //
    diag_helper(A.aij(1,1), A.aij(2,2), A.aij(1,2), t, s, c);
    Matrix3D J12;
    J12.aij(1,1) = c  ; J12.aij(1,2) = s  ;// J12.aij(1,3) = 0.0;
    J12.aij(2,1) =-s  ; J12.aij(2,2) = c  ;// J12.aij(2,3) = 0.0;
    // J12.aij(3,1) = 0.0; J12.aij(3,2) = 0.0; J12.aij(3,3) = 1.0;

    // update
    // A_a12 = 0.0;
    A_a11 = A.aij(1,1) - t*A.aij(1,2);
    A_a22 = A.aij(2,2) + t*A.aij(1,2);
    tau = s/(1.0+c);
    A_a31 = A.aij(3,1) - s*(A.aij(3,2) + tau*A.aij(3,1));
    A_a32 = A.aij(3,2) + s*(A.aij(3,1) - tau*A.aij(3,2));

    A.aij(2,1) = A.aij(1,2) = 0.0; //A_a12;
    A.aij(1,1) = A_a11;
    A.aij(2,2) = A_a22;
    A.aij(1,3) = A.aij(3,1) = A_a31;
    A.aij(2,3) = A.aij(3,2) = A_a32;

    //
    // second component (p=1,q=3, r=2)
    //
    diag_helper(A.aij(1,1), A.aij(3,3), A.aij(1,3), t, s, c);
    Matrix3D J13;
    J13.aij(1,1) = c  ; /*J13.aij(1,2) = 0.0;*/ J13.aij(1,3) = s;
    // J13.aij(2,1) = 0.0; J13.aij(2,2) = 1.0; J13.aij(2,3) = 0.0;
    J13.aij(3,1) =-s  ; /*J13.aij(3,2) = 0.0;*/ J13.aij(3,3) = c;

    // update
    // A_a13 = 0.0;
    A_a11 = A.aij(1,1) - t*A.aij(1,3);
    A_a33 = A.aij(3,3) + t*A.aij(1,3);
    tau = s/(1.0+c);
    A_a21 = A.aij(2,1) - s*(A.aij(2,3) + tau*A.aij(2,1));
    A_a23 = A.aij(2,3) + s*(A.aij(2,1) - tau*A.aij(2,3));

    A.aij(3,1) = A.aij(1,3) = 0.0; //A_a13;
    A.aij(1,1) = A_a11;
    A.aij(3,3) = A_a33;
    A.aij(1,2) = A.aij(2,1) = A_a21;
    A.aij(3,2) = A.aij(2,3) = A_a23;

    //
    // third component (p=2,q=3, r=1)
    //
    diag_helper(A.aij(2,2), A.aij(3,3), A.aij(2,3), t, s, c);
    Matrix3D J23;
    //J23.aij(1,1) = 1.0; J23.aij(1,2) = 0.0; J23.aij(1,3) = 0.0;
    /*J23.aij(2,1) = 0.0;*/ J23.aij(2,2) =  c ; J23.aij(2,3) = s;
    /*J23.aij(3,1) = 0.0;*/ J23.aij(3,2) = -s ; J23.aij(3,3) = c;

    // update
    // A_a23 = 0.0;
    A_a22 = A.aij(2,2) - t*A.aij(2,3);
    A_a33 = A.aij(3,3) + t*A.aij(2,3);
    tau = s/(1.0+c);
    A_a12 = A.aij(1,2) - s*(A.aij(1,3) + tau*A.aij(1,2));
    A_a13 = A.aij(1,3) + s*(A.aij(1,2) - tau*A.aij(1,3));

    A.aij(3,2) = A.aij(2,3) = 0.0; //A_a23;
    A.aij(2,2) = A_a22;
    A.aij(3,3) = A_a33;
    A.aij(2,1) = A.aij(1,2) = A_a12;
    A.aij(3,1) = A.aij(1,3) = A_a13;

    // evecs *= J12*J13*J23
    evecs.matprod(J12);
    evecs.matprod(J13);
    evecs.matprod(J23);

    //MB_DPRINTLN("%f %f %f", A.aij(1,1), A.aij(2,1), A.aij(3,1));
    //MB_DPRINTLN("%f %f %f", A.aij(1,2), A.aij(2,2), A.aij(3,2));
    //MB_DPRINTLN("%f %f %f", A.aij(1,3), A.aij(2,3), A.aij(3,3));
    //MB_DPRINTLN("");

    // A.arp = arp - s*(arq + tau*arp);
    // A.arq = arq - s*(arp + tau*arq);
  }
}

/** diagonalization by Jacobi method */
bool Matrix3D::diag(Matrix3D &evecs, Vector4D &evals) const
{
  int i;
  Matrix3D A(*this);

  evecs = Matrix3D();

  for (i=0; i<50; ++i) {
    // check the sum of off-diagonal components
    double offd =
      abs(A.aij(1,2))+abs(A.aij(1,3))+
        abs(A.aij(2,1))+abs(A.aij(2,3))+
          abs(A.aij(3,1))+abs(A.aij(3,2));
    if ( offd<=0.0 ) {
      break;
    }
    diag_loop(A, evecs);
  }

  if (i==50) {
    return false;
  }

//  MB_DPRINTLN("iter=%d", i);
  evals.x() = A.aij(1,1);
  evals.y() = A.aij(2,2);
  evals.z() = A.aij(3,3);

  return true;
  // A.arp = arp - s*(arq + tau*arp);
  // A.arq = arq - s*(arp + tau*arq);
}

//static
Matrix3D Matrix3D::makeRotMat(const Vector4D &e1,
                              const Vector4D &e2)
{
  const Vector4D e3 = e1.cross(e2);
  Matrix3D xfmat( 0, detail::no_init_tag() );
  
  xfmat.aij(1, 1) = e2.x();
  xfmat.aij(2, 1) = e2.y();
  xfmat.aij(3, 1) = e2.z();
  
  xfmat.aij(1, 2) = e3.x();
  xfmat.aij(2, 2) = e3.y();
  xfmat.aij(3, 2) = e3.z();
  
  xfmat.aij(1, 3) = e1.x();
  xfmat.aij(2, 3) = e1.y();
  xfmat.aij(3, 3) = e1.z();
  
  return xfmat;
}


///////////////////////////////////////////////////////////////

//static
Matrix4D Matrix4D::makeRotMat(const LQuat &q)
{
  return q.toRotMatrix();
}

//static
Matrix4D Matrix4D::makeRotMat(const Vector4D &axis, value_type theta)
{
  return makeRotMat(LQuat(axis, theta/2.0));
}

//static
Matrix4D Matrix4D::makeRotMat(const Vector4D &e1, const Vector4D &e2)
{
  const Vector4D e3 = e1.cross(e2);
  Matrix4D xfmat;
  
  xfmat.aij(1, 1) = e2.x();
  xfmat.aij(2, 1) = e2.y();
  xfmat.aij(3, 1) = e2.z();
  
  xfmat.aij(1, 2) = e3.x();
  xfmat.aij(2, 2) = e3.y();
  xfmat.aij(3, 2) = e3.z();
  
  xfmat.aij(1, 3) = e1.x();
  xfmat.aij(2, 3) = e1.y();
  xfmat.aij(3, 3) = e1.z();
  
  return xfmat;
}

//static
Matrix4D Matrix4D::makeRotTranMat(const Vector4D &e1, const Vector4D &e2, const Vector4D &tran)
{
  const Vector4D e3 = e1.cross(e2);
  Matrix4D xfmat( 0, detail::no_init_tag() );
  
  xfmat.aij(1, 1) = e2.x();
  xfmat.aij(2, 1) = e2.y();
  xfmat.aij(3, 1) = e2.z();
  xfmat.aij(4, 1) = 0.0;
  
  xfmat.aij(1, 2) = e3.x();
  xfmat.aij(2, 2) = e3.y();
  xfmat.aij(3, 2) = e3.z();
  xfmat.aij(4, 2) = 0.0;
  
  xfmat.aij(1, 3) = e1.x();
  xfmat.aij(2, 3) = e1.y();
  xfmat.aij(3, 3) = e1.z();
  xfmat.aij(4, 3) = 0.0;
  
  xfmat.aij(1, 4) = tran.x();
  xfmat.aij(2, 4) = tran.y();
  xfmat.aij(3, 4) = tran.z();
  xfmat.aij(4, 4) = 1.0;

  return xfmat;
}



#define SWAP_ROWS(a, b) { value_type *_tmp = a; (a)=(b); (b)=_tmp; }

/** get inverse matrix */
Matrix4D Matrix4D::invert() const
{
  value_type wtmp[4][8];
  value_type m0, m1, m2, m3, s;
  
  value_type *r0 = wtmp[0], *r1 = wtmp[1], *r2 = wtmp[2], *r3 = wtmp[3];

  r0[0] = aij(1,1);
  r0[1] = aij(1,2);
  r0[2] = aij(1,3);
  r0[3] = aij(1,4);
  r0[4] = 1.0;
  r0[5] = r0[6] = r0[7] = 0.0;

  r1[0] = aij(2,1); //MAT(m,1,0);
  r1[1] = aij(2,2); //MAT(m,1,1);
  r1[2] = aij(2,3); //MAT(m,1,2);
  r1[3] = aij(2,4); //MAT(m,1,3);
  r1[5] = 1.0;
  r1[4] = r1[6] = r1[7] = 0.0,

  r2[0] = aij(3,1); //MAT(m,2,0);
  r2[1] = aij(3,2); //MAT(m,2,1);
  r2[2] = aij(3,3); //MAT(m,2,2);
  r2[3] = aij(3,4); //MAT(m,2,3);
  r2[6] = 1.0;
  r2[4] = r2[5] = r2[7] = 0.0,

  r3[0] = aij(4,1); //MAT(m,3,0);
  r3[1] = aij(4,2); //MAT(m,3,1);
  r3[2] = aij(4,3); //MAT(m,3,2);
  r3[3] = aij(4,4); //MAT(m,3,3);
  r3[7] = 1.0;
  r3[4] = r3[5] = r3[6] = 0.0;

  // choose pivot
  if (qlib::abs(r3[0]) > qlib::abs(r2[0]))
    SWAP_ROWS(r3, r2);
  if (qlib::abs(r2[0]) > qlib::abs(r1[0]))
    SWAP_ROWS(r2, r1);
  if (qlib::abs(r1[0]) > qlib::abs(r0[0]))
    SWAP_ROWS(r1, r0);

  // check singularity
  if (0.0 == r0[0]) {
    MB_ASSERT(false);
    return Matrix4D();
  }

  // eliminate first variable
  m1 = r1[0]/r0[0]; m2 = r2[0]/r0[0]; m3 = r3[0]/r0[0];
  s = r0[1]; r1[1] -= m1 * s; r2[1] -= m2 * s; r3[1] -= m3 * s;
  s = r0[2]; r1[2] -= m1 * s; r2[2] -= m2 * s; r3[2] -= m3 * s;
  s = r0[3]; r1[3] -= m1 * s; r2[3] -= m2 * s; r3[3] -= m3 * s;
  s = r0[4];
  if (s != 0.0) { r1[4] -= m1 * s; r2[4] -= m2 * s; r3[4] -= m3 * s; }
  s = r0[5];
  if (s != 0.0) { r1[5] -= m1 * s; r2[5] -= m2 * s; r3[5] -= m3 * s; }
  s = r0[6];
  if (s != 0.0) { r1[6] -= m1 * s; r2[6] -= m2 * s; r3[6] -= m3 * s; }
  s = r0[7];
  if (s != 0.0) { r1[7] -= m1 * s; r2[7] -= m2 * s; r3[7] -= m3 * s; }

  // choose pivot
  if (qlib::abs(r3[1]) > qlib::abs(r2[1]))
    SWAP_ROWS(r3, r2);
  if (qlib::abs(r2[1]) > qlib::abs(r1[1]))
    SWAP_ROWS(r2, r1);

  // check singularity
  if (0.0 == r1[1]) {
    MB_ASSERT(false);
    return Matrix4D();
  }

  // eliminate second variable
  m2 = r2[1]/r1[1]; m3 = r3[1]/r1[1];
  r2[2] -= m2 * r1[2]; r3[2] -= m3 * r1[2];
  r2[3] -= m2 * r1[3]; r3[3] -= m3 * r1[3];
  s = r1[4]; if (0.0 != s) { r2[4] -= m2 * s; r3[4] -= m3 * s; }
  s = r1[5]; if (0.0 != s) { r2[5] -= m2 * s; r3[5] -= m3 * s; }
  s = r1[6]; if (0.0 != s) { r2[6] -= m2 * s; r3[6] -= m3 * s; }
  s = r1[7]; if (0.0 != s) { r2[7] -= m2 * s; r3[7] -= m3 * s; }

  // choose pivot
  if (qlib::abs(r3[2]) > qlib::abs(r2[2]))
    SWAP_ROWS(r3, r2);

  // check singularity
  if (0.0 == r2[2]) {
    MB_ASSERT(false);
    return Matrix4D();
  }

  // eliminate third variable
  m3 = r3[2]/r2[2];
  r3[3] -= m3 * r2[3], r3[4] -= m3 * r2[4],
  r3[5] -= m3 * r2[5], r3[6] -= m3 * r2[6],
  r3[7] -= m3 * r2[7];

  // check singularity
  if (0.0 == r3[3]) {
    MB_ASSERT(false);
    return Matrix4D();
  }

  // now back substitute row 3
  s = 1.0/r3[3];
  r3[4] *= s; r3[5] *= s; r3[6] *= s; r3[7] *= s;

  // now back substitute row 2
  m2 = r2[3];
  s  = 1.0/r2[2];
  r2[4] = s * (r2[4] - r3[4] * m2), r2[5] = s * (r2[5] - r3[5] * m2),
  r2[6] = s * (r2[6] - r3[6] * m2), r2[7] = s * (r2[7] - r3[7] * m2);
  m1 = r1[3];
  r1[4] -= r3[4] * m1, r1[5] -= r3[5] * m1,
  r1[6] -= r3[6] * m1, r1[7] -= r3[7] * m1;
  m0 = r0[3];
  r0[4] -= r3[4] * m0, r0[5] -= r3[5] * m0,
  r0[6] -= r3[6] * m0, r0[7] -= r3[7] * m0;

  // now back substitute row 1
  m1 = r1[2];
  s  = 1.0/r1[1];
  r1[4] = s * (r1[4] - r2[4] * m1), r1[5] = s * (r1[5] - r2[5] * m1),
  r1[6] = s * (r1[6] - r2[6] * m1), r1[7] = s * (r1[7] - r2[7] * m1);
  m0 = r0[2];
  r0[4] -= r2[4] * m0, r0[5] -= r2[5] * m0,
  r0[6] -= r2[6] * m0, r0[7] -= r2[7] * m0;

  // now back substitute row 0
  m0 = r0[1];
  s  = 1.0/r0[0];
  r0[4] = s * (r0[4] - r1[4] * m0), r0[5] = s * (r0[5] - r1[5] * m0),
  r0[6] = s * (r0[6] - r1[6] * m0), r0[7] = s * (r0[7] - r1[7] * m0);

  // write to output matrix
  Matrix4D out;
  out.aij(1,1) = r0[4];
  out.aij(1,2) = r0[5];
  out.aij(1,3) = r0[6];
  out.aij(1,4) = r0[7];
  out.aij(2,1) = r1[4];
  out.aij(2,2) = r1[5];
  out.aij(2,3) = r1[6];
  out.aij(2,4) = r1[7];
  out.aij(3,1) = r2[4];
  out.aij(3,2) = r2[5];
  out.aij(3,3) = r2[6];
  out.aij(3,4) = r2[7];
  out.aij(4,1) = r3[4];
  out.aij(4,2) = r3[5];
  out.aij(4,3) = r3[6];
  out.aij(4,4) = r3[7];

  return out;
}

//////////
// 3D matrix routine

// determinant
Matrix3D::value_type Matrix3D::deter() const
{
  return (aij(1,1)*aij(2,2)-aij(1,2)*aij(2,1))*aij(3,3) +
    (aij(2,1)*aij(3,2)-aij(2,2)*aij(3,1))*aij(1,3) +
      (aij(3,1)*aij(1,2)-aij(3,2)*aij(1,1))*aij(2,3);
}

Matrix3D Matrix3D::invert() const
{
  value_type D = deter();
  // TO DO: check the singularity !!
  Matrix3D r;
  
  r.aij(1,1) = (aij(2,2)*aij(3,3) - aij(2,3)*aij(3,2))/D;
  r.aij(1,2) = (aij(1,3)*aij(3,2) - aij(1,2)*aij(3,3))/D;
  r.aij(1,3) = (aij(1,2)*aij(2,3) - aij(1,3)*aij(2,2))/D;
  
  r.aij(2,1) = (aij(2,3)*aij(3,1) - aij(2,1)*aij(3,3))/D;
  r.aij(2,2) = (aij(1,1)*aij(3,3) - aij(1,3)*aij(3,1))/D;
  r.aij(2,3) = (aij(1,3)*aij(2,1) - aij(1,1)*aij(2,3))/D;
  
  r.aij(3,1) = (aij(2,1)*aij(3,2) - aij(2,2)*aij(3,1))/D;
  r.aij(3,2) = (aij(1,2)*aij(3,1) - aij(1,1)*aij(3,2))/D;
  r.aij(3,3) = (aij(1,1)*aij(2,2) - aij(1,2)*aij(2,1))/D;
  
  return r;
}

#if 0
bool transformRotMatToQuaternion(
  double &qx, double &qy, double &qz, double &qw,
  double m11, double m12, double m13,
  double m21, double m22, double m23,
  double m31, double m32, double m33
  ) {
  // search the maximum element
  double elem[ 4 ]; // 0:x, 1:y, 2:z, 3:w
  elem[ 0 ] = m11 - m22 - m33 + 1.0f;
  elem[ 1 ] = -m11 + m22 - m33 + 1.0f;
  elem[ 2 ] = -m11 - m22 + m33 + 1.0f;
  elem[ 3 ] = m11 + m22 + m33 + 1.0f;

  MB_DPRINTLN("elem0: %f", sqrt(elem[0]) * 0.5);
  MB_DPRINTLN("elem1: %f", sqrt(elem[1]) * 0.5);
  MB_DPRINTLN("elem2: %f", sqrt(elem[2]) * 0.5);
  MB_DPRINTLN("elem3: %f", sqrt(elem[3]) * 0.5);
  MB_DPRINTLN("acos: %f", qlib::toDegree( acos( sqrt(elem[3]) * 0.5 )));

  unsigned biggestIndex = 0;
  for ( int i = 1; i < 4; i++ ) {
    if ( elem[i] > elem[biggestIndex] )
      biggestIndex = i;
  }

  if ( elem[biggestIndex] < 0.0f )
    return false; // error in the argument matrix

  // calc maxumum lement
  double *q[4] = {&qx, &qy, &qz, &qw};
  double v = sqrt( elem[biggestIndex] ) * 0.5;
  *q[biggestIndex] = v;
  double mult = 0.25 / v;

  switch ( biggestIndex ) {
  case 0: // x
    *q[1] = (m12 + m21) * mult;
    *q[2] = (m31 + m13) * mult;
    *q[3] = (m23 - m32) * mult;
    break;
  case 1: // y
    *q[0] = (m12 + m21) * mult;
    *q[2] = (m23 + m32) * mult;
    *q[3] = (m31 - m13) * mult;
    break;
  case 2: // z
    *q[0] = (m31 + m13) * mult;
    *q[1] = (m23 + m32) * mult;
    *q[3] = (m12 - m21) * mult;
    break;
  case 3: // w
    *q[0] = (m23 - m32) * mult;
    *q[1] = (m31 - m13) * mult;
    *q[2] = (m12 - m21) * mult;
    break;
  }

  // RESULT: all elements are negated!! (reason should be solved...)
  return true;
}

#endif

Matrix3D Matrix3D::makeRotMat(const Vector4D &axis, double theta)
{
  return makeRotMat(axis, cos(theta), sin(theta));
}

Matrix3D Matrix3D::makeRotMat(const Vector4D &axis, double costh, double sinth)
{
  Matrix3D m;
  const double t = 1.0 - costh;

  m.aij(1,1) = t * axis.x() * axis.x() + costh;
  m.aij(1,2) = t * axis.y() * axis.x() + sinth * axis.z();
  m.aij(1,3) = t * axis.z() * axis.x() - sinth * axis.y();
  m.aij(2,1) = t * axis.x() * axis.y() - sinth * axis.z();
  m.aij(2,2) = t * axis.y() * axis.y() + costh;
  m.aij(2,3) = t * axis.z() * axis.y() + sinth * axis.x();
  m.aij(3,1) = t * axis.x() * axis.z() + sinth * axis.y();
  m.aij(3,2) = t * axis.y() * axis.z() - sinth * axis.x();
  m.aij(3,3) = t * axis.z() * axis.z() + costh;
  
  return m;
}

////////////////////////////////////////////////////////////
// LQuat implementation
//static
LQuat LQuat::makeFromRotMat(const Matrix3D &m)
{
  double s;
  double tr = m.aij(1,1) + m.aij(2,2) + m.aij(3,3) + 1.0;
  if (tr >= 1.0) {
    s = 0.5 / ::sqrt(tr);
    return LQuat(0.25 / s,
                 (m.aij(2,3) - m.aij(3,2)) * s,
                 (m.aij(3,1) - m.aij(1,3)) * s,
                 (m.aij(1,2) - m.aij(2,1)) * s);
  }
  else {
    double max;
    if(m.aij(2,2) > m.aij(3,3))
      max = m.aij(2,2);
    else
      max = m.aij(3,3);

    if (max < m.aij(1,1)) {
      s = ::sqrt(m.aij(1,1) - (m.aij(2,2) + m.aij(3,3)) + 1.0);
      double x = s * 0.5;
      s = 0.5 / s;
      return LQuat((m.aij(2,3) - m.aij(3,2)) * s,
                   x,
                   (m.aij(1,2) + m.aij(2,1)) * s,
                   (m.aij(3,1) + m.aij(1,3)) * s);

    }
    else if (max == m.aij(2,2)) {
      s = ::sqrt(m.aij(2,2) - (m.aij(3,3) + m.aij(1,1)) + 1.0);
      double y = s * 0.5;
      s = 0.5 / s;
      return LQuat((m.aij(3,1) - m.aij(1,3)) * s,
                   (m.aij(1,2) + m.aij(2,1)) * s,
                   y,
                   (m.aij(2,3) + m.aij(3,2)) * s);
    }
    else {
      s = ::sqrt(m.aij(3,3) - (m.aij(1,1) + m.aij(2,2)) + 1.0);
      double z = s * 0.5;
      s = 0.5 / s;
      return LQuat((m.aij(1,2) - m.aij(2,1)) * s,
                   (m.aij(3,1) + m.aij(1,3)) * s,
                   (m.aij(2,3) + m.aij(3,2)) * s,
                   z);
    }
  }
}

//static
LQuat LQuat::slerp(const LQuat &q, const LQuat &ar, const value_type t, bool bKeepPositive)
{
  LQuat p;
  LQuat r = ar;

  double qr;

  qr = q.m_data.dot( r.m_data );

  if (bKeepPositive) {
    if (qr<0.0) {
      r = -ar;
      qr = -qr; //q.m_data.dot( r.m_data );
    }
  }
  
  double ss = 1.0 - qr * qr;
  
  MB_DPRINTLN("qr=%f, ss=%f", qr, ss);
  if (qlib::isNear4(ss, 0.0)) {
    p = r;
  }
  else {
    double sp = ::sqrt(ss);
    double ph = ::acos(qr);
    double pt = ph * t;
    double t1 = ::sin(pt) / sp;
    double t0 = ::sin(ph - pt) / sp;
    
    p.m_data = q.m_data.scale(t0) + r.m_data.scale(t1);
  }

  return p;
}

