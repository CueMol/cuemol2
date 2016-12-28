// -*-Mode: C++;-*-
//
//  Protein ribbon representation renderer class
//

#ifndef MOLVIS_RIBBON_RENDERER_HPP_INCLUDED
#define MOLVIS_RIBBON_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include "SplineRenderer.hpp"
#include "TubeSection.hpp"
#include "JctTable.hpp"

namespace molvis {

using gfx::ColorPtr;
class RibbonSmoothEval;

class RibbonRenderer : public SplineRenderer
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  typedef SplineRenderer super_t;
private:
  //////////////////////////////////////////////////////
  // Properties

  /// Section data for helix
  TubeSectionPtr m_ptsHelix;

  /// Section data for sheet
  TubeSectionPtr m_ptsSheet;

  /// Section data for coil
  TubeSectionPtr m_ptsCoil;

  /// Junction table for the helix head
  //MCINFO: JctTable m_helixCoil => helix_head
  JctTablePtr m_pHelixHead;

  /// Junction table for the helix tail
  //MCINFO: JctTable m_coilHelix => helix_tail
  JctTablePtr m_pHelixTail;

  /// Junction table for the sheet head
  //MCINFO: JctTable m_sheetCoil => sheet_head
  JctTablePtr m_pSheetHead;

  /// Junction table for the sheet tail
  //MCINFO: JctTable m_coilSheet => sheet_tail
  JctTablePtr m_pSheetTail;

  RibbonSmoothEval *m_pSmoothEval;
  
  bool m_bHelixBackCol;
  bool m_bSheetSideCol;

  ColorPtr m_pHelixBackCol;
  ColorPtr m_pSheetSideCol;

  ColorPtr m_pCurHBCol;
  ColorPtr m_pCurSSCol;

private:
  bool m_bNextBnormInv;
  bool m_bPrevBnormInv;

  inline bool isHelixBackCol(int ss_type, int nt) const {
    if (!m_bHelixBackCol)
      return false;
    
    if (ss_type==RB_HELIX || ss_type==RB_HELIX_TAIL) {
      if (m_bNextBnormInv)
        return (nt==TubeSection::TSSF_FRONT);
      else 
        return (nt==TubeSection::TSSF_BACK);
    }
    else if (ss_type==RB_HELIX_HEAD) {
      if (m_bPrevBnormInv)
        return (nt==TubeSection::TSSF_FRONT);
      else 
        return (nt==TubeSection::TSSF_BACK);
    }
    return false;
  }
  
  inline bool isSheetSideCol(int ss_type, int nt) const {
    if (m_bSheetSideCol &&
        (ss_type==RB_SHEET ||
         ss_type==RB_SHEET_HEAD ||
         ss_type==RB_SHEET_TAIL) &&
        (nt==TubeSection::TSSF_SIDE1 || nt==TubeSection::TSSF_SIDE2))
      return true;
    else
      return false;
  }
  
public:
  bool isUseHBCol() const {
    return (m_bHelixBackCol);
  }
  void setUseHBCol(bool n) {
    m_bHelixBackCol = n;
    invalidateDisplayCache();
  }
    
  bool isUseSSCol() const {
    return m_bSheetSideCol;
  }
  void setUseSSCol(bool n) {
    m_bSheetSideCol = n;
    invalidateDisplayCache();
  }

  ColorPtr getHelixBackCol() const { return m_pHelixBackCol; }
  void setHelixBackCol(ColorPtr p) {
    m_pHelixBackCol = p;
    invalidateDisplayCache();
  }

  ColorPtr getSheetSideCol() const { return m_pSheetSideCol; }
  void setSheetSideCol(ColorPtr p) {
    m_pSheetSideCol = p;
    invalidateDisplayCache();
  }

  //////////////////////////////////////////////////////

public:
  RibbonRenderer();
  virtual ~RibbonRenderer();

  // virtual Renderer *create();
  // virtual bool setClientObj(MbObject *pobj);

  virtual const char *getTypeName() const;

  virtual void preRender(DisplayContext *pdc);

  //////////////////////////////////////////////////////

  virtual void beginRend(DisplayContext *pdl);

  // virtual void endSegment(DisplayCommand *pdl, MolResidue *pRes);
  // virtual void display(DisplayContext *pdc);
  // virtual void rendHitResid(DisplayCommand *phl, MolResidue *pRes);

  //////////////////////////////////////////////////////

  virtual void renderSpline(DisplayContext *pdl, SplineCoeff *pCoeff,
                            MolResiduePtr pStartRes, double fstart,
                            MolResiduePtr pEndRes, double fend);

  ////////////////////////////////////////////
  // property handling

  virtual void propChanged(qlib::LPropEvent &ev);

  TubeSectionPtr getHelixSection() const { return m_ptsHelix; }
  TubeSectionPtr getSheetSection() const { return m_ptsSheet; }
  TubeSectionPtr getCoilSection() const { return m_ptsCoil; }

  JctTablePtr getHelixHead() const { return m_pHelixHead; }
  JctTablePtr getHelixTail() const { return m_pHelixTail; }

  JctTablePtr getSheetHead() const { return m_pSheetHead; }
  JctTablePtr getSheetTail() const { return m_pSheetTail; }

  void setHelixSmooth(double d);
  double getHelixSmooth() const;

  void setSheetSmooth(double d);
  double getSheetSmooth() const;

  void setCoilSmooth(double d);
  double getCoilSmooth() const;

private:

  //////////////////////////////////////////////////////
  // workarea

  static const char RB_HELIX=2;
  static const char RB_SHEET=1;
  static const char RB_COIL=0;

  static const char RB_HELIX_HEAD=3;
  static const char RB_HELIX_TAIL=4;

  static const char RB_SHEET_HEAD=5;
  static const char RB_SHEET_TAIL=6;

  std::vector<char> m_hscTab;

  void makeHSCTable(SplineCoeff *pCoeff, int istart, int iend);

  void renderTube(DisplayContext *pdl,
                  char ss_type,
                  TubeSection *pCurTs,
                  SplineCoeff *pCoeff,
                  double fcstart, double fcend, int naxdet);
  
  void renderJct(DisplayContext *pdl,
                 char ss_type,
                 TubeSection *pCurTs,
                 JctTable *pJct,
                 SplineCoeff *pCoeff,
                 double fcstart, double fcend, int naxdet);

  //////////

  bool m_bStart;
  bool m_bMakePartition;
  ColorPtr m_pCol, m_pPrevCol;
  Vector4D m_e11, m_e12, m_e21, m_e22;
  Vector4D m_f1, m_f2, m_bnorm, m_vpt;
  Vector4D m_prev_e1, m_prev_e2, m_prev_f1, m_prev_vpt;
  Vector4D m_prev_escl;

  double m_par, m_prev_par;

  bool setupHelper(DisplayContext *pdl,
                   TubeSection *pCurTs,
                   int index, double par, SplineCoeff *pCoeff);
  
  void updatePrevValues() {
    m_prev_par = m_par;
    m_prev_e1 = m_e11;
    m_prev_e2 = m_e12;
    m_prev_f1 = m_f1;
    m_prev_vpt = m_vpt;
    m_pPrevCol = m_pCol;
  }

  // ColorPtr calcColor(double par, SplineCoeff *pCoeff);

};

} // namespace molvis

#endif


