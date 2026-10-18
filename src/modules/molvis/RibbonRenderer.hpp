// -*-Mode: C++;-*-
//
//  Protein ribbon representation renderer class
//

#ifndef MOLVIS_RIBBON_RENDERER_HPP_INCLUDED
#define MOLVIS_RIBBON_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include "SplineRenderer.hpp"
#include "TubeSection.hpp"
#include "SplineTubeRenderer.hpp"
#include "JctTable.hpp"

namespace molvis {

using gfx::ColorPtr;
class RibbonSmoothEval;

class RibbonRenderer : public SplineTubeRenderer
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  typedef SplineTubeRenderer super_t;
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

private:
  struct SegCtx;

  inline bool isHelixBackCol(const SegCtx &c, int ss_type, int nt) const;

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
  ~RibbonRenderer() override;

  // virtual Renderer *create();
  // virtual bool setClientObj(MbObject *pobj);

  const char *getTypeName() const override;

  void preRender(DisplayContext *pdc) override;


  //////////////////////////////////////////////////////

  void beginRend(DisplayContext *pdl) override;

  // virtual void endSegment(DisplayCommand *pdl, MolResidue *pRes);
  // virtual void display(DisplayContext *pdc);
  // virtual void rendHitResid(DisplayCommand *phl, MolResidue *pRes);

  //////////////////////////////////////////////////////

  /// Draw one segment to pmb (see SplineTubeRenderer).
  /// Uses no renderer state, so segments can be drawn concurrently.
  void renderSplineTo(TubeMeshBuilder *pmb, SplineCoeff *pCoeff,
                      const MolResiduePtr &pStartRes, double fstart,
                      const MolResiduePtr &pEndRes, double fend) override;

  ////////////////////////////////////////////
  // property handling

  void propChanged(qlib::LPropEvent &ev) override;

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

  /// State of drawing one segment (renderSplineTo()). Kept out of the
  /// renderer so that segments can be drawn concurrently (the coordinate
  /// update of TubeGpuSupport runs them in parallel).
  struct SegCtx
  {
    /// drawing sink of this segment
    TubeMeshBuilder *pmb = nullptr;

    std::vector<char> hscTab;

    bool bStart = true;
    bool bMakePartition = false;
    ColorPtr pCol, pPrevCol;
    ColorPtr pCurHBCol, pCurSSCol;
    /// Hit names (pick pass) of the current / previous drawing point
    int nHitName = -1, nPrevHitName = -1;
    bool bNextBnormInv = false;
    bool bPrevBnormInv = false;
    Vector4D e11, e12, e21, e22;
    Vector4D f1, f2, bnorm, vpt;
    Vector4D prev_e1, prev_e2, prev_f1, prev_vpt;
    Vector4D prev_escl;

    double par = 0.0, prev_par = 0.0;

    void updatePrevValues() {
      prev_par = par;
      prev_e1 = e11;
      prev_e2 = e12;
      prev_f1 = f1;
      prev_vpt = vpt;
      pPrevCol = pCol;
      nPrevHitName = nHitName;
    }
  };

  void makeHSCTable(SegCtx &c, SplineCoeff *pCoeff, int istart, int iend);

  /// True if the strip ending at c.par may reuse the ring of the previous
  /// strip (at c.prev_par) as a TubeMeshBuilder ring band (see
  /// SplineRenderer::canShareRing()). With smooth
  /// coloring the helix back / sheet side colors follow the color at c.par,
  /// so those strips keep both rings.
  bool isRingBandOK(const SegCtx &c, SplineCoeff *pCoeff)
  {
    if (!c.pmb->hasRing()) return false;
    if (isSmoothColor() && (m_bHelixBackCol || m_bSheetSideCol)) return false;
    // the helix back color depends on the binormal flags of both neighbors
    return canShareRing(c.prev_par, c.par, pCoeff, m_bHelixBackCol);
  }

  void renderTube(SegCtx &c,
                  char ss_type,
                  TubeSection *pCurTs,
                  SplineCoeff *pCoeff,
                  double fcstart, double fcend, int naxdet);
  
  void renderJct(SegCtx &c,
                 char ss_type,
                 TubeSection *pCurTs,
                 JctTable *pJct,
                 SplineCoeff *pCoeff,
                 double fcstart, double fcend, int naxdet);

  bool setupHelper(SegCtx &c,
                   TubeSection *pCurTs,
                   int index, double par, SplineCoeff *pCoeff);

  // ColorPtr calcColor(double par, SplineCoeff *pCoeff);

};

inline bool RibbonRenderer::isHelixBackCol(const SegCtx &c, int ss_type, int nt) const
{
  if (!m_bHelixBackCol)
    return false;

  if (ss_type==RB_HELIX || ss_type==RB_HELIX_TAIL) {
    if (c.bNextBnormInv)
      return (nt==TubeSection::TSSF_FRONT);
    else
      return (nt==TubeSection::TSSF_BACK);
  }
  else if (ss_type==RB_HELIX_HEAD) {
    if (c.bPrevBnormInv)
      return (nt==TubeSection::TSSF_FRONT);
    else
      return (nt==TubeSection::TSSF_BACK);
  }
  return false;
}

} // namespace molvis

#endif


