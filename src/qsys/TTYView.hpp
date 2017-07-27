// -*-Mode: C++;-*-
//
// TTYView: dummy view for CLI app mode
//

#ifndef QSYS_TTYVIEW_HPP_INCLUDE_
#define QSYS_TTYVIEW_HPP_INCLUDE_

#include "qsys.hpp"
#include "View.hpp"
#include <gfx/DisplayContext.hpp>

namespace qsys {

  class QSYS_API TTYDisplayContext : public gfx::DisplayContext
  {
  private:
    typedef gfx::DisplayContext super_t;

  public:
    TTYDisplayContext() {}
    virtual ~TTYDisplayContext();

    virtual bool setCurrent();
    virtual bool isCurrent() const;
    virtual bool isFile() const;

    virtual void vertex(const qlib::Vector4D &);
    virtual void normal(const qlib::Vector4D &);
    virtual void color(const gfx::ColorPtr &c);

    virtual void pushMatrix();
    virtual void popMatrix();
    virtual void multMatrix(const qlib::Matrix4D &mat);
    virtual void loadMatrix(const qlib::Matrix4D &mat);

    virtual void setPolygonMode(int id);
    virtual void startPoints();
    virtual void startPolygon();
    virtual void startLines();
    virtual void startLineStrip();
    virtual void startTriangles();
    virtual void startTriangleStrip();
    virtual void startTriangleFan();
    virtual void startQuadStrip();
    virtual void startQuads();
    virtual void end();
  };

  class TTYView : public View
  {
  private:
    TTYDisplayContext *m_pCtxt;
  public:

    TTYView() : m_pCtxt(new TTYDisplayContext()) {}

    TTYView(const TTYView &r) {}

    virtual ~TTYView();
  
    //////////
  
  public:
    virtual LString toString() const;

    /// Setup the projection matrix for stereo (View interface)
    virtual void setUpModelMat(int nid);
    
    /// Setup projection matrix (View interface)
    virtual void setUpProjMat(int w, int h);
    
    /// Draw current scene
    virtual void drawScene();
    
    virtual gfx::DisplayContext *getDisplayContext();

  };

}

#endif
