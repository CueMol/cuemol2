// -*-Mode: C++;-*-
//
//  Coloring by bfactor or occupancy
//

#ifndef MOLSTR_BFAC_COLORING_HPP
#define MOLSTR_BFAC_COLORING_HPP

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/Vector4D.hpp>
#include <gfx/AbstractColor.hpp>

#include "MolAtom.hpp"
#include "ColoringScheme.hpp"

class BfacColoring_wrap;

namespace molstr {

  using gfx::ColorPtr;
  using qlib::Vector4D;

  class MOLSTR_API BfacColoring : public ColoringScheme
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;
    
  private:

    friend class ::BfacColoring_wrap;

    /// Coloring mode (b-factor/occupancy)
    //MCINFO: int m_nMode => colormode
    int m_nMode;

    /// Color for low param value
    //MCINFO: LColor m_colLow => lowcol
    ColorPtr m_colLow;

    /// Color for high param value
    //MCINFO: LColor m_colHigh => highcol
    ColorPtr m_colHigh;

    /// Automatic param value flag
    int m_nAuto;

    /// Low param value
    double m_parLow;

    /// High param value
    double m_parHigh;

    // Workarea for automatic param mode
    double m_parAutoLo, m_parAutoHi;

    Vector4D m_vCenter;
    
  public:
    enum {
      BFC_BFAC=1,
      BFC_OCC=2,
      BFC_CENTER=3,
    };

    enum {
      BFA_NONE=0,
      BFA_MOL=1,
      BFA_REND=2,
    };

    BfacColoring();
    BfacColoring(const BfacColoring &r);
    virtual ~BfacColoring();

    //virtual bool init(Renderer *pRend);
    virtual bool start(MolCoordPtr pMol, Renderer *pRend);
    virtual bool getAtomColor(MolAtomPtr pAtom, gfx::ColorPtr &color);

    bool isAutoMode() const {
      return m_nAuto!=BFA_NONE;
    }
  };

}

#endif
