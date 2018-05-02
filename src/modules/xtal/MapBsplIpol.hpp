// -*-Mode: C++;-*-
//
// Map 3rd order B-spline interpolator
//
// $Id$

#ifndef XTAL_MAP_BSPL_IPOL_HPP_INCLUDED
#define XTAL_MAP_BSPL_IPOL_HPP_INCLUDED

#include "xtal.hpp"

#include <qlib/Array.hpp>
#include <qlib/Matrix3T.hpp>

namespace xtal {

  using qlib::FloatArray;
  using qlib::Matrix3F;

  class MapBsplIpol
  {
  //private:
  public:
    FloatArray *m_pBsplCoeff;

  public:
    MapBsplIpol()
         : m_pBsplCoeff(NULL)
    {
    }
    
    ~MapBsplIpol()
    {
      if (m_pBsplCoeff!=NULL)
        delete m_pBsplCoeff;
    }
    

    float calcAt(const Vector3F &pos) const;

    Vector3F calcDiffAt(const Vector3F &pos, float *rval=NULL) const;

    /// for debugging
    Vector3F calcDscDiffAt(const Vector3F &pos) const;

    void calcCurvAt(const Vector3F &pos,
                    Matrix3F *pcurv,
                    Vector3F *pgrad,
                    float *rval) const;

    /// for debugging
    Matrix3F calcDscCurvAt(const Vector3F &pos) const;


    std::complex<float> calc_cm2(int i, int N);

    void calcCoeffs(DensityMap *pXtal);
  };

  class MapCrossValSolver
  {
  public:
    
    float m_isolev;
    
    float m_eps;

    MapBsplIpol *m_pipol;

  public:
    MapCrossValSolver()
         : m_pipol(NULL)
    {
    }
    
    inline bool isNear(float f0, float f1) const
    {
      float del = qlib::abs(f0-f1);
      if (del<m_eps)
        return true;
      else
        return false;
    }

    bool getXValFNrImpl1(const Vector3F &vec0, const Vector3F &dv, float rho, float &rval) const
    {
      float frho, dfrho;
      Vector3F vrho, dvrho;
      int i, j;

      bool bConv = false;
      for (i=0; i<10; ++i) {
        vrho = vec0 + dv.scale(rho);
        frho = m_pipol->calcAt(vrho)-m_isolev;
        if (isNear(frho, 0.0f)) {
          bConv = true;
          break;
        }

        // dvrho = m_pipol->calcDscDiff(vrho);
        dvrho = m_pipol->calcDiffAt(vrho);

        dfrho = dv.dot( dvrho );

        rho += -frho/dfrho;

        if (rho<0.0f || 1.0f <rho) {
          return false;
        }
      }

      rval = rho;
      return true;
    }

    bool solve(float val0, const Vector3F &vec0, float val1, const Vector3F &vec1, Vector3F &rval) const
    {
      // init estim. by lin. intpol
      Vector3F dv = (vec1 - vec0);

      float rho0 = (m_isolev-val0)/(val1-val0);
      float rho_sol;

      float rho = rho0;
      float rhoL = 0.0f;
      float rhoU = 1.0f;

      float fL = val0-m_isolev;
      float fU = val1-m_isolev;

      for (int i=0; i<10; ++i) {
        if (getXValFNrImpl1(vec0, dv, rho, rho_sol)) {
          rval = vec0 + dv.scale(rho_sol);
          return true;
        }

        // Newton method failed --> bracket the solution by Bisec/FP method
        float frho0 = m_pipol->calcAt(vec0 + dv.scale(rho)) - m_isolev;

        // select the upper/lower bounds
        if (frho0*fU<0.0) {
          // find between mid & rhoU
          rhoL = rho;
          fL = frho0;
        }
        else if (frho0*fL<0.0) {
          // find between rhoL & mid
          rhoU = rho;
          fU = frho0;
          //fU = m_pipol->calcAt(vec0 + dv.scale(rhoU)) - m_isolev;
        }
        else {
          MB_DPRINTLN("getXValFNr> inconsistent fL/fU");
          break;
        }

        // Update the solution estimate
        // Bisection
        rho = (rhoL + rhoU)*0.5;
        // FP
        //rho = (rhoL*fU - rhoU*fL)/(fU-fL);
      }
      
      {
        MB_DPRINTLN("getXValFNr failed, rho=%f", rho);
        for (int i=0; i<=100; i++) {
          rho = float(i)/100.0f;
          Vector3F vrho = vec0 + dv.scale(rho);
          float frho = m_pipol->calcAt(vrho) - m_isolev;
          MB_DPRINTLN("%d %f %f", i, rho, frho);
        }
        return false;
      }
    }

  };

}

#endif


