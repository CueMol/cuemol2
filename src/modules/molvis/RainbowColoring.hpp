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
#include <modules/molstr/ResidRangeSet.hpp>

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

  public:
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

    // mode of color boundary
  private:
    int m_nMode;

  public:
    enum {
      RBC_MOL,
      RBC_CHAIN
    };

    int getMode() const { return m_nMode; }

    void setMode(int n) {
      if (m_nMode!=n) {
	m_nMode = n;
	m_bInit = false;
      }
    }

    // mode of color hue increment (or decrement)
  private:
    int m_nIncrMode;
    
  public:
    static const int RBC_INCR_RESID = 0;
    static const int RBC_INCR_CHAIN = 1;
    static const int RBC_INCR_SSHELIX = 2;
    static const int RBC_INCR_SSSHEET = 3;
    static const int RBC_INCR_SSHELIXSHEET = 4;
    static const int RBC_INCR_PROTSS = 5;

    int getIncrMode() const { return m_nIncrMode; }

    void setIncrMode(int n) {
      if (m_nIncrMode!=n) {
        m_nIncrMode = n;
	m_bInit = false;
      }
    }

  private:
    //////////////////////
    // Workarea

    bool m_bInit;

    typedef std::pair<LString, ResidIndex> key_tuple;
    typedef std::map<key_tuple, double> mapping_t;

    mapping_t m_map;

    std::set<key_tuple> m_mkset;
    ResidRangeSet m_resset;

    MolCoordPtr m_pMol;
    
  public:
    RainbowColoring();
    virtual ~RainbowColoring();

    //////////////////////////////////////////////////////
    // Coloring interface implementation

    /// Initialization (called at the start of rendering)
    virtual bool start(MolCoordPtr pMol, Renderer *pRend);
  
    virtual bool getAtomColor(MolAtomPtr pAtom, ColorPtr &color);
    virtual bool getResidColor(MolResiduePtr pResid, ColorPtr &color);

    // virtual bool end();

    //////////////////////////////////////////////////////
    // Implementation

    //void makeMolMap(MolCoordPtr pMol);
    //void makeChainMap(MolChainPtr pCh);

    void makeMolMap2(MolCoordPtr pMol);
    void makeChainMap2(MolChainPtr pCh);

    void procRes_Chain(MolResiduePtr pRes, MolResiduePtr pPrevRes);
    void procRes_ProtSS(MolResiduePtr pRes);
    void mkInkPos_ProtSS();

    MolResiduePtr getCentRes(const LString &chname, ResidIndex ibeg, ResidIndex iend);

  };

} // namespace molvis

#endif
