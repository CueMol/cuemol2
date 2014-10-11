// -*-Mode: C++;-*-
//
//  Ball & Stick model with ORTEP-like anisou display
//

#ifndef ANISO_U_RENDERER_H__
#define ANISO_U_RENDERER_H__

#include "molvis.hpp"
#include "BallStickRenderer.hpp"

namespace molstr { class MolCoord; }

class AnIsoURenderer_wrap;

namespace molvis {

using gfx::DisplayContext;
using molstr::MolAtomPtr;

class MOLVIS_API AnIsoURenderer : public BallStickRenderer
{
  friend class ::AnIsoURenderer_wrap;

  MC_SCRIPTABLE;
  MC_CLONEABLE;

  //////////////
  // Properties

  bool m_fDrawDisc;

  double m_dDiscScale;
  
  double m_dDiscThick;

  ///////

  typedef BallStickRenderer super_t;

  /** sphere sin/cos table */
  std::valarray<double> *m_pSphrTab;

public:

  AnIsoURenderer();
  virtual ~AnIsoURenderer();

  virtual const char *getTypeName() const;

  //////////////////////////////////////////////////////

  virtual void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded);

  //////////////////////////////////////////////////////

  virtual void propChanged(qlib::LPropEvent &ev);

private:
  double sphrcos(int j) const { return (*m_pSphrTab)[j*2]; }
  double sphrsin(int j) const { return (*m_pSphrTab)[j*2+1]; }

  void buildSphrTab();
  void drawQsphere(DisplayContext *pdl,
                   bool bSphere=true,
                   bool bCap=true,
                   double fCapDir=-1.0);
  void drawSphere(DisplayContext *pdl);
  void drawDisc(DisplayContext *pdl, double norm);
};

}

#endif


