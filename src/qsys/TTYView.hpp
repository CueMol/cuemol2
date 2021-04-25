// -*-Mode: C++;-*-
//
// View: Abstract object for the view
//
// $Id: View.hpp,v 1.49 2011/03/18 05:53:45 rishitani Exp $
//

#ifndef QSYS_TTY_VIEW_HPP_INCLUDE_
#define QSYS_TTY_VIEW_HPP_INCLUDE_

#include "Scene.hpp"
#include "View.hpp"
#include "qsys.hpp"

namespace qsys {

class TTYDisplayContext;

class QSYS_API TTYView : public qsys::View
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
}  // namespace qsys

#endif
