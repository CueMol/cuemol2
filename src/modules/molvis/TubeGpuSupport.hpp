// -*-Mode: C++;-*-
//
//  GPU mesh support for the tube-like renderers
//

#ifndef MOLVIS_TUBE_GPU_SUPPORT_HPP_INCLUDED
#define MOLVIS_TUBE_GPU_SUPPORT_HPP_INCLUDED

#include "molvis.hpp"
#include "TubeMeshBuilder.hpp"

#include <gfx/TrigGpuPrim.hpp>

namespace qsys {
class ObjectEvent;
}

namespace molvis {

///
/// Draws a tube-like renderer from a TrigGpuPrim it fills directly, instead
/// of compiling a display list.
///
/// The host renderer draws everything through tgBuilder(). tgPrepare() runs
/// the host's traversal (tgRenderMesh()) once in build mode to record the mesh
/// and allocate the primitive. After that, a change of the atom positions or
/// of the colors only re-runs the traversal in update mode and rewrites the
/// vertex data in place (no re-allocation, the index buffer is kept), as long
/// as the topology comes out the same; otherwise the mesh is rebuilt.
///
/// A host renderer inherits this next to its renderer base and
///  - calls tgBeginRend(pdl) from beginRend() (direct mode for a display
///    list or a file context),
///  - implements tgRenderMesh() as render(nullptr) and tgPreRender() /
///    tgPostRender() as its preRender() / postRender(),
///  - calls tgDisplay() / tgDisplayPick() from display() / displayPick(),
///    falling back to the display-list path when they return false,
///  - calls tgOnInvalidateDisplay() from invalidateDisplayCache(), wrapping
///    color-only changes in tgBeginColorOnly() / tgEndColorOnly(),
///  - calls tgOnAtomsMoved() from objectChanged() and skips the usual
///    invalidation when it returns true.
///
class MOLVIS_API TubeGpuSupport
{
public:
    TubeGpuSupport();
    /// A copy starts without GPU state (the primitive owns GPU buffers).
    TubeGpuSupport(const TubeGpuSupport &);
    TubeGpuSupport &operator=(const TubeGpuSupport &) = delete;
    virtual ~TubeGpuSupport();

    // Mesh access without a DisplayContext (exposed for inspection/testing)

    /// Record the mesh by running the host's traversal in build mode (no GPU
    /// primitive is touched).
    void tgBuildMesh();

    /// Apply the pending in-place update (see tgMarkDirty) to the recorded
    /// mesh. Returns false if the traversal changed the topology.
    bool tgUpdateMesh();

    /// The recorded mesh.
    const TubeMeshBuilder &tgMesh() const { return m_mb; }

protected:
    /// The drawing sink of the current traversal.
    TubeMeshBuilder &tgBuilder() { return m_mb; }

    /// Called at the start of the host's traversal: a non-null pdl (display
    /// list or file context) selects direct mode; with a null pdl the mode set
    /// by tgPrepare() is kept.
    void tgBeginRend(DisplayContext *pdl)
    {
        if (pdl != nullptr) m_mb.startDirect(pdl);
    }

    /// Run the host's traversal into tgBuilder() (i.e. render(nullptr)).
    virtual void tgRenderMesh() = 0;

    /// Scene ID used to resolve the colors.
    virtual qlib::uid_t tgSceneID() const = 0;

    /// Whether the host draws through the GPU mesh at all.
    virtual bool tgIsEnabled() const { return true; }

    /// The host's preRender() / postRender().
    virtual void tgPreRender(DisplayContext *pdc) = 0;
    virtual void tgPostRender(DisplayContext *pdc) = 0;

    /// display() of the host. Returns false if the host has to use its
    /// display-list path instead.
    bool tgDisplay(DisplayContext *pdc);

    /// displayPick() of the host (TrigGpuPrim switches to its pick program).
    /// Returns false if the host has to use its display-list path instead.
    bool tgDisplayPick(DisplayContext *pdc);

    /// To be called from the host's invalidateDisplayCache(): a color update
    /// inside a color-only scope, a full invalidation otherwise.
    void tgOnInvalidateDisplay();

    /// Mark the invalidations up to tgEndColorOnly() as color-only.
    void tgBeginColorOnly() { m_bColorOnly = true; }
    void tgEndColorOnly() { m_bColorOnly = false; }

    /// To be called from the host's objectChanged(): for an "atomsMoved"
    /// event while a mesh is in use, requests the in-place geometry update
    /// and returns true. The host then drops its position-derived caches
    /// (spline coeffs), sets the scene update flag and invalidates its
    /// hittest cache instead of invalidating the display cache.
    bool tgOnAtomsMoved(qsys::ObjectEvent &ev);

    /// Build or update the GPU mesh for pdc. Returns false if the host has to
    /// use its display-list path instead (file context, no shader).
    bool tgPrepare(DisplayContext *pdc);

    /// True if there is something to draw after tgPrepare().
    bool tgHasMesh() const { return m_bHasMesh; }

    /// Draw the prepared mesh (the pick pass included).
    void tgDraw(DisplayContext *pdc);

    /// Drop the mesh; the next tgPrepare() rebuilds it.
    void tgInvalidate();

    /// Request an in-place update (TubeMeshBuilder::UPD_GEOM / UPD_COLOR) of
    /// the current mesh. Returns false if there is no mesh to update, in which
    /// case the caller has to invalidate as usual.
    bool tgMarkDirty(int nFlags);

    /// True while a GPU mesh is built and in use.
    bool tgIsActive() const { return m_bTopoValid; }

    /// Release the GPU buffers (renderer unloading).
    void tgUnload();

private:
    TubeMeshBuilder m_mb;
    gfx::TrigGpuPrim m_prim;

    bool m_bCheckShader;
    bool m_bUseShader;

    /// The recorded mesh and the primitive are valid
    bool m_bTopoValid;
    /// The primitive holds faces to draw
    bool m_bHasMesh;
    /// Pending in-place update flags
    int m_nDirty;
    /// Polygon mode the primitive was allocated for
    int m_nPolyMode;
    /// Inside a color-only invalidation scope
    bool m_bColorOnly;

    void build(DisplayContext *pdc, int nPolyMode);
};

}  // namespace molvis

#endif
