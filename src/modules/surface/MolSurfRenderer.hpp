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
#include "ScalarColorSupport.hpp"

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

  class SURFACE_API MolSurfRenderer : public qsys::DispListRenderer,
                                     public molstr::ColSchmHolder,
                                     public ScalarColorSupport
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

    /// Line/Dot size in wireframe/dot mode
    double m_lw;

  public:
    void setLineWidth(double f) {
      m_lw = f;
      super_t::invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }


  public:
    /// get color-map object (valid in MULTIGRAD mode)
    qsys::ObjectPtr getColorMapObj() const;

    /// The scalar colouring the current colormode selects.
    ScalarMode scaMode() const {
      if (m_nMode==SFREND_SCAPOT) return SCM_RAMP;
      if (m_nMode==SFREND_MULTIGRAD) return SCM_MULTIGRAD;
      return SCM_NONE;
    }

    bool isScalarColorMode() const { return scaMode()!=SCM_NONE; }

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
    ~MolSurfRenderer() override;

    //////////////////////////////////////////////////////
    // Renderer implementation

    bool isCompatibleObj(qsys::ObjectPtr pobj) const override;

    LString toString() const override;

    ///////////////////////////////////////////

    const char *getTypeName() const override;

    // virtual void attachObj(qlib::uid_t obj_uid);
    // virtual qlib::uid_t detachObj();

    Vector4D getCenter() const override;
    bool hasCenter() const override;

    ///////////////////////////////////////////
    // DispListRenderer implemention

    void preRender(DisplayContext *pdc) override;
    void postRender(DisplayContext *pdc) override;

    void render(DisplayContext *pdl) override;

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

    void propChanged(qlib::LPropEvent &ev) override;

    /// object-changed event handler
    void objectChanged(qsys::ObjectEvent &ev) override;

    /// scene-changed event handler (for onloaded event)
    void sceneChanged(qsys::SceneEvent &ev) override;

    /////////////////
    // Serialization

    // virtual void writeTo2(LDom2Node *pNode) const;

    //virtual void readFrom2(LDom2Node *pNode);

  protected:
    /// ScalarColorSupport hook: redraw when a scalar colour mode is active
    void scalarColorPropChanged() override;

  private:

    bool getColorMol(const Vector4D &v, ColorPtr &rcol);
    bool isShowVert(const Vector4D &v) const;


    /// Resolve mol name, set m_nTgtMolID, listen the MolCoord events, and returns MolCoord object
    MolCoordPtr resolveMolIDImpl(const LString &name);

  };

}

#endif

