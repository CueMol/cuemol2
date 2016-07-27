// -*-Mode: C++;-*-
//
//  Element symbols
//
//  $Id: ElemSym.hpp,v 1.2 2011/03/27 09:54:06 rishitani Exp $

#ifndef ELEM_SYM_HPP_
#define ELEM_SYM_HPP_

#include "molstr.hpp"

#include <qlib/LString.hpp>
#include <qlib/HashTable.hpp>
#include <qlib/HashTable.hpp>
#include <qlib/LTypes.hpp>

namespace molstr {

  using qlib::LString;

  /** element symbols */
  class MOLSTR_API ElemSym
  {
  public:

    static qlib::HashTable<int> *m_pStr2ID;
    static std::vector<LString> *m_pID2Str;

    static void init();
    static void fini();

    /** Convert element name to ID */
    static int str2SymID(const LString &str);

    /** Convert ID to element name string */
    static LString symID2Str(int id);

    enum {
      // Period 1
      H  =1,
      He =2,

      // Period 2
      Li =3,
      Be =4,
      B  =5,
      C  =6,
      N  =7,
      O  =8,
      F  =9,
      Ne =10,

      // Period 3
      Na =11,
      Mg =12,
      Al =13,
      Si =14,
      P  =15,
      S  =16,
      Cl =17,
      Ar =18,

      // Period 4
      K ,
      Ca,
      Sc,
      Ti,
      V ,
      Cr,
      Mn,
      Fe,
      Co,
      Ni,
      Cu,
      Zn,
      Ga,
      Ge,
      As,
      Se,
      Br,
      Kr,

      // Period 5
      Rb,
      Sr,
      Y ,
      Zr,
      Nb,
      Mo,
      Tc,
      Ru,
      Rh,
      Pd,
      Ag,
      Cd,
      In,
      Sn,
      Sb,
      Te,
      I ,
      Xe,

      // Period 6
      Cs,
      Ba,
      La,
      Ce,
      Pr,
      Nd,
      Pm,
      Sm,
      Eu,
      Gd,
      Tb,
      Dy,
      Ho,
      Er,
      Tm,
      Yb,
      Lu,
      Hf,
      Ta,
      W ,
      Re,
      Os,
      Ir,
      Pt,
      Au,
      Hg,
      Tl,
      Pb,
      Bi,
      Po,
      At,
      Rn,
      
      // Period 7
      Fr = 87,
      Ra =88,
      Ac =89,
      Th =90,
      Pa =91,
      U  =92,
      Np =93,
      Pu =94,
      XX =255,
      MAX=255
    };

  };

  typedef quint8 ElemID;

}


#endif // ELEM_SYM_H__
