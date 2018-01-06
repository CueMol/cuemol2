
#ifndef XTAL_STR_FAC_HPP_INCLUDED
#define XTAL_STR_FAC_HPP_INCLUDED

namespace xtal {

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

}

#endif

