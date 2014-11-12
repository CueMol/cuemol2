// -*-Mode: C++;-*-
//
// OpenGL View implementation
//
// $Id: OglView.hpp,v 1.16 2011/03/13 12:02:45 rishitani Exp $
//

#ifndef OPENGL_VIEW_HPP_INCLUDE_
#define OPENGL_VIEW_HPP_INCLUDE_

#include "sysdep.hpp"

#include <qsys/qsys.hpp>
#include <qsys/View.hpp>
#include "OglHitData.hpp"

namespace sysdep {

  class QSYS_API OglView : public qsys::View
  {
  protected:
    bool m_bInitOK;

    GLUquadricObj *m_pqua;

    bool m_bUseGlShader;

  public:

    OglView();

    OglView(const OglView &r);

    virtual ~OglView();
  
    //////////
  
  public:
    virtual LString toString() const;

    void setup();

    ///////////////////////////////

    /*
    /// set zoom factor (override View's impl.)
    virtual void setZoom(double f);
    
    /// set zoom factor (override View's impl.)
    virtual void setViewDist(double f);

    /// set slab depth (override View's impl.)
    virtual void setSlabDepth(double d);
    
    /// Set perspective flag (override View's impl.)
    virtual void setPerspec(bool d);
    
    virtual void setStereoMode(int nMode);
     */

    ///////////////////////////////

    /// Setup the light source color
    void setUpLightColor();
    
    /// Setup the projection matrix for stereo (View interface)
    virtual void setUpModelMat(int nid);
    
    /// Setup projection matrix (View interface)
    virtual void setUpProjMat(int w, int h);
    
    /// Draw current scene
    virtual void drawScene();
    
    /// Clean-up the drawing display with the current bg color
    virtual void clear();

    ////////////////////////////////////////////////
    // Hit test operations

  private:
    GlHitData m_hitdata;

    /// Setup the projection matrix for hit-testing
    /// @param far_factor factor of far slab limitation (1.0 for the same as display)
    void setUpHitProjMat(gfx::DisplayContext *pdc, const Vector4D &, double far_factor);
    
    /// Hit-test implementation
    /// @param pdc display context attached to the hittest buffer
    /// @parm 4D vector containing: (screen X, screen Y, X-hit precision, Y-hit precision)
    /// @fGetAll If true, all of the hit elements are returned. Otherwise, only the nearest hit is returned.
    /// @far_factor factor of far slab limitation (1.0 for the same as display)
    bool hitTestImpl(gfx::DisplayContext *pdc, const Vector4D &parm, bool fGetAll, double far_factor);

  public:
    virtual LString hitTest(int x, int y);
    
    virtual LString hitTestRect(int x, int y, int w, int h, bool bNr);

    ////////////////////////////////////////////////
    // Framebuffer operations
    
    /// Create a new off-screen view compatible with this view
    virtual View *createOffScreenView(int w, int h, int aa_depth);

    virtual void readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize, int ncomp);
    
    // virtual void readObj(qlib::ObjInStream &dis);
    
    ////////////////////////////////////////////////
    // implementation

    /// set GL Shader flag (only valid before calling setup())
    void setUseGlShader(bool f) {
      m_bUseGlShader = f;
    }


  protected:
    void setFogColorImpl();

  };

}

#endif
