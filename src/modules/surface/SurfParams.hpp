// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: SurfParams.hpp,v 1.1 2011/02/10 14:17:43 rishitani Exp $

#ifndef SURF_PARAMS_HPP_INCLUDED_
#define SURF_PARAMS_HPP_INCLUDED_

#include <qlib/Vector4D.hpp>
#include "MSAtom.hpp"

namespace surface {

  using qlib::Vector4D;

class TorusParam
{
public:
  int aidx_i, aidx_j;
  Vector4D a_i, a_j;
  double r_i, r_j, r_p;

  Vector4D Vij, Tij, Uij;
  double dijsq, dij, rij;

  double phi_s;
  double rc_i, rc_j;

public:
  TorusParam()
  {
  }

  TorusParam(int idx_i, int idx_j, double rpr, const MSAtomArray &data)
       : aidx_i(idx_i), aidx_j(idx_j),
         a_i(data[idx_i].pos), a_j(data[idx_j].pos),
         r_i(data[idx_i].rad), r_j(data[idx_j].rad), r_p(rpr)
  {
  }

  /*
  TorusParam(const TorusParam &r)
       : a_i(r.a_i), a_j(r.a_j),
         r_i(r.r_i), r_j(r.a_j), r_p(r.r_p),
         Vij(r.Vij), Tij(r.Tij), Uij(r.Uij),
         dijsq(r.dijsq), dij(r.dij), rij(r.rij)
    {
    }
   */

  void reinit(int idx_i, int idx_j, double rpr, const MSAtomArray &data)
  {
    aidx_i = idx_i;
    aidx_j = idx_j;
    a_i = data[idx_i].pos;
    a_j = data[idx_j].pos;
    r_i = data[idx_i].rad;
    r_j = data[idx_j].rad;
    r_p = rpr;
  }

  /**
    calculate the torus parameters using the two atoms (ai_i, ai_j)
   */
  bool calc()
  {
    Vij = a_j - a_i;
    dijsq = Vij.sqlen();
    dij = ::sqrt(dijsq);
    if (dij<F_EPS4)
      return false;

    Uij = Vij.scale(1.0/dij);

    const double rip = r_i + r_p;
    const double rjp = r_j + r_p;
    const double rat = (rip*rip-rjp*rjp)/dijsq;

    Tij = a_i + a_j + Vij.scale(rat);
    Tij *= 0.5;

    const double rirj2rp = r_i + r_j + 2.0*r_p;
    const double rirj = r_i - r_j;

    const double term1 = rirj2rp*rirj2rp - dijsq;
    if (term1<0.0)
      return false;
    const double term2 = dijsq - rirj*rirj;
    if (term2<0.0)
      return false;

    rij = 0.5 * ::sqrt(term1*term2) / dij;

    rc_i = rij*r_i/(r_i+r_p);
    rc_j = rij*r_j/(r_j+r_p);
    return true;
  }
};

////////////////////////////////////////////////////////

class ConcSphParam
{
public:
  int aidx_i, aidx_j, aidx_k;
  Vector4D a_i, a_j, a_k;
  double r_i, r_j, r_k;

  //private:
  // workarea
  double r_p;
  Vector4D Tij, Tik, Uij, Uik, Utb;

public:
  // three point parameters
  Vector4D Uijk, Bijk, Pijk_p, Pijk_m, Pijk;
  double sin_omg_ijk, h_ijk;

  // // plane parameters
  // Vector4D Nijp, Njkp, Nkip;

public:
  ConcSphParam() {}

  void init(const TorusParam &tprm_ij,
            const TorusParam &tprm_ik)
  {
    aidx_i = tprm_ij.aidx_i;
    aidx_j = tprm_ij.aidx_j;
    aidx_k = tprm_ik.aidx_j;

    a_i = tprm_ij.a_i;
    a_j = tprm_ij.a_j;
    a_k = tprm_ik.a_j;

    r_i = tprm_ij.r_i;
    r_j = tprm_ij.r_j;
    r_k = tprm_ik.r_j;

    r_p = tprm_ij.r_p;

    Tij = tprm_ij.Tij;
    Tik = tprm_ik.Tij;

    Uij = tprm_ij.Uij;
    Uik = tprm_ik.Uij;
  }

  void init_ij(const TorusParam &tprm_ij)
  {
    aidx_i = tprm_ij.aidx_i;
    aidx_j = tprm_ij.aidx_j;

    a_i = tprm_ij.a_i;
    a_j = tprm_ij.a_j;

    r_i = tprm_ij.r_i;
    r_j = tprm_ij.r_j;

    r_p = tprm_ij.r_p;

    Tij = tprm_ij.Tij;

    Uij = tprm_ij.Uij;
  }

  void reinit_ik(const TorusParam &tprm_ik)
  {
    aidx_k = tprm_ik.aidx_j;
    a_k = tprm_ik.a_j;
    r_k = tprm_ik.r_j;

    Tik = tprm_ik.Tij;
    Uik = tprm_ik.Uij;
  }

  bool calc()
  {
    Vector4D XU_ijk = Uij.cross(Uik);
    sin_omg_ijk = XU_ijk.length();
    if (sin_omg_ijk<=F_EPS4)
      return false;
    Uijk = XU_ijk.scale(1.0/sin_omg_ijk);

    // omg_ijk = ::acos(Uij.dot(Uik));
    Utb = Uijk.cross(Uij);
    Bijk = Tij + Utb.scale(Uik.dot(Tik-Tij)/sin_omg_ijk);

    const double rip = r_i + r_p;
    const double hijksq = rip*rip - (Bijk - a_i).sqlen();
    if (hijksq<=0.0)
      return false;

    h_ijk = ::sqrt(hijksq);
    Pijk_p = Bijk + Uijk.scale(h_ijk);
    Pijk_m = Bijk - Uijk.scale(h_ijk);

    return true;
  }

  void invert()
  {
    Uijk = -Uijk;

    int tmp = aidx_i;
    aidx_i = aidx_j;
    aidx_j = tmp;

    Vector4D vtmp = a_i;
    a_i = a_j;
    a_j = vtmp;

    double dtmp = r_i;
    r_i = r_j;
    r_j = dtmp;

  }

};

}

#endif // SURF_PARAMS_HPP_INCLUDED_

