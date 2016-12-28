// -*-Mode: C++;-*-
//
//  Backbone tube renderer
//

#ifndef TUBE_RENDERER_HPP_INCLUDED
#define TUBE_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include "SplineRenderer.hpp"
#include "TubeSection.hpp"
#include <qlib/Vector2D.hpp>

namespace molvis {

  class TubeRenderer : public SplineRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:

    typedef SplineRenderer super_t;

    /// Tube section data
    TubeSectionPtr m_pts;

    //////////////////////////////////////////////////////

  public:
    TubeRenderer();
    virtual ~TubeRenderer();

    // virtual Renderer *create();

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


    TubeSectionPtr getTubeSection() const {
      return m_pts;
    }

    //void setTubeSection(TubeSectionPtr pts) {
    //m_pts = pts;
    //}

    void setWidth(double f) {
      m_pts->setWidth(f);
    }

    double getWidth() const {
      return m_pts->getWidth();
    }

    void setTuber(double f) {
      m_pts->setTuber(f);
    }

    ///////////////////////////////

  private:
    int m_nPuttyMode;

  public:
    static const int TBR_PUTTY_OFF = 0;
    static const int TBR_PUTTY_SCALE1 = 1;
    static const int TBR_PUTTY_LINEAR1 = 2;

    void setPuttyMode(int nmode) {
      m_nPuttyMode = nmode;
      invalidateDisplayCache();
    }
    int getPuttyMode() const { return m_nPuttyMode; }

    ///////////////////////////////

  private:
    int m_nPuttyTgt;

  public:
    static const int TBR_PUTTY_BFAC = 1;
    static const int TBR_PUTTY_OCC = 2;

    void setPuttyTgt(int ntgt) {
      m_nPuttyTgt = ntgt;
      invalidateDisplayCache();
    }
    int getPuttyTgt() const { return m_nPuttyTgt; }

    ///////////////////////////////

  private:
    double m_dParHi;
    double m_dParLo;
    double m_dParAver;

    double m_dPuttyScl;
    double m_dPuttyLoScl;

  public:
    void setPuttyHiScl(double d) {
      m_dPuttyScl = d;
      invalidateDisplayCache();
    }
    double getPuttyHiScl() const { return m_dPuttyScl; }

    void setPuttyLoScl(double d) {
      m_dPuttyLoScl = d;
      invalidateDisplayCache();
    }
    double getPuttyLoScl() const { return m_dPuttyLoScl; }

  private:
    qlib::Vector2D getEScl(double par, SplineCoeff *pCoeff);


    void test1(DisplayContext *pdl, SplineCoeff *pCoeff,
               MolResiduePtr pStartRes, double fstart,
               MolResiduePtr pEndRes, double fend);

  };

} // namespace molvis

#endif

