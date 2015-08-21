// -*-Mode: C++;-*-
//
//  Ribbon type2 representation (test)
//

#ifndef RIBBON2_RENDERER_HPP_INCLUDED
#define RIBBON2_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <modules/molstr/MainChainRenderer.hpp>
//#include "CubicSpline.hpp"
#include "smospl/SmoothSpline.hpp"
#include "TubeSection.hpp"
#include "JctTable.hpp"

class Ribbon2Renderer_wrap;

namespace molvis {

using qlib::Vector4D;
using gfx::ColorPtr;
using namespace molstr;

  class TubeSection;
  class Ribbon2Renderer;

  namespace detail {

    struct SecSplDat
    {
      SmoothSpline m_spl;
      int m_nStartId;
      int m_nRealSize;

      // coil data
      Vector4D m_vStartD1;
      Vector4D m_vEndD1;
      bool m_bFixStart, m_bFixEnd;

      // cylinder data
      SmoothSpline1D m_wspl;
      double m_dWidthAver;

      // sheet data
      Vector4D m_bnorm_ave;
      SmoothSpline m_bnspl;
      bool m_bBnormSpl;
      
      std::deque<Vector4D> m_posvec;
      std::deque<MolResidue *> m_resvec;

      bool m_bStartExtend;
      bool m_bEndExtend;

      int m_nResDelta;

      void addPoint(const Vector4D &pos, double wgt=0.0)
      {
        m_posvec.push_back(pos);
        m_posvec.back().w() = wgt;
        m_resvec.push_back(NULL);
      }

      void addPoint(MainChainRenderer *pthat, MolResiduePtr pRes, double wgt=0.0)
      {
        Vector4D pos = pthat->getPivotPos(pRes);
        m_posvec.push_back(pos);
        m_posvec.back().w() = wgt;
        m_resvec.push_back(pRes.get());
      }

      void setStart()
      {
        int nleft = m_posvec.size();
        m_nStartId = -nleft;
      }

      void setEnd()
      {
        int nleft = m_posvec.size();
        m_nRealSize = nleft + m_nStartId;
      }

      bool generate();
      bool generateHelix(double wrho);
      bool generateSheet();
      bool generateCoil();

      Vector4D calcBinormVec(int i);
      bool calcProtBinormVec(int nres, Vector4D &res);

      Vector4D getBnormVec(double t);
      Vector4D getCoilBnormVec(double t);
      

      Ribbon2Renderer *m_pParent;

      SecSplDat(Ribbon2Renderer *pP);
    };

  }

class Ribbon2Renderer : public MainChainRenderer
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  friend class ::Ribbon2Renderer_wrap;

private:

  typedef MainChainRenderer super_t;

  //////////////////////////////////////////////////////
  // Properties

  /// Section data for coil
  TubeSectionPtr m_ptsCoil;

  /// Section data for cylinder helix
  TubeSectionPtr m_ptsHelix;

  /// Section data for sheet
  TubeSectionPtr m_ptsSheet;

  /// Sheet junction (arrow head)
  JctTablePtr m_pSheetHead;

  /// Section data for ribbon helix
  TubeSectionPtr m_ptsRibHelix;

  /// Coil-Helix junction (used in ribbonhelix mode)
  JctTablePtr m_pRibHelixTail;

  /// Helix-Coil junction (used in ribbonhelix mode)
  JctTablePtr m_pRibHelixHead;

  /// Num of interporation point to the axial direction (axialdetail)
  int m_nAxialDetail;

  /// interpolate color or not
  bool m_bInterpColor;

  // anchor params (coil/sheet)
  SelectionPtr m_pAnchorSel;  
  double m_dAnchorWgt;

  // helix props
  double m_dHelixSmo;

  double m_dAxExt;
  double m_dWidthPlus;
  double m_dWidthRho;

private:
  enum {
    HWIDTH_CONST = 0,
    HWIDTH_AVER = 1,
    HWIDTH_WAVY = 2
  };
  int m_nHelixWidthMode;

public:
  int getHelixWidthMode() const {return m_nHelixWidthMode;}
  void setHelixWidthMode(int n) {m_nHelixWidthMode = n;}

public:
  // compatibility for helix_waver prop
  bool isWidthAver() const {
    if (m_nHelixWidthMode==HWIDTH_AVER) return true;
    else return false;
  }
  void setWidthAver(bool b) {
    m_nHelixWidthMode = HWIDTH_AVER;
  }

private:
  /// Helix width (const width mode)
  double m_dHelixWidth;

  // sheet props
  double m_dSheetSmo;
  double m_dSheetWsmo;

  // coil props
  double m_dCoilSmo;

private:

  ////////////////////////////////////////////////
  // workarea

  std::deque<MolResiduePtr> m_resvec;
  std::vector<int> m_indvec;

  std::deque<detail::SecSplDat*> m_cylinders;
  std::deque<detail::SecSplDat*> m_sheets;
  std::deque<detail::SecSplDat*> m_coils;

  /// Dump curvature info of axial spline func
  bool m_bDumpCurv;

  typedef std::map<MolResidue *, std::pair<Vector4D,Vector4D> > DiffVecMap;

  /// differential vectors for getDiffVec impl
  DiffVecMap m_diffvecs;

  ////////////////////////////////////////////////

public:
  Ribbon2Renderer();
  virtual ~Ribbon2Renderer();

  virtual const char *getTypeName() const;

  virtual void beginRend(DisplayContext *pdl);
  virtual void endRend(DisplayContext *pdl);

  virtual void beginSegment(DisplayContext *pdl, MolResiduePtr pRes);
  virtual void rendResid(DisplayContext *pdl, MolResiduePtr pRes);
  virtual void endSegment(DisplayContext *pdl, MolResiduePtr pRes);

private:
  //////////////////////////////////////////////////////

  void buildHelixData();
  void clearHelixData();
  void renderHelix(DisplayContext *pdl);

  void buildSheetData();
  void clearSheetData();
  void renderSheet(DisplayContext *pdl, detail::SecSplDat *pSh);

  void buildCoilData();
  void clearCoilData();
  void renderCoil(DisplayContext *pdl, detail::SecSplDat *pSh);
  void renderHelixCoil(DisplayContext *pdl, detail::SecSplDat *pSh);

  void getCoilResids(double at, detail::SecSplDat *pCyl,
                     MolResiduePtr &pResPrev,
                     MolResiduePtr &pResNext,
                     double &resrho);

  gfx::ColorPtr calcCoilColor(double at, detail::SecSplDat *pCyl);


  /// Sheet to Coil junction
  void extendSheetCoil(detail::SecSplDat *pSh, int nPrevInd);

  /// Coil to Sheet junction
  void extendCoilSheet(detail::SecSplDat *pSh, int nNextInd);

public:
  //////////////////////////////////////////////////////
  // event handling

  virtual void propChanged(qlib::LPropEvent &ev);

  virtual void objectChanged(qsys::ObjectEvent &ev);

  //////////////////////////////////////////////////////

  virtual void setAxialDetail(int nlev);

  int getAxialDetail() const { return m_nAxialDetail; }

  void setSmoothColor(bool b) {
    m_bInterpColor = b;
    invalidateDisplayCache();
  }
  bool isSmoothColor() const { return m_bInterpColor; }


public:
  
  SelectionPtr getAnchorSel() const
  {
    return m_pAnchorSel;
  }

  void setAnchorSel(SelectionPtr pNewSel)
  {
    m_pAnchorSel = pNewSel;
    invalidateDisplayCache();
  }

  double getAnchorWgt() const {
    return m_dAnchorWgt;
  }

  void setAnchorWgt(double d) {
    m_dAnchorWgt = d;
    invalidateDisplayCache();
  }

  double getAnchorWgt(MolResiduePtr pRes) const;
  double getAnchorWgt2(MolResiduePtr pRes, const LString &sstr) const;

  void invalidateSplineCoeffs();

  //////////////////////////////////////////////////////
  // Tube capping routine

public:
  /// cap type ID
  enum {
    TUBE_CAP_SPHR = 0,
    TUBE_CAP_FLAT = 1,
    TUBE_CAP_NONE = 2
  };

  int getStartCapType() const { return m_nStCapType; }
  void setStartCapType(int nType) {
    super_t::invalidateDisplayCache();
    m_nStCapType = nType;
  }

  int getEndCapType() const {
    MB_DPRINTLN("Rib2rend end_captype=%d", m_nEnCapType);
    return m_nEnCapType;
  }
  void setEndCapType(int nType) {
    super_t::invalidateDisplayCache();
    m_nEnCapType = nType;
  }

private:

  /// start cap type
  int m_nStCapType;
  int m_nEnCapType;

public:
  
  gfx::ColorPtr calcColor(double t, detail::SecSplDat *pCyl);

  TubeSectionPtr getHelixSection() const { return m_ptsHelix; }
  TubeSectionPtr getSheetSection() const { return m_ptsSheet; }
  TubeSectionPtr getCoilSection() const { return m_ptsCoil; }

  JctTablePtr getSheetHead() const { return m_pSheetHead; }

  TubeSectionPtr getRibHelixSection() const { return m_ptsRibHelix; }
  JctTablePtr getRibHelixHead() const { return m_pRibHelixHead; }
  JctTablePtr getRibHelixTail() const { return m_pRibHelixTail; }

  //////////

  void curvature();
  void dumpCyls(detail::SecSplDat *pC);

private:
  void updateDiffVecs();
  void updateDiffVecsImpl(detail::SecSplDat *pC);

public:
  /// Returns 1-st differential vector as to the axial (t) parameter.
  ///  (used for the tangential vector calculation for the disorder renderer)
  virtual bool getDiffVec(MolResiduePtr pRes, Vector4D &rpos, Vector4D &rvec);

  /// Cylinder-shaped helix flag
  bool m_bCylHelix;

};

}

#endif
