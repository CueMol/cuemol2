// -*-Mode: C++;-*-
//
//  Ball & Stick model renderer class
//

#ifndef BALL_STICK_RENDERER_HPP_INCLUDED
#define BALL_STICK_RENDERER_HPP_INCLUDED

#include "molvis.hpp"
#include <modules/molstr/MolAtomRenderer.hpp>

namespace molstr { class MolCoord; }

class BallStickRenderer_wrap;

namespace molvis {

using namespace molstr;
using gfx::DisplayContext;

class MOLVIS_API BallStickRenderer : public MolAtomRenderer
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  friend class ::BallStickRenderer_wrap;

  typedef MolAtomRenderer super_t;

private:
  /// Coloring scheme
  // ColoringSchemePtr m_pcoloring;

  double m_bondw;

  double m_sphr;

  int m_nDetail;

  double m_tickness;

  bool m_fRing;

  gfx::ColorPtr m_ringcol;

  /// default color
  // gfx::SolidColor m_defaultColor;

  //////////

  std::set<int> m_atoms;
  int m_nDetailOld;

public:
  BallStickRenderer();
  virtual ~BallStickRenderer();

    virtual const char *getTypeName() const;

  //////////////////////////////////////////////////////

  virtual void preRender(DisplayContext *pdc);
  virtual void postRender(DisplayContext *pdc);

  virtual bool isRendBond() const;
  virtual void beginRend(DisplayContext *pdl);
  virtual void endRend(DisplayContext *pdl);
  virtual void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded);
  virtual void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB);

  //////////////////////////////////////////////////////

  double getSphr() const { return m_sphr; }
  void setSphr(double s) { m_sphr = s; }

  double getBondw() const { return m_bondw; }
  void setBondw(double s) { m_bondw = s; }
  
  int getDetail() const { return m_nDetail; }
  void setDetail(int n) { m_nDetail = n; }

  bool isShowRing() const { return m_fRing; }
  void setShowRing(bool b) { m_fRing = b; }

  void setRingColor(const gfx::ColorPtr &col) { m_ringcol = col; }

  double getRingThick() const { return m_tickness; }
  void setRingThick(double s) { m_tickness = s; }

  //////////////////////////////////////////////////////

  virtual void propChanged(qlib::LPropEvent &ev);

private:
  void drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                         DisplayContext *pdl);

  void drawRings(DisplayContext *pdl);
  void drawRingImpl(const std::list<int> atoms, DisplayContext *pdl);

protected:
  void checkRing(int aid) {
    if (m_fRing)
      m_atoms.insert(aid);
  }
};

}

#endif
