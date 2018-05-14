// -*-Mode: C++;-*-
//
//  molecular surface renderer
//
// $Id: MolSurfRenderer.hpp,v 1.8 2011/04/02 07:57:34 rishitani Exp $

#ifndef MOLSURF_RENDERER_H__
#define MOLSURF_RENDERER_H__

#include "surface.hpp"

#include <qlib/mcutils.hpp>
// #include <qlib/Vector4D.hpp>

#include <qsys/DispListRenderer.hpp>
#include <gfx/SolidColor.hpp>
#include <qsys/MultiGradient.hpp>

#include "MolSurfObj.hpp"

#include <modules/molstr/molstr.hpp>
#include <modules/molstr/ColoringScheme.hpp>

namespace qsys { class ScalarObject; }
namespace molstr {
  class MolCoord;
  class AtomPosMap;
  class AtomPosMap2;
}

namespace surface {

  using qlib::Vector4D;
  using gfx::ColorPtr;
  using gfx::DisplayContext;
  using molstr::MolCoordPtr;
  using molstr::SelectionPtr;
  using molstr::AtomPosMap;
  using molstr::AtomPosMap2;

  class SURFACE_API MolSurfRenderer : public qsys::DispListRenderer, public molstr::ColSchmHolder
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef qsys::DispListRenderer super_t;

    ////////////////////////////////////////
    // Properties

  private:

    /// Cull face flag
    bool m_bCullFace;

  public:
    bool isCullFace() const { return m_bCullFace; }
    void setCullFace(bool b) {
      m_bCullFace = b;
      invalidateDisplayCache();
    }

  private:
    /// Coloring mode
    int m_nMode;

  public:
    enum {
      SFREND_SIMPLE = 0,
      SFREND_SCAPOT = 1,
      SFREND_MOLSIMP = 2,
      SFREND_MOLFANC = 3,
      SFREND_MULTIGRAD = 4,
    };

    int getColorMode() const { return m_nMode; }
    void setColorMode(int n) {
      m_nMode = n;
      invalidateDisplayCache();
    }

  private:
    /// Mesh-drawing mode
    int m_nDrawMode;

  public:
    enum {
      SFDRAW_FILL = 0,
      SFDRAW_LINE = 1,
      SFDRAW_POINT = 2,
    };

    int getDrawMode() const { return m_nDrawMode; }
    void setDrawMode(int n) {
      m_nDrawMode = n;
      invalidateDisplayCache();
    }

  private:
    /// Molecule object ID by which painting color is determined.
    /// (used in MOLFANC mode)
    qlib::uid_t m_nTgtMolID;

    /// Molecule object name by which painting color is determined.
    /// used in MOLFANC mode
    /// used if MolID cannot be resolved (when deserialized from qsc file...)
    LString m_sTgtMolName;

  private:
    /// Selection for atompos-map (used in MOLFANC mode)
    SelectionPtr m_pMolSel;

    /// Selection for display (used in MOLFANC mode)
    SelectionPtr m_pShowSel;

    /// Color params in potential mode
    double m_dParLow;

    double m_dParMid;

    double m_dParHigh;

    ColorPtr m_colHigh;

    ColorPtr m_colMid;

    ColorPtr m_colLow;

  private:
    /// Scalar field object name by which painting color is determined.
    /// (used in ELEPOT/MULTIGRAD mode)
    LString m_sTgtElePot;

  public:
    /// reference elepot target (used in potential mode)
    LString getTgtElePotName() const { return m_sTgtElePot; }
    void setTgtElePotName(const LString &n) {
      m_sTgtElePot = n;
      invalidateDisplayCache();
    }

  private:
    /// Ramp_above mode
    bool m_bRampAbove;

  public:
    bool isRampAbove() const { return m_bRampAbove; }
    void setRampAbove(bool val) {
      m_bRampAbove = val;
      if (m_nMode==SFREND_SCAPOT)
        invalidateDisplayCache();
    }

  private:
    double m_dRampVal;

  public:
    double getRampValue() const { return m_dRampVal; }
    void setRampValue(double d) {
      m_dRampVal = d;
      if (m_nMode==SFREND_SCAPOT)
        invalidateDisplayCache();
    }

  private:
    /// Line/Dot size in wireframe/dot mode
    double m_lw;

  public:
    void setLineWidth(double f) {
      m_lw = f;
      super_t::invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }


  private:

    /// Multi gradient data
    qsys::MultiGradientPtr m_pGrad;

  public:
    qsys::MultiGradientPtr getMultiGrad() const {
      return m_pGrad;
    }

    void setMultiGrad(const qsys::MultiGradientPtr &val) {
      m_pGrad = val;
    }

  public:

    /// reference coloring map target (used in MULTIGRAD mode)
    LString getColorMapName() const { return getTgtElePotName(); }
    void setColorMapName(const LString &n) { setTgtElePotName(n); }

    /// get color-map object (valid in MULTIGRAD mode)
    qsys::ObjectPtr getColorMapObj() const;

  private:

    /////////////
    // work area
    qsys::ScalarObject *m_pScaObj;

    MolCoordPtr m_pMol;
    AtomPosMap2 *m_pAmap;

    /// target surface object
    MolSurfObj *m_pSurf;

  public:

    ///////////////////////////////////////////
    // constructors / destructor

    /// default constructor
    MolSurfRenderer();

    /// destructor
    virtual ~MolSurfRenderer();

    //////////////////////////////////////////////////////
    // Renderer implementation

    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;

    virtual LString toString() const;

    ///////////////////////////////////////////

    virtual const char *getTypeName() const;

    // virtual void attachObj(qlib::uid_t obj_uid);
    // virtual qlib::uid_t detachObj();

    virtual Vector4D getCenter() const;
    virtual bool hasCenter() const;

    ///////////////////////////////////////////
    // DispListRenderer implemention

    virtual void preRender(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc);

    virtual void render(DisplayContext *pdl);

    // virtual void targetChanged(MbObjEvent &ev);

    ///////////////////////////////////////////

    void setDefaultColor(const ColorPtr &rc) {
      ColSchmHolder::setDefaultColor(rc);
      invalidateDisplayCache();
    }

    /// Get reference molecule target (used in molecule mode)
    LString getTgtObjName() const;

    /// Set reference molecule target (used in molecule mode)
    void setTgtObjName(const LString &n);

    //////////
    // for "potential" mode

    double getLowPar() const { return m_dParLow; }
    void setLowPar(double d) {
      m_dParLow = d;
      if (m_nMode==SFREND_SCAPOT)
        invalidateDisplayCache();
    }

    double getMidPar() const { return m_dParMid; }
    void setMidPar(double d) {
      m_dParMid = d;
      if (m_nMode==SFREND_SCAPOT)
        invalidateDisplayCache();
    }

    double getHighPar() const { return m_dParHigh; }
    void setHighPar(double d) {
      m_dParHigh = d;
      if (m_nMode==SFREND_SCAPOT)
        invalidateDisplayCache();
    }

    ColorPtr getLowCol() const { return m_colLow; }
    void setLowCol(const ColorPtr &rc) {
      m_colLow = rc;
      if (m_nMode==SFREND_SCAPOT)
        invalidateDisplayCache();
    }

    ColorPtr getHighCol() const { return m_colHigh; }
    void setHighCol(const ColorPtr &rc) {
      m_colHigh = rc;
      if (m_nMode==SFREND_SCAPOT)
        invalidateDisplayCache();
    }

    ColorPtr getMidCol() const { return m_colMid; }
    void setMidCol(const ColorPtr &rc) {
      m_colMid = rc;
      if (m_nMode==SFREND_SCAPOT)
        invalidateDisplayCache();
    }

    ////

    SelectionPtr getMolSel() const {
      return m_pMolSel;
    }

    void setMolSel(SelectionPtr pNewSel) {
      m_pMolSel = pNewSel;
      makeAtomPosMap();
      invalidateDisplayCache();
    }

    void makeAtomPosMap();

    ////

    SelectionPtr getShowSel() const
    {
      return m_pShowSel;
    }

    void setShowSel(SelectionPtr pNewSel)
    {
      m_pShowSel = pNewSel;
      invalidateDisplayCache();
    }

    ////

    virtual void propChanged(qlib::LPropEvent &ev);

    /// object-changed event handler
    virtual void objectChanged(qsys::ObjectEvent &ev);

    /// scene-changed event handler (for onloaded event)
    virtual void sceneChanged(qsys::SceneEvent &ev);

    /////////////////
    // Serialization

    // virtual void writeTo2(LDom2Node *pNode) const;

    //virtual void readFrom2(LDom2Node *pNode);

  private:

    bool getColorSca(const Vector4D &v, ColorPtr &rcol);
    bool getColorMol(const Vector4D &v, ColorPtr &rcol);
    bool isShowVert(const Vector4D &v) const;


    /// Resolve mol name, set m_nTgtMolID, listen the MolCoord events, and returns MolCoord object
    MolCoordPtr resolveMolIDImpl(const LString &name);

  };

}

#endif

