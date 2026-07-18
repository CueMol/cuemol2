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

    ~TTYView() override;

    //////////

public:
    LString toString() const override;

    /// Setup the projection matrix for stereo (View interface)
    void setUpModelMat(int nid) override;

    /// Setup projection matrix (View interface)
    void setUpProjMat(int w, int h) override;

    /// Draw current scene
    void drawScene() override;

    gfx::DisplayContext *getDisplayContext() override;
};
}  // namespace qsys

#endif
