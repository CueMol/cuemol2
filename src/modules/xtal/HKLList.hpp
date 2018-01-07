
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
    /// Default ctor
    HKLList() : super_t() {}

    HKLList(size_t n) : super_t(n) {}

    /// Copy ctor
    HKLList(const HKLList& arg)
         : super_t(arg),
           m_nMaxH(arg.m_nMaxH), m_nMaxK(arg.m_nMaxK), m_nMaxL(arg.m_nMaxL),
           m_na(arg.m_na), m_nb(arg.m_nb), m_nc(arg.m_nc), 
           m_mapr(arg.m_mapr), m_grid(arg.m_grid), m_ci(arg.m_ci)
      {}
    
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

