// -*-Mode: C++;-*-
//
//  Disorder line (dot) renderer class
//

#ifndef MOLVIS_DISORDER_RENDERER_HPP
#define MOLVIS_DISORDER_RENDERER_HPP

#include "molvis.hpp"

#include <modules/molstr/molstr.hpp>
#include <modules/molstr/MainChainRenderer.hpp>
#include <qsys/DispListRenderer.hpp>
#include <gfx/SolidColor.hpp>

class DisoRenderer_wrap;

namespace molvis {

  using gfx::ColorPtr;
  using gfx::DisplayContext;
  using qlib::Vector4D;
  using molstr::MolCoordPtr;
  using molstr::MolResiduePtr;
  using molstr::SelectionPtr;
  using molstr::MainChainRenderer;

  class MOLVIS_API DisoRenderer : public molstr::MolRenderer, public qsys::RendererEventListener
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::DisoRenderer_wrap;

    typedef molstr::MolRenderer super_t;

  private:
    //////////////////////////////////////////////////////
    // workarea

    qlib::uid_t m_nTgtRendID;
    MainChainRenderer *m_pTgtRend;

    //////////////////////////////////////////////////////

  public:
    DisoRenderer();
    virtual ~DisoRenderer();

    //////////////////////////////////////////////////////

    virtual LString toString() const;
    virtual const char *getTypeName() const;
    virtual bool isDispLater() const;

    ////

    virtual void render(DisplayContext *pdl);

    //////////////////////////////////////////////////////
    // Properties

  private:
    /// line width
    double m_linew;

    /// Color of lines
    ColorPtr m_pcolor;

    /// Tesselation level
    int m_nDetail;

  public:
    int getDetail() const { return m_nDetail; }
    void setDetail(int nID) {
      m_nDetail = nID;
      invalidateDisplayCache();
    }

    double getWidth() const { return m_linew; }
    void setWidth(double d) {
      m_linew = d;
      invalidateDisplayCache();
    }

  private:
    LString m_strTgtRendName;
  public:
    LString getTgtRendName() const { return m_strTgtRendName; }
    void setTgtRendName(const LString &s);

  private:
    double m_dDotSep;
  public:
    double getDotSep() const { return m_dDotSep; }
    void setDotSep(double d) {
      invalidateDisplayCache();
      m_dDotSep = d;
    }

  private:
    double m_dStrength;
    
  public:
    double getStrength() const { return m_dStrength; }
    void setStrength(double d) {
      m_dStrength = d;
      invalidateDisplayCache();
    }

  private:
    double m_dStrength2;
    
  public:
    double getStrength2() const { return m_dStrength2; }
    void setStrength2(double d) {
      m_dStrength2 = d;
      invalidateDisplayCache();
    }

    ////////////////////

  public:

    virtual void rendererChanged(qsys::RendererEvent &ev);
    // virtual void propChanged(qlib::LPropEvent &ev);
    // virtual void styleChanged(qsys::StyleEvent &ev);

  private:

    void rendDiso(DisplayContext *pdl, MolResiduePtr pRes, MolResiduePtr pPrevRes);

    MainChainRenderer *getTgtRend();

    void renderBezierDots(DisplayContext *pdl,
                          const Vector4D &pos1,
                          const Vector4D &pos2,
                          const Vector4D &pos3,
                          const Vector4D &pos4,
                          const ColorPtr &c1,
                          const ColorPtr &c2);

    void setupEvent(qlib::uid_t nNewID);

  };

}


#endif

