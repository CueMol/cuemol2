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
    /// while a full-resolution AO follow-up is owed after a half-res
    /// (camera-moving) frame (adaptive aoHalfRes), or while a present-only
    /// frame is owed because the hover highlight changed.
    bool needsContinuousRedraw() const override
    {
        return m_jitterMoreSamples || m_aoHalfPending || m_bPresentDirty;
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

    ////////////////////////////////////////////////
    // Hover highlight (screen-space overlay from the GPU pick buffer)

    /// Remember the element under the pointer (a hitTest result's rend_id /
    /// atom_id / symm_id; symm_id = -1 when not through a *symm renderer) and
    /// schedule a present-only frame that overlays its highlight. No-op when
    /// the value is unchanged; without the GPU pick pass only the state is kept.
    void setHoverHit(int rend_id, int atom_id, int symm_id) override;
    void clearHoverHit() override;

    /// Inputs of the per-frame decision (GL-free, unit-tested).
    struct FrameFlags
    {
        /// The hover highlight changed since the last frame (setHoverHit).
        bool presentDirty = false;
        /// View::getUpdateFlag(): camera / size changed.
        bool updateFlag = false;
        /// forceRedraw: scene content changed.
        bool jitterReset = false;
        /// Temporal jitter is still accumulating samples.
        bool jitterMore = false;
        /// A full-resolution AO follow-up frame is owed.
        bool aoHalfPending = false;
        /// The last regular frame went through the pipeline and can be
        /// re-presented (FrameRenderPipeline::presentLast).
        bool frameCached = false;
    };
    struct FramePlan
    {
        /// Re-present the cached frame with the overlay; no scene / pick pass.
        bool presentOnly = false;
        /// Scene or camera changed: restart jitter, invalidate the pick buffer.
        bool sceneChanged = false;
        /// A present-only frame was requested but cannot be served: restart the
        /// jitter accumulation so a regular frame of an unchanged scene does not
        /// add a converged sample once more.
        bool restartJitter = false;
    };
    static FramePlan planFrame(const FrameFlags &f);

    /// Slab planes of a camera (near / far clip and the fog range) as
    /// setUpProjMat derives them. bPickProj selects the pick-pass far clip,
    /// the fog end (centre + slab/2, beyond which nothing is visible), instead
    /// of the display one (centre + slab depth). GL-free, unit-tested.
    static void computeSlabPlanes(double dist, double slabdepth, bool bPickProj,
                                  double &slabnear, double &slabfar, double &fognear,
                                  double &fogfar);

    /// Map a hovered element to the pick texel it was drawn with: (1-based
    /// index of rendUid in rendTab, encodeHitName(atomId), encodeHitName(symmId)).
    /// Returns false when the element cannot be in the pick buffer (no atom, or
    /// the renderer was not in the last pick pass: CPU-only, hidden, deleted).
    static bool hoverIdToPickId(qlib::uid_t rendUid, int atomId, int symmId,
                                const std::vector<qlib::uid_t> &rendTab, int out[3]);

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

    /// True while setUpProjMat builds the pick-pass projection (far clip at
    /// the fog end, see computeSlabPlanes); set and restored by renderPickBuffer.
    bool m_bPickProj = false;

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
    // Hover highlight state

    qlib::uid_t m_hoverRendUid = qlib::invalid_uid;
    int m_hoverAtomId = -1;
    int m_hoverSymmId = -1;
    bool m_bHoverSet = false;

    /// The highlight changed since the last frame: a present-only frame is owed.
    bool m_bPresentDirty = false;

    /// The last regular frame went through the pipeline (its final stage can be
    /// replayed by FrameRenderPipeline::presentLast); false after a direct
    /// (plain) frame.
    bool m_bFrameCached = false;

    /// Soft (Gaussian-blurred) mask of the hovered element at pick resolution:
    /// [0] after the horizontal pass, [1] final. RGBA8 LINEAR so the overlay
    /// upsamples it bilinearly. Rebuilt only when the pick buffer (serial), the
    /// hovered element or the blur size changed.
    gfx::RenderTarget *m_pHoverMaskRT[2] = {nullptr, nullptr};
    bool m_bHoverMaskValid = false;
    /// Incremented by every pick pass; the mask remembers the one it used.
    unsigned int m_pickSerial = 0;
    unsigned int m_hoverMaskSerial = 0;
    int m_hoverMaskId[3] = {0, 0, 0};
    float m_hoverMaskSigma = 0.0f;

    bool ensureHoverMaskTargets(int pw, int ph);
    void releaseHoverMaskTargets();

    /// A hovered element is set and the GPU pick pass (its ID source) is active.
    bool isHoverHighlightActive() const;

    /// Overlay the hovered element's highlight onto the default framebuffer,
    /// reading the pick buffer (rendered first when stale).
    void drawHoverOverlay(DisplayContext *pdc);

    /// UI drawing objects (centre mark etc.) and the 2D overlay layer.
    void drawUiOverlays(DisplayContext *pdc);

    /// Present-only frame: replay the pipeline's final stage, overlay the
    /// highlight and the UI, swap. Returns false when the cached frame cannot
    /// be served (the caller then renders a regular frame).
    bool presentFrame(DisplayContext *pdc);

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
