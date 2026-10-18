// -*-Mode: C++;-*-
//
//  Renderer base of the tube-like renderers drawn from the GPU mesh
//

#ifndef MOLVIS_TUBE_GPU_RENDERER_HPP_INCLUDED
#define MOLVIS_TUBE_GPU_RENDERER_HPP_INCLUDED

#include "molvis.hpp"
#include "TubeGpuSupport.hpp"

#include <gfx/DisplayContext.hpp>
#include <qlib/LPropEvent.hpp>
#include <qsys/ObjectEvent.hpp>
#include <qsys/Scene.hpp>

namespace molvis {

///
/// Puts a renderer base (SplineRenderer, MainChainRenderer) on the GPU mesh
/// of TubeGpuSupport: display / pick from the mesh (falling back to the
/// base's display-list path), in-place updates on atom moves and on
/// coloring changes, full invalidation otherwise.
///
/// A host derives from TubeGpuRenderer<Base> instead of Base and implements
/// only what is its own: the properties that change the shape (calling
/// invalidateDisplayCache()) and tubeGpuOnMovedAtoms() for its
/// position-derived caches. A host that overrides objectChanged() calls
/// tubeGpuHandleAtomsMoved() first.
///
template <class Base>
class TubeGpuRenderer : public Base, public TubeGpuSupport
{
public:
    void display(DisplayContext *pdc) override
    {
        if (!tubeGpuDisplay(pdc)) Base::display(pdc);
    }

    /// The pick pass draws the same mesh with the pick program
    void displayPick(DisplayContext *pdc) override
    {
        if (!tubeGpuDisplayPick(pdc)) Base::displayPick(pdc);
    }

    void invalidateDisplayCache() override
    {
        tubeGpuOnInvalidateDisplay();
        Base::invalidateDisplayCache();
    }

    void objectChanged(qsys::ObjectEvent &ev) override
    {
        if (tubeGpuHandleAtomsMoved(ev)) return;
        Base::objectChanged(ev);
    }

    void propChanged(qlib::LPropEvent &ev) override
    {
        if (isColoringProp(ev)) {
            // Only the colors change: the invalidateDisplayCache() calls turn
            // into an in-place color update of the GPU mesh
            tubeGpuBeginColorOnly();
            invalidateDisplayCache();
            Base::propChanged(ev);
            tubeGpuEndColorOnly();
            return;
        }
        Base::propChanged(ev);
    }

    void unloading() override
    {
        tubeGpuUnload();
        Base::unloading();
    }

protected:
    /// A change of the coloring (only the colors change). A host whose own
    /// property checks could match a coloring property passes these to
    /// TubeGpuRenderer::propChanged() first.
    static bool isColoringProp(qlib::LPropEvent &ev)
    {
        return ev.getParentName().equals("coloring") ||
               ev.getParentName().startsWith("coloring.");
    }

    /// For an "atomsMoved" event while a mesh is in use: request the in-place
    /// geometry update, drop the host's position-derived caches, request a
    /// redraw and drop the hittest cache, and return true (the display cache
    /// is kept). Returns false for any other event.
    bool tubeGpuHandleAtomsMoved(qsys::ObjectEvent &ev)
    {
        if (!tubeGpuOnAtomsMoved(ev)) return false;
        tubeGpuOnMovedAtoms();
        qsys::ScenePtr pScene = this->getScene();
        if (!pScene.isnull()) pScene->setUpdateFlag();
        this->invalidateHittestCache();
        return true;
    }

    /// The atoms moved and the mesh is updated in place: drop the host's
    /// position-derived caches.
    virtual void tubeGpuOnMovedAtoms() {}

    void tubeGpuRenderMesh() override { this->render(nullptr); }
    qlib::uid_t tubeGpuSceneID() const override { return this->getSceneID(); }
    void tubeGpuPreRender(DisplayContext *pdc) override { this->preRender(pdc); }
    void tubeGpuPostRender(DisplayContext *pdc) override { this->postRender(pdc); }
};

}  // namespace molvis

#endif
