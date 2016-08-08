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
      super_t::invalidateDisplayCache();
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
    virtual ~SplineRenderer();

    virtual const char *getTypeName() const;

    //////////////////////////////////////////////////////
    // MainChainRenderer interface

    virtual void beginRend(DisplayContext *pdl);
    virtual void beginSegment(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void rendResid(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void endSegment(DisplayContext *pdl, MolResiduePtr pRes);
    virtual void endRend(DisplayContext *pdl);

    //////////////////////////////////////////////////////
    // SplineRenderer interface

    virtual void renderSpline(DisplayContext *pdl, SplineCoeff *pCoeff,
                              MolResiduePtr pStartRes, double fstart,
                              MolResiduePtr pEndRes, double fend);

    virtual bool getDiffVec(MolResiduePtr pRes, Vector4D &rpos, Vector4D &rvec);

    //////////////////////////////////////////////////////
    // event handling

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void objectChanged(qsys::ObjectEvent &ev);

    //////////////////////////////////////////////////////

    virtual void setAxialDetail(int nlev);

    int getAxialDetail() const { return m_nAxialDetail; }

    void setSmoothColor(bool b) {
      invalidateDisplayCache();
      m_bInterpColor = b;
    }

    bool isSmoothColor() const { return m_bInterpColor; }

    ColorPtr calcColor(double par, SplineCoeff *pCoeff);

    void invalidateSplineCoeffs();

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
      super_t::invalidateDisplayCache();
      m_nStCapType = nType;
    }

    int getEndCapType() const { return m_nEnCapType; }
    void setEndCapType(int nType) {
      super_t::invalidateDisplayCache();
      m_nEnCapType = nType;
    }

  private:
    /// Fade out flag of the end of the segment
    bool m_bSegEndFade;

  public:
    void setSegEndFade(bool b) {
      super_t::invalidateDisplayCache();
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
    void setPivAtomName(const LString &aname);

  };

}

#endif
