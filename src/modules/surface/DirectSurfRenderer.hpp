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

  using gfx::DisplayContext;
  using molstr::SelectionPtr;

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

    virtual void render(DisplayContext *pdl);

    virtual void propChanged(qlib::LPropEvent &ev);

    ///////////////////////////////////////////

    void invalidateMeshCache();

  private:
    /// make mesh cache using EDTSurf algorithm
    void buildMeshCacheEDTSurf();

    ///////////////
    // probe radius
  private:
    /// probe radius
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

  };

}

#endif // DIRECT_SURF_RENDERER_HPP_INCLUDED

