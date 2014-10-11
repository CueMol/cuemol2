// -*-Mode: C++;-*-
//
//  CPK-style coloring class
//
//  $Id: CPKColoring.hpp,v 1.5 2009/11/07 09:47:26 rishitani Exp $

#ifndef CPK_COLORING_HPP_
#define CPK_COLORING_HPP_

#include "molstr.hpp"

#include <gfx/AbstractColor.hpp>
#include <qlib/mcutils.hpp>

#include "ElemSym.hpp"
#include "MolAtom.hpp"
#include "ColoringScheme.hpp"

//class DisplayCommand;

class CPKColoring_wrap;

namespace molstr {

  using gfx::ColorPtr;

  class MOLSTR_API CPKColoring : public ColoringScheme
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;
    
  private:

    friend class ::CPKColoring_wrap;

    /** atom colors */
    //MCINFO: LColor m_atomcol_C => col_C
    ColorPtr m_atomcol_C;

    //MCINFO: LColor m_atomcol_N => col_N
    ColorPtr m_atomcol_N;

    //MCINFO: LColor m_atomcol_O => col_O
    ColorPtr m_atomcol_O;

    //MCINFO: LColor m_atomcol_H => col_H
    ColorPtr m_atomcol_H;

    //MCINFO: LColor m_atomcol_S => col_S
    ColorPtr m_atomcol_S;

    //MCINFO: LColor m_atomcol_P => col_P
    ColorPtr m_atomcol_P;

    //MCINFO: LColor m_atomcol_X => col_others
    ColorPtr m_atomcol_X;

    /** coloring mode */
    //MCINFO: int m_nMode => colormode
    int m_nMode;

    /** properties in gradient-color mode */
    //MCINFO: LColor m_colLow => lowcol
    ColorPtr m_colLow;

    //MCINFO: LColor m_colHigh => highcol
    ColorPtr m_colHigh;

    //MCINFO: double m_parLow => lowpar
    double m_parLow;

    //MCINFO: double m_parHigh => highpar
    double m_parHigh;

    //MCINFO: persistent super classes: none

  public:
    enum {
      MOLREND_SIMPLE=0,
      MOLREND_BFAC=1,
      MOLREND_OCC=2
    };

    CPKColoring();
    CPKColoring(const CPKColoring &r);
    virtual ~CPKColoring();

    void setAtomColor(ElemID no, const gfx::ColorPtr &col);

    virtual bool getAtomColor(MolAtomPtr pAtom, gfx::ColorPtr &color);

    // virtual bool getResidColor(MolResiduePtr pResid, gfx::ColorPtr &color);

    //   void setUpAtomColor(MolAtom *pAtom, DisplayCommand *pdl);

  };

}

#endif
