// -*-Mode: C++;-*-
//
// GUIView.hpp
// View class for GUI system
//

#pragma once

#include "qsys.hpp"
#include "View.hpp"
#include "MouseEventHandler.hpp"
#include "InDevEvent.hpp"
#include <gfx/Hittest.hpp>

namespace gfx {
class RenderTarget;
struct AoConstants;
struct PickTexel;
}  // namespace gfx

namespace qsys {

class FrameRenderPipeline;

class QSYS_API GUIView : public qsys::View
{
    MC_SCRIPTABLE;

    using super_t = qsys::View;

public:
    GUIView();
    ~GUIView() override;

    //////////
    // Mouse events

    /// Mouse event dispatch types (platform-agnostic abstraction over native events)
    enum {
        DME_MOUSE_DOWN = 0,
        DME_MOUSE_MOVE = 1,
        DME_MOUSE_UP = 2,
        DME_WHEEL = 3,
        DME_DBCHK_TIMEUP = 4
    };

    /// Dispatch a native mouse event through the MouseEventHandler state machine
    /// and fire the resulting InDevEvent to listeners.
    void dispatchMouseEvent(int nType, InDevEvent &ev);

    void setupInDevEvent(double clientX, double clientY, double screenX, double screenY,
                         int amodif, InDevEvent &ev);

    void onMouseDown(double clientX, double clientY, double screenX, double screenY,
                     int modif);
    void onMouseUp(double clientX, double clientY, double screenX, double screenY,
                   int modif);

    void onMouseMove(double clientX, double clientY, double screenX, double screenY,
                     int modif);

    void onWheel(double clientX, double clientY, double screenX, double screenY,
                 int modif, double deltaX, double deltaY);

    void onGesture(double clientX, double clientY, double screenX, double screenY,
                   int modif, int axisID, double delta);

    //////////

    void setCenterMark(int nMode) override;

    /// Setup the projection matrix
    void setUpProjMat(int cx, int cy) override;

    /// Setup the light source color
    void setUpLightColor();

    /// Setup the projection matrix for stereo (View interface)
    void setUpModelMat(int nid) override;

    void drawScene() override;

    /// Keep redrawing on idle while temporal-jitter accumulation is unfinished,
    /// or while a full-resolution AO follow-up is owed after a half-res
    /// (camera-moving) frame (adaptive aoHalfRes).
    bool needsContinuousRedraw() const override
    {
        return m_jitterMoreSamples || m_aoHalfPending;
    }

    /// Force a redraw and restart any temporal-jitter accumulation (used when
    /// the scene content changes via the scene-level update flag).
    void forceRedraw() override;

    /// View size changed: the pick ID buffer must be re-rendered.
    void sizeChanged(int cx, int cy) override;

    /// Release GPU resources (incl. AO render targets) while the GL context is
    /// still alive, before the display context is torn down.
    void unloading() override;

    /// Clean-up the drawing display with the current bg color
    virtual void clear();

    ////////////////////////////////////////////////
    // Hit test operations

public:
    LString hitTest(int x, int y) override;

    LString hitTestRect(int x, int y, int w, int h, bool bNr) override;

    qlib::LScrVector4D projToScreen(const qlib::Vector4D &wpos) override;

    LString hitTestPolygon(qlib::LByteArrayPtr pts, bool bNearest) override;

    /// True when hitTest() uses the GPU ID-buffer pick pass: the backend
    /// supports it (View::hasGpuPick), the user has not switched it off
    /// (ViewInputConfig::gpu_pick) and the view is not in a stereo mode.
    bool isGpuPickActive() const;

    /// Convert one non-empty pick texel (R = 1-based index into rendTab,
    /// G = encoded element name, B = encoded outer name) into a HitData entry
    /// (name list = [outer,] element). Returns false if the texel is invalid.
    /// Static and GL-free so it can be unit-tested.
    static bool pickTexelToHitData(gfx::HitData &hd,
                                   const std::vector<qlib::uid_t> &rendTab,
                                   const gfx::PickTexel &texel);

protected:
    MouseEventHandler m_meh;

private:
    gfx::HitData m_hitdata;

    /// Hit-test implementation
    /// @param pdc display context attached to the hittest buffer
    /// @parm 4D vector containing: (screen X, screen Y, X-hit precision, Y-hit
    /// precision)
    /// @fGetAll If true, all of the hit elements are returned.
    ///   Otherwise, only the nearest hit is returned.
    /// @far_factor factor of far slab limitation (1.0 for the same as display)
    /// @bCpuOnly skip renderers covered by the GPU pick pass
    bool hitTestImpl(gfx::DisplayContext *pdc, const Vector4D &parm, bool fGetAll,
                     double far_factor, bool bCpuOnly = false);

    /// Build the JSON hit result for the nearest renderer in m_hitdata.
    LString formatHitResult(qlib::uid_t rend_id);

    ////////////////////////////////////////////////
    // GPU ID-buffer picking (View::hasGpuPick())

    /// Integer pick target (RGBA32UI + depth) at PICK_SCALE of the backing
    /// size. Created lazily on the first hit test; released in unloading().
    gfx::RenderTarget *m_pPickRT = nullptr;

    /// True when the pick target does not reflect the last drawn frame.
    bool m_bPickDirty = true;

    /// Renderer uid table of the last pick pass (R channel is 1-based index).
    std::vector<qlib::uid_t> m_pickRendTab;

    /// Pick target size relative to the backing (device pixel) size.
    static constexpr double PICK_SCALE = 0.5;

    bool ensurePickTarget(int pw, int ph);
    void releasePickBuffer();

    /// Re-render the pick target if dirty. Returns false when the GPU path is
    /// unavailable (no target / no context); the caller falls back to CPU.
    bool renderPickBuffer();

    /// GPU pick at logical pixel (ax, ay). Returns false when the GPU path is
    /// unavailable; on success rend_id is the hit renderer (invalid_uid = miss)
    /// and m_hitdata holds the hit.
    bool hitTestGpu(int ax, int ay, qlib::uid_t &rend_id);

    ////////////////////////////////////////////////
    // Framebuffer operations

public:
    /// Create a new off-screen view compatible with this view
    View *createOffScreenView(int w, int h, int aa_depth) override;

    void readPixels(int x, int y, int width, int height, char *pbuf,
                            int nbufsize, int ncomp) override;

    void setFogColorImpl(DisplayContext *pdc);

    ////////////////////////////////////////////////
    // Screen-space ambient occlusion (GTAO) live path

private:
    /// Off-screen multi-pass pipeline (owns the AO/AA/jitter render targets +
    /// the fullscreen post-process primitive). Lazily created on first use (the
    /// display context is not valid in the GUIView constructor). Owned.
    FrameRenderPipeline *m_pPipeline = nullptr;

    /// Temporal-jitter state. sampleIndex counts accumulated samples; when
    /// moreSamples is true the view keeps redrawing on idle (needsContinuousRedraw)
    /// until converged. resetRequested forces a restart (set on forceRedraw, i.e.
    /// scene-content changes; camera changes are caught via getUpdateFlag()).
    int m_jitterSampleIndex = 0;
    bool m_jitterMoreSamples = false;
    bool m_jitterResetRequested = false;
    /// Current sample's sub-pixel offset (backing pixels), applied in setUpProjMat.
    double m_jitterPxX = 0.0;
    double m_jitterPxY = 0.0;

    /// Adaptive aoHalfRes: set when the AO term was rendered at half resolution
    /// this frame (camera moving). It keeps the idle loop alive for one more
    /// frame so the still image is re-rendered at full resolution.
    bool m_aoHalfPending = false;

    /// Lazily create the off-screen pipeline (needs a valid display context) and
    /// (re)size its render targets to the given backing-pixel size. When halfRes
    /// is true the GTAO term targets are allocated at half resolution; when
    /// aoEnabled is false the AO-specific targets are not allocated at all
    /// (AA-only pipeline).
    void ensurePipeline(int w, int h, bool halfRes, bool aoEnabled);

    /// Compute the view-space reconstruction constants for the GTAO passes from
    /// the current camera (perspective). Mirrors setUpProjMat's slab derivation.
    gfx::AoConstants computeAoConstants() const;

  protected:
    /// Set the sub-pixel jitter offset (in backing pixels) applied to the
    /// projection by setUpProjMat. Used by the off-screen exporter per sample.
    void setJitterOffsetPx(double px, double py)
    {
        m_jitterPxX = px;
        m_jitterPxY = py;
    }

    /// Render one frame's final 3D color into outRT: the scene with the scene's
    /// AO applied (GTAO -> denoise -> composite), or the plain scene when AO is
    /// off/unavailable. No spatial post-AA (FXAA/SMAA) and no UI overlay. The
    /// projection (including any jitter offset) and GL context must be set by the
    /// caller; this sets the model matrix and manages the off-screen targets.
    /// Used by the off-screen exporter, which wraps it with jitter accumulation.
    /// Returns true if AO was applied. bgTransparent clears the background alpha
    /// to 0 (for transparent capture).
    bool renderAOColorFrame(gfx::DisplayContext *pdc, const ScenePtr &pScene,
                            gfx::RenderTarget *outRT, bool bgTransparent,
                            float aoNoiseOffset = 0.0f);
};

}  // namespace qsys
