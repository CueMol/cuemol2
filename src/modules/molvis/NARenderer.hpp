// -*-Mode: C++;-*-
//
//  Nucleic acid renderer class
//
//  $Id: NARenderer.hpp,v 1.2 2009/12/17 06:11:27 rishitani Exp $

#ifndef MOLVIS_NUCLEIC_ACID_RENDERER_HPP
#define MOLVIS_NUCLEIC_ACID_RENDERER_HPP

#include "TubeRenderer.hpp"
#include "BallStickRenderer.hpp"

namespace molstr {
  class MolResidue;
}

//MC_DECL_SCRSP(BallStickRenderer);

namespace molvis {

// Nucleic acid renderer
class NARenderer : public TubeRenderer
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

private:

  typedef TubeRenderer super_t;

  //
  //  properties
  //
  
  /// width of base sticks
  double m_bondw;
  
  double m_bsthick;

  /// nucleic acid rendering type (enum)
  int m_nType;

  /// tube rendering on/off
  bool m_fRendTube;

  /// tesselation level of base tubes
  int m_nBaseDetail;

  /// base pair rendering on/off
  bool m_bShowBP;

public:
  /// nucleic acid rendering mode type ID
  static const int NAREND_BP = 0;
  static const int NAREND_SIMPLE1 = 1;
  static const int NAREND_DETAIL1 = 2;
  static const int NAREND_DETAIL2 = 3;

public:

  ////////////////////////////////////////////
  // property handling

  double getBaseSize() const { return m_bondw; }
  void setBaseSize(double f) {
    m_bondw = f;
    invalidateDisplayCache();
  }

  double getBaseThick() const { return m_bsthick; }
  void setBaseThick(double f) {
    m_bsthick = f;
    invalidateDisplayCache();
  }

  int getBaseType() const { return m_nType; }
  void setBaseType(int n) {
    m_nType = n;
    invalidateDisplayCache();
  }

  bool getRendTube() const { return m_fRendTube; }
  void setRendTube(bool n) {
    m_fRendTube = n;
    invalidateDisplayCache();
  }

  int getBaseDetail() const { return m_nBaseDetail; }
  void setBaseDetail(int n) {
    m_nBaseDetail = n;
    invalidateDisplayCache();
  }

  bool isShowBP() const { return m_bShowBP; }
  void setShowBP(bool n) {
    m_bShowBP = n;
    invalidateDisplayCache();
  }

private:
  ////////////////////////////////////////////
  //
  //  workarea
  //

  std::set<molstr::MolResidue *> *m_pBpTmp;

  BallStickRenderer *m_pBSRend;

  ////////////////////////////////////////////

public:
  NARenderer();
  virtual ~NARenderer();

  // virtual Renderer *create();

  virtual const char *getTypeName() const;

  //////////////////////////////////////////////////////

  virtual void beginRend(DisplayContext *pdl);
  virtual void endRend(DisplayContext *pdl);

  virtual void beginSegment(DisplayContext *pdl, MolResiduePtr pRes);
  virtual void rendResid(DisplayContext *pdl, MolResiduePtr pRes);
  virtual void endSegment(DisplayContext *pdl, MolResiduePtr pRes);

  //////////////////////////////////////////////////////

  virtual void attachObj(qlib::uid_t obj_uid);
  virtual qlib::uid_t detachObj();

private:
  void rendResidBasePair(DisplayContext *pdl, MolResiduePtr pRes);
  void rendResidSimple1(DisplayContext *pdl, MolResiduePtr pRes);
  void rendResidDetail1(DisplayContext *pdl, MolResiduePtr pRes);

  MolResiduePtr getBPPeerResid(MolResiduePtr pRes) const;
};

}

#endif
