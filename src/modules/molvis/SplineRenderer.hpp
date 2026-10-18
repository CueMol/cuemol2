// -*-Mode: C++;-*-
//
//  backbone spline-trace renderer class
//

#ifndef SPLINE_RENDERER_HPP_INCLUDED
#define SPLINE_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <modules/molstr/MainChainRenderer.hpp>
//#include <modules/molstr/ColoringScheme.hpp>
#include "CubicSpline.hpp"
#include "SplineCoeffSet.hpp"

class SplineRenderer_wrap;

namespace molvis {

  using qlib::Vector4D;
  using gfx::ColorPtr;
  using namespace molstr;

  class TubeSection;

  /// Exception(s)
  MB_DECL_EXCPT_CLASS(MOLVIS_API, SplineRenderingException, qlib::RuntimeException);

  class SplineRenderer : public MainChainRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::SplineRenderer_wrap;

  private:

    typedef MainChainRenderer super_t;

    /// Num of interporation point to the axial direction (axialdetail)
    int m_nAxialDetail;

    /// interpolate color or not
    bool m_bInterpColor;

    //////////////////////////////////////////////////////
  private:
    /// width of line drawing (in pixel unit)
    double m_dLineWidth;

  public:
    void setLineWidth(double d) {
      invalidateDisplayCache();
      m_dLineWidth = d;
    }
    double getLineWidth() const {
      return m_dLineWidth;
    }

    ////////////
    // work area
  private:
    SplineCoeffSet m_scs;
    MolResiduePtr m_pStartRes;

  public:
    SplineRenderer();
    ~SplineRenderer() override;

    const char *getTypeName() const override;

    void preRender(DisplayContext *pdc) override;

    //////////////////////////////////////////////////////
    // MainChainRenderer interface

    void beginRend(DisplayContext *pdl) override;
    void beginSegment(DisplayContext *pdl, MolResiduePtr pRes) override;
    void rendResid(DisplayContext *pdl, MolResiduePtr pRes) override;
    void endSegment(DisplayContext *pdl, MolResiduePtr pRes) override;
    void endRend(DisplayContext *pdl) override;

    //////////////////////////////////////////////////////
    // SplineRenderer interface

    virtual void renderSpline(DisplayContext *pdl, SplineCoeff *pCoeff,
                              MolResiduePtr pStartRes, double fstart,
                              MolResiduePtr pEndRes, double fend);

    bool getDiffVec(MolResiduePtr pRes, Vector4D &rpos, Vector4D &rvec) override;

    //////////////////////////////////////////////////////
    // event handling

    void propChanged(qlib::LPropEvent &ev) override;

    void objectChanged(qsys::ObjectEvent &ev) override;

    //////////////////////////////////////////////////////

    virtual void setAxialDetail(int nlev);

    int getAxialDetail() const { return m_nAxialDetail; }

    void setSmoothColor(bool b) {
      invalidateDisplayCache();
      m_bInterpColor = b;
    }

    bool isSmoothColor() const { return m_bInterpColor; }

    ColorPtr calcColor(double par, SplineCoeff *pCoeff);

    /// Hit name (pivot atom ID of the owning residue) at spline parameter par.
    int calcHitName(double par, SplineCoeff *pCoeff) const;

    /// True if a tube strip from spline parameter par0 to par1 may reuse the
    /// ring at par0 drawn by the previous strip (TubeMeshBuilder ring band)
    /// without changing any vertex. The strip takes its color and hit name at
    /// par1; without smooth coloring both come from the nearer of the two
    /// neighbor residues, so the ring can be shared while that residue (with
    /// its pivot atom) stays the same. With bNeighbors, the strip also
    /// depends on the two neighbor residues themselves (e.g. the binormal
    /// direction flags), so they have to be the same too. The segment end
    /// fade depends on the position between them and never shares.
    bool canShareRing(double par0, double par1, const SplineCoeff *pCoeff,
                      bool bNeighbors = false) const;

    void invalidateSplineCoeffs();

    /// Spline topology: valid, and its generation (incremented on every
    /// rebuild; the SplineCoeff objects of an older generation are gone)
    bool isSplineTopoValid() const { return m_scs.isTopoValid(); }
    int getSplineTopoGen() const { return m_scs.getTopoGen(); }

    /// Recompute the stale part of the spline coeffs (after an atom move)
    void prepareSplineCoeffs();

    /// The atoms moved: mark the geometry part of the spline coeffs stale
    /// (the topology part is kept)
    void markSplineCoeffsMoved() { m_scs.markMoved(); }

  private:
    void getSegEndImpl(int nprev, MolResiduePtr pPrev,
                       int nnext, MolResiduePtr pNext,
                       SplineCoeff *pCoeff,
                       double &rho, bool &bRes1Tp, bool &bRes2Tp);

    //////////////////////////////////////////////////////
    // Tube capping

  private:

    /// start cap type
    int m_nStCapType;
    int m_nEnCapType;

  public:
    /// cap type ID
    enum {
      TUBE_CAP_SPHR = 0,
      TUBE_CAP_FLAT = 1,
      TUBE_CAP_NONE = 2,
    };

    int getStartCapType() const { return m_nStCapType; }
    void setStartCapType(int nType) {
      invalidateDisplayCache();
      m_nStCapType = nType;
    }

    int getEndCapType() const { return m_nEnCapType; }
    void setEndCapType(int nType) {
      invalidateDisplayCache();
      m_nEnCapType = nType;
    }

  private:
    /// Fade out flag of the end of the segment
    bool m_bSegEndFade;

  public:
    void setSegEndFade(bool b) {
      invalidateDisplayCache();
      m_bSegEndFade = b;
    }
    bool isSegEndFade() const { return m_bSegEndFade; }

    /// Returns true, if par is at the internal end of the segment
    ///  (returns false, if par is at the external end.)
    bool isSegEnd(double par, SplineCoeff *pCoeff);


  public:

    //////////////////////////////////////////////////////
    // Smooth value evaluation routine

    void setSmooth(double f) {
      m_scs.setSmooth(f);
      invalidateSplineCoeffs();
    }
    double getSmooth() const {
      return m_scs.getSmooth();
    }

    void setSmoothEval(RealNumEvaluator *pEval) {
      m_scs.setSmoothEval(pEval);
    }

    /// Pivot atom name (change should be notified to SplieCoeffSet)
    void setPivAtomName(const LString &aname) override;

  };

}

#endif
