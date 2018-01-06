
#ifndef XTAL_HKL_LIST_HPP_INCLUDED
#define XTAL_HKL_LIST_HPP_INCLUDED

#include "xtal.hpp"
#include <modules/symm/CrystalInfo.hpp>
#include "FFTUtil.hpp"
#include "StrFac.hpp"

namespace xtal {

  using symm::CrystalInfo;
  
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

