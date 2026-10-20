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
/// The host renderer draws everything through tubeGpuBuilder(). tubeGpuPrepare() runs
/// the host's traversal (tubeGpuRenderMesh()) once in build mode to record the mesh
/// and allocate the primitive. After that, a change of the atom positions or
/// of the colors only re-runs the traversal in update mode and rewrites the
/// vertex data in place (no re-allocation, the index buffer is kept), as long
/// as the topology comes out the same; otherwise the mesh is rebuilt.
///
/// A host renderer inherits this next to its renderer base and
///  - calls tubeGpuBeginRend(pdl) from beginRend() (direct mode for a display
///    list or a file context),
///  - implements tubeGpuRenderMesh() as render(nullptr) and tubeGpuPreRender() /
///    tubeGpuPostRender() as its preRender() / postRender(),
///  - calls tubeGpuDisplay() / tubeGpuDisplayPick() from display() / displayPick(),
///    falling back to the display-list path when they return false,
///  - calls tubeGpuOnInvalidateDisplay() from invalidateDisplayCache(), wrapping
///    color-only changes in tubeGpuBeginColorOnly() / tubeGpuEndColorOnly(),
///  - calls tubeGpuOnAtomsMoved() from objectChanged() and skips the usual
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

    // State exposed for inspection/testing

    /// How the last tubeGpuPrepare() refreshed the mesh
    static constexpr int TG_PASS_NONE = 0;     ///< nothing to do
    static constexpr int TG_PASS_BUILD = 1;    ///< (re)built
    static constexpr int TG_PASS_SERIAL = 2;   ///< updated by the serial traversal
    static constexpr int TG_PASS_CHUNKED = 3;  ///< updated chunk by chunk (see tubeGpuLastParallel())
    int tubeGpuLastPass() const { return m_nLastPass; }
    /// True if the last chunked update ran its chunks in parallel
    bool tubeGpuLastParallel() const { return m_bParallel; }

    /// Below this many vertices the chunked update runs its chunks one after
    /// another on the calling thread: the work of a small mesh (a few ms or
    /// less) is smaller than the cost of waking the worker threads, which
    /// then spin looking for more work before they sleep (on the M4, about
    /// 6 ms of CPU per update for a 0.1 M vertex ribbon).
    static constexpr int TG_DEFAULT_PARALLEL_MIN_VERTS = 256 * 1024;
    static void setParallelMinVerts(int n) { s_nParallelMinVerts = n; }
    static int getParallelMinVerts() { return s_nParallelMinVerts; }

    /// The GPU primitive the mesh is drawn from.
    const gfx::TrigGpuPrim &tubeGpuPrim() const { return m_prim; }

protected:
    /// The drawing sink of the current traversal.
    TubeMeshBuilder &tubeGpuBuilder() { return m_mb; }

    /// Called at the start of the host's traversal: a non-null pdl (display
    /// list or file context) selects direct mode; with a null pdl the mode set
    /// by tubeGpuPrepare() is kept.
    void tubeGpuBeginRend(DisplayContext *pdl)
    {
        if (pdl != nullptr) m_mb.startDirect(pdl);
    }

    /// Run the host's traversal into tubeGpuBuilder() (i.e. render(nullptr)).
    virtual void tubeGpuRenderMesh() = 0;

    /// Scene ID used to resolve the colors.
    virtual qlib::uid_t tubeGpuSceneID() const = 0;

    /// Whether the host draws through the GPU mesh at all.
    virtual bool tubeGpuIsEnabled() const { return true; }

    /// Chunked (parallel) coordinate update. A host that records one chunk
    /// per independently drawable part (TubeMeshBuilder::beginChunk() /
    /// endChunk() around each segment in build mode) and can redraw a chunk
    /// without touching its own state returns true here; a coordinate-only
    /// update then redraws the chunks concurrently instead of re-running the
    /// traversal.
    virtual bool tubeGpuCanUpdateChunks() const { return false; }

    /// Work done once, serially, before the chunks are redrawn (e.g.
    /// recomputing the spline coeffs from the new positions).
    virtual void tubeGpuPrepareChunkUpdate() {}

    /// Redraw chunk i into pmb (may run concurrently for distinct chunks).
    virtual void tubeGpuUpdateChunk(int i, TubeMeshBuilder *pmb) {}

    /// The host's preRender() / postRender().
    virtual void tubeGpuPreRender(DisplayContext *pdc) = 0;
    virtual void tubeGpuPostRender(DisplayContext *pdc) = 0;

    /// display() of the host. Returns false if the host has to use its
    /// display-list path instead.
    bool tubeGpuDisplay(DisplayContext *pdc);

    /// displayPick() of the host (TrigGpuPrim switches to its pick program).
    /// Returns false if the host has to use its display-list path instead.
    bool tubeGpuDisplayPick(DisplayContext *pdc);

    /// To be called from the host's invalidateDisplayCache(): a color update
    /// inside a color-only scope, a full invalidation otherwise.
    void tubeGpuOnInvalidateDisplay();

    /// Mark the invalidations up to tubeGpuEndColorOnly() as color-only.
    void tubeGpuBeginColorOnly() { m_bColorOnly = true; }
    void tubeGpuEndColorOnly() { m_bColorOnly = false; }

    /// To be called from the host's objectChanged(): for an "atomsMoved"
    /// event while a mesh is in use, requests the in-place geometry update
    /// and returns true. The host then drops its position-derived caches
    /// (spline coeffs), sets the scene update flag and invalidates its
    /// hittest cache instead of invalidating the display cache.
    bool tubeGpuOnAtomsMoved(qsys::ObjectEvent &ev);

    /// Build or update the GPU mesh for pdc. Returns false if the host has to
    /// use its display-list path instead (file context, no shader).
    bool tubeGpuPrepare(DisplayContext *pdc);

    /// True if there is something to draw after tubeGpuPrepare().
    bool tubeGpuHasMesh() const { return m_bHasMesh; }

    /// Draw the prepared mesh (the pick pass included).
    void tubeGpuDraw(DisplayContext *pdc);

    /// Drop the mesh; the next tubeGpuPrepare() rebuilds it.
    void tubeGpuInvalidate();

    /// Request an in-place update (TubeMeshBuilder::UPD_GEOM / UPD_COLOR) of
    /// the current mesh. Returns false if there is no mesh to update, in which
    /// case the caller has to invalidate as usual.
    bool tubeGpuMarkDirty(int nFlags);

    /// True while a GPU mesh is built and in use.
    bool tubeGpuIsActive() const { return m_bTopoValid; }

    /// Release the GPU buffers (renderer unloading).
    void tubeGpuUnload();

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
    /// See tubeGpuLastPass()
    int m_nLastPass;
    /// Set by updateMesh() when the chunked update ran
    bool m_bChunked;
    /// Set by updateMesh() when the chunked update ran in parallel
    bool m_bParallel;

    static int s_nParallelMinVerts;

    void build(DisplayContext *pdc, int nPolyMode);

    /// Record the mesh by running the host's traversal in build mode.
    void buildMesh();

    /// Apply the pending in-place update (see tubeGpuMarkDirty) to the mesh
    /// in the primitive. Returns false if the traversal changed the topology.
    bool updateMesh();
};

}  // namespace molvis

#endif
