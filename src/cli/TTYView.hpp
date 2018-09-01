// -*-Mode: C++;-*-
//
// View: Abstract object for the view
//
// $Id: View.hpp,v 1.49 2011/03/18 05:53:45 rishitani Exp $
//

#ifndef CLI_TTY_VIEW_HPP_INCLUDE_
#define CLI_TTY_VIEW_HPP_INCLUDE_

#include <qsys/qsys.hpp>
#include <qsys/View.hpp>
#include <qsys/Scene.hpp>

namespace cli {

  class TTYDisplayContext;

  class TTYView : public qsys::View
  {
  private:
    TTYDisplayContext *m_pCtxt;
  public:

    TTYView();

    TTYView(const TTYView &r);

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

