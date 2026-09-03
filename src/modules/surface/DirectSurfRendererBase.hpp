// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer: shared base of dsurface and dsurf2
//
//  Owns the properties, the display-list render path and the per-vertex
//  colour resolution both renderers share. Subclasses supply the mesh
//  builder (EDTSurf or distance field); dsurf2 adds a GPU draw path that
//  colours through the same resolver.
//

#ifndef DIRECT_SURF_RENDERER_BASE_HPP_INCLUDED
#define DIRECT_SURF_RENDERER_BASE_HPP_INCLUDED

#include "surface.hpp"
#include "MSGeomTypes.hpp"
#include "ScalarColorSupport.hpp"

#include <modules/molstr/MolRenderer.hpp>

class DirectSurfRendererBase_wrap;

namespace qsys { class ScalarObject; }

namespace surface {

  using qlib::Vector4D;
  using gfx::ColorPtr;
  using gfx::DisplayContext;
  using molstr::MolCoordPtr;
  using molstr::MolAtomPtr;
  using molstr::SelectionPtr;

  class SURFACE_API DirectSurfRendererBase : public molstr::MolRenderer,
                                            public ScalarColorSupport
  {
    MC_SCRIPTABLE;

    friend class ::DirectSurfRendererBase_wrap;

    typedef molstr::MolRenderer super_t;

  public:

    DirectSurfRendererBase();
    ~DirectSurfRendererBase() override;

    ///////////////////////////////////////////
    // DispListRenderer implementation

    void preRender(DisplayContext *pdc) override;

    void postRender(DisplayContext *pdc) override;

    /// Display-list / file-export path: colour the cached mesh and draw it.
    void render(DisplayContext *pdl) override;

    void propChanged(qlib::LPropEvent &ev) override;

    /// Drop the cached surface mesh; subclasses also drop data derived from it.
    virtual void invalidateMeshCache();

    ///////////////////////////////////////////
    // Properties

  private:
    /// Coloring mode
    int m_nMode;

  public:
    enum {
      DS_SCAPOT = 1,
      DS_MOLFANC = 3,
      DS_MULTIGRAD = 4,
    };

    int getColorMode() const { return m_nMode; }
    void setColorMode(int n) {
      if (m_nMode!=n) {
        m_nMode = n;
        invalidateDisplayCache();
      }
    }

    /// The scalar colouring the current colormode selects.
    ScalarMode scaMode() const {
      if (m_nMode==DS_SCAPOT) return SCM_RAMP;
      if (m_nMode==DS_MULTIGRAD) return SCM_MULTIGRAD;
      return SCM_NONE;
    }

    bool isScalarColorMode() const { return scaMode()!=SCM_NONE; }

    /// get color-map object (valid in multigrad mode)
    qsys::ObjectPtr getColorMapObj() const;

  private:
    /// Reference molecule name from old scene files. Kept so the property
    /// round-trips; never consulted (colours come from the client molecule).
    LString m_sTgtMolName;

  public:
    LString getTgtObjName() const { return m_sTgtMolName; }
    void setTgtObjName(const LString &n) { m_sTgtMolName = n; }

    ///////////////
    // cull face

  private:
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

  protected:
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

    ///////////////
    // detail level

  protected:
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

  protected:
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
    // drawing mode (point/line/solid)

  private:
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
    SelectionPtr getShowSel() const { return m_pShowSel; }
    void setShowSel(SelectionPtr pNewSel) {
      m_pShowSel = pNewSel;
      onShowSelChanged();
    }

    ////////////////////////////////
    // atom vdw radii (member-direct properties)

  protected:
    double m_vdwr_H;
    double m_vdwr_C;
    double m_vdwr_N;
    double m_vdwr_O;
    double m_vdwr_S;
    double m_vdwr_P;
    double m_vdwr_X;

    ////////////////////////////////
    // cached surface mesh data

    MSVertArray m_verts;
    MSFaceArray m_faces;

    /// Fill m_verts / m_faces for the client molecule (MSVert::info = atom id).
    virtual void buildMeshCache() = 0;

    /// Build the mesh cache when it is empty.
    void ensureMeshCache();

    /// showsel changed: the default redraws, dsurf2 also drops its GPU primitive.
    virtual void onShowSelChanged();

    /// ScalarColorSupport hook: redraw when a scalar colour mode is active.
    void scalarColorPropChanged() override;

    ////////////////////////////////
    // per-vertex colour resolution (shared by the DL and GPU paths)

    struct VertexColorEnv {
      MolCoordPtr pMol;
      qsys::ScalarObject *pSca = NULL;
      ScalarMode scaMode = SCM_NONE;
    };

    /// Start the colouring schemes and resolve the scalar object for a pass.
    void beginVertexColors(VertexColorEnv &env);

    /// Whether v is drawn under showsel; also returns its atom (may be null).
    bool isVertexShown(const VertexColorEnv &env, const MSVert &v,
                       MolAtomPtr &pAtom) const;

    /// Colour of a shown vertex; false when nothing resolves, in which case
    /// the caller paints defaultcolor.
    bool resolveVertexColor(VertexColorEnv &env, const MSVert &v,
                            const MolAtomPtr &pAtom, ColorPtr &rcol);

    /// End the colouring schemes started by beginVertexColors().
    void endVertexColors(VertexColorEnv &env);

  };

}

#endif // DIRECT_SURF_RENDERER_BASE_HPP_INCLUDED
