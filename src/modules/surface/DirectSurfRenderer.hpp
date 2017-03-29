// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer
//

#ifndef DIRECT_SURF_RENDERER_HPP_INCLUDED
#define DIRECT_SURF_RENDERER_HPP_INCLUDED

#include "surface.hpp"
#include "MSGeomTypes.hpp"

#include <modules/molstr/MolRenderer.hpp>

class DirectSurfRenderer_wrap;

namespace surface {

  using qlib::Vector4D;
  using gfx::ColorPtr;
  using gfx::DisplayContext;
  using molstr::MolCoordPtr;
  using molstr::SelectionPtr;
  //using molstr::AtomPosMap;

  /////////////////////////////////
  // Direct molecular surface renderer
  
  class DirectSurfRenderer : public molstr::MolRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::DirectSurfRenderer_wrap;

    typedef molstr::MolRenderer super_t;
    
  public:
    
    DirectSurfRenderer();
    virtual ~DirectSurfRenderer();

    virtual const char *getTypeName() const;

    ///////////////////////////////////////////

    virtual void preRender(DisplayContext *pdc);

    virtual void postRender(DisplayContext *pdc);

    virtual void render(DisplayContext *pdl);

    virtual void propChanged(qlib::LPropEvent &ev);

    ///////////////////////////////////////////

    void invalidateMeshCache();

  private:
    /// make mesh cache using EDTSurf algorithm
    void buildMeshCacheEDTSurf();


    ///////////////////////////////////////////
    // Properties

  private:
    /// Coloring mode
    int m_nMode;

  public:
    static const int DS_SCAPOT = 1;
    static const int DS_MOLFANC = 3;

    int getColorMode() const { return m_nMode; }
    void setColorMode(int n) {
      if (m_nMode!=n) {
        m_nMode = n;
        invalidateDisplayCache();
      }
    }

  private:
    /// Molecule object ID by which painting color is determined.
    /// (used in MOLFANC mode)
    qlib::uid_t m_nTgtMolID;
    
    /// Molecule object name by which painting color is determined.
    /// used in MOLFANC mode
    /// used if MolID cannot be resolved (when deserialized from qsc file...)
    LString m_sTgtMolName;

  public:
    /// Get reference molecule target (used in molecule mode)
    LString getTgtObjName() const;
    
    /// Set reference molecule target (used in molecule mode)
    void setTgtObjName(const LString &n);

    ///////////////
    // cull face

  private:
    /// cull face property value
    bool m_bCullFace;

  public:
    bool isCullFace() const { return m_bCullFace; }
    void setCullFace(bool b) {
      if (b!=m_bCullFace) {
        m_bCullFace = b;
        invalidateDisplayCache();
      }
    }

    ///////////////
    // probe radius

  private:
    /// probe radius property value
    double m_probeRadius;

  public:
    void setProbeRadius(double r) {
      if (qlib::isNear4(r, m_probeRadius))
        return;
      m_probeRadius = r;
      invalidateDisplayCache();
      invalidateMeshCache();
    }
    double getProbeRadius() const { return m_probeRadius; }

    // detail level
  private:
    /// detail level
    int m_nDetail;

  public:
    void setDetail(int n) {
      if (n==m_nDetail)
        return;
      m_nDetail = n;
      invalidateDisplayCache();
      invalidateMeshCache();
    }
    int getDetail() const { return m_nDetail; }

    ///////////////
    // surface type

  private:
    /// surface type
    int m_nSurfType;

  public:
    enum {
      DS_VDW,
      DS_SAS,
      DS_SES
    };

    void setSurfType(int n) {
      if (n==m_nSurfType)
        return;
      m_nSurfType = n;
      invalidateDisplayCache();
      invalidateMeshCache();
    }
    int getSurfType() const { return m_nSurfType; }

    ////////////////////////////////
    // surface calculation algorithm
  private:
    int m_nSurfAlgor;

  public:
    enum {
      DS_EDTSURF,
      DS_MSMS
    };

    void setSurfAlgor(int n) {
      if (n==m_nSurfAlgor)
        return;
      m_nSurfAlgor = n;
      invalidateDisplayCache();
      invalidateMeshCache();
    }
    int getSurfAlgor() const { return m_nSurfAlgor; }

    ////////////////////////////////
    // drawing mode (point/line/solid)
  private:

    /// drawing mode
    int m_nDrawMode;

  public:
    enum {
      SFDRAW_FILL = 0,
      SFDRAW_LINE = 1,
      SFDRAW_POINT = 2,
    };
    
    void setDrawMode(int n) {
      if (n==m_nDrawMode)
        return;
      m_nDrawMode = n;
      invalidateDisplayCache();
    }
    int getDrawMode() const { return m_nDrawMode; }

    ////////////////////////////////

  private:
    /// Line/Dot size in wireframe/dot mode
    double m_lw;

  public:

    void setLineWidth(double f) {
      if (qlib::isNear4(m_lw,f))
        return;
      m_lw = f;
      super_t::invalidateDisplayCache();
    }
    double getLineWidth() const { return m_lw; }

    ////////////////////////////////

  private:
    /// Selection for display
    SelectionPtr m_pShowSel;

  public:
    SelectionPtr getShowSel() const
    {
      return m_pShowSel;
    }
    
    void setShowSel(SelectionPtr pNewSel)
    {
      m_pShowSel = pNewSel;
      invalidateDisplayCache();
    }
    
    ////////////////////////////////
    // atom vdw radii

  private:

    double m_vdwr_H;
    double m_vdwr_C;
    double m_vdwr_N;
    double m_vdwr_O;
    double m_vdwr_S;
    double m_vdwr_P;
    double m_vdwr_X;

  private:

    ////////////////////////////////
    // cached surface mesh data
    MSVertArray m_verts;
    MSFaceArray m_faces;


  private:
    MolCoordPtr resolveMolIDImpl(const LString &name);

  public:
    virtual void objectChanged(qsys::ObjectEvent &ev);

  public:
    virtual void sceneChanged(qsys::SceneEvent &ev);

    ////////////////////////////////
    // for "potential" mode
  private:
    /// potentialmap object name by which painting color is determined.
    /// (used in ELEPOT mode)
    LString m_sTgtElePot;
  public:
    /// reference elepot target (used in potential mode)
    LString getTgtElePotName() const { return m_sTgtElePot; }
    void setTgtElePotName(const LString &n) {
      m_sTgtElePot = n;
      invalidateDisplayCache();
    }

  private:
    /// Color params in potential mode
    double m_dParLow;

    double m_dParMid;

    double m_dParHigh;

    ColorPtr m_colHigh;

    ColorPtr m_colMid;

    ColorPtr m_colLow;

    /// Ramp_above mode
    bool m_bRampAbove;

  public:
    double getLowPar() const { return m_dParLow; }
    void setLowPar(double d) {
      m_dParLow = d;
      if (m_nMode==DS_SCAPOT)
        invalidateDisplayCache();
    }

    double getMidPar() const { return m_dParMid; }
    void setMidPar(double d) {
      m_dParMid = d;
      if (m_nMode==DS_SCAPOT)
        invalidateDisplayCache();
    }

    double getHighPar() const { return m_dParHigh; }
    void setHighPar(double d) {
      m_dParHigh = d;
      if (m_nMode==DS_SCAPOT)
        invalidateDisplayCache();
    }

    ColorPtr getLowCol() const { return m_colLow; }
    void setLowCol(const ColorPtr &rc) {
      m_colLow = rc;
      if (m_nMode==DS_SCAPOT)
        invalidateDisplayCache();
    }

    ColorPtr getHighCol() const { return m_colHigh; }
    void setHighCol(const ColorPtr &rc) {
      m_colHigh = rc;
      if (m_nMode==DS_SCAPOT)
        invalidateDisplayCache();
    }

    ColorPtr getMidCol() const { return m_colMid; }
    void setMidCol(const ColorPtr &rc) {
      m_colMid = rc;
      if (m_nMode==DS_SCAPOT)
        invalidateDisplayCache();
    }

    bool isRampAbove() const { return m_bRampAbove; }
    void setRampAbove(bool val) {
      m_bRampAbove = val;
      if (m_nMode==DS_SCAPOT)
        invalidateDisplayCache();
    }

  };

}

#endif // DIRECT_SURF_RENDERER_HPP_INCLUDED

