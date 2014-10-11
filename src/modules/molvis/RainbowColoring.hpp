// -*-Mode: C++;-*-
//
//  Rainbow coloring class
//

#ifndef RAINBOW_COLORING_HPP_INCLUDED
#define RAINBOW_COLORING_HPP_INCLUDED

#include "molvis.hpp"

#include <gfx/AbstractColor.hpp>
#include <modules/molstr/ColoringScheme.hpp>
#include <modules/molstr/Selection.hpp>

class RainbowColoring_wrap;

namespace molvis {

using namespace molstr;
using gfx::ColorPtr;

class RainbowColoring : public molstr::ColoringScheme
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  friend class ::RainbowColoring_wrap;

private:
  
  typedef molstr::ColoringScheme super_t;

  ////////////////////////
  // Properties

  double m_dStartHue;
  double m_dEndHue;

  double m_dSat, m_dBri;

  // bool m_bReverse;

  enum {
    RBC_MOL,
    RBC_CHAIN
  };

  int m_nMode;

  //////////////////////
  // Workarea

  bool m_bInit;

  typedef std::pair<LString, ResidIndex> key_tuple;
  typedef std::map<key_tuple, double> mapping_t;

  mapping_t m_map;

public:
  RainbowColoring();
  virtual ~RainbowColoring();

  //////////////////////////////////////////////////////
  // Coloring interface implementation

  /// Initialization (called at the start of rendering)
  virtual bool init(MolCoordPtr pMol, Renderer *pRend);
  
  virtual bool getAtomColor(MolAtomPtr pAtom, ColorPtr &color);
  virtual bool getResidColor(MolResiduePtr pResid, ColorPtr &color);

  //////////////////////////////////////////////////////
  // Getter/Setter
  int getMode() const { return m_nMode; }
  void setMode(int n) {
    if (m_nMode!=n) {
      m_nMode = n;
      m_bInit = false;
    }
  }

  double getStartHue() const { return m_dStartHue; }
  void setStartHue(double v) {
    if (!qlib::isNear4(v, m_dStartHue)) {
      m_dStartHue = v;
      m_bInit = false;
    }
  }

  double getEndHue() const { return m_dEndHue; }
  void setEndHue(double v) {
    if (!qlib::isNear4(v, m_dEndHue)) {
      m_dEndHue = v;
      m_bInit = false;
    }
  }

  //////////////////////////////////////////////////////
  // Serialization / deserialization impl for non-prop data

  // virtual void writeTo2(qlib::LDom2Node *pNode) const;
  // virtual void readFrom2(qlib::LDom2Node *pNode);

private:

  //void init(MolResiduePtr pResid);

};

} // namespace molvis

#endif // Rainbow_COLORING_H__

