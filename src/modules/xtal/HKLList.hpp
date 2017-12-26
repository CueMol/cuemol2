
#ifndef XTAL_HKL_LIST_HPP_INCLUDED
#define XTAL_HKL_LIST_HPP_INCLUDED

#include "xtal.hpp"
#include <modules/symm/CrystalInfo.hpp>
#include "FFTUtil.hpp"

namespace xtal {

  using symm::CrystalInfo;
  
  struct StrFac
  {
  public:
    int ih;
    int ik;
    int il;
    float f_re;
    float f_im;

    StrFac(int ah, int ak, int al, float af_re, float af_im)
         : ih(ah), ik(ak), il(al), f_re(af_re), f_im(af_im)
    {
    }

    StrFac()
         : ih(0), ik(0), il(0), f_re(0.0f), f_im(0.0f)
    {
    }

    StrFac(const StrFac &a)
         : ih(a.ih), ik(a.ik), il(a.il), f_re(a.f_re), f_im(a.f_im)
    {
    }
  };

  class HKLList : public std::vector<StrFac>
  {
  public:
    typedef std::vector<StrFac> super_t;

    int m_nMaxH;
    int m_nMaxK;
    int m_nMaxL;

    int m_na, m_nb, m_nc;

    double m_mapr;
    double m_grid;

    CrystalInfo m_ci;

  public:
    HKLList() : super_t() {}
    HKLList(size_t n) : super_t(n) {}

    void calcMaxInd();

    static inline int MOD(int a, int b)
    {
      return a%b;
    }

    static int calcprime(int N, int base1, int base2, int prim);

    static const int ftprim = 5;

    void calcgrid();

    void checkMapResoln();

    void convToArray(CompArray &recip, float b_factor) const;

    void convToArrayHerm(CompArray &recip, float b_factor) const;
  };

}


#endif

