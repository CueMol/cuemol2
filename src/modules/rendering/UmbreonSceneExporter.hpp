// -*-Mode: C++;-*-
//
//  Umbreon ray-traced image scene exporter
//

#ifndef UMBREON_SCENE_EXPORTER_HPP_INCLUDED
#define UMBREON_SCENE_EXPORTER_HPP_INCLUDED

#include "render.hpp"

#include <qsys/SceneExporter.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>

#include <memory>

class UmbreonSceneExporter_wrap;

namespace render {

  class UmbreonDisplayContext;
  struct UmbreonRenderParams;
  class RenderSettings;

  /// Scene exporter that renders the scene with umbreon (the Embree ray
  /// tracer) and writes the result as a PNG image. Parallel to
  /// PovSceneExporter, but produces pixels in-process instead of a POV-Ray
  /// scene description.
  class RENDER_API UmbreonSceneExporter : public qsys::SceneExporter
  {
    MC_SCRIPTABLE;

    friend class ::UmbreonSceneExporter_wrap;

  private:
    /// perspective (true) vs orthographic (false) projection
    bool m_bPerspective;

    /// clip geometry to the camera slab's near cutaway plane (z = slab/2),
    /// matching the GL view and the Lux exporter. Defaults to true so the image
    /// reproduces the live view; false renders the full unclipped scene (like
    /// the POV exporter's default).
    bool m_bUseClipZ;

    /// supersampling (antialiasing) factor; 1 = off
    int m_nSupersample;

    /// antialiasing mode: 0 = grid, 1 = adaptive (edge pixels only)
    int m_nAaMode;

    /// adaptive-AA refinement grid per flagged pixel; 0 = use m_nSupersample
    int m_nAaDepth;

    /// ambient-occlusion ray count per mesh hit; 0 = off
    int m_nAoSamples;

    /// ambient-occlusion occluder search radius (world units); <= 0 = auto
    /// (fraction of the scene bounding-box diagonal)
    double m_dAoDistance;

    /// ambient-occlusion strength (0 = none, 1 = full)
    double m_dAoIntensity;

    /// AO darkening applied to the direct diffuse term (0 = ambient only).
    /// CueMol's default lighting puts most energy in the direct lights, so AO
    /// is nearly invisible at 0; 1.0 is the recipe value.
    double m_dAoDiffuseFactor;

    /// gather AO at three nested radii instead of one
    bool m_bAoMultiScale;

    /// shade the ambient along the average unoccluded direction (bent normal)
    bool m_bAoBentNormal;

    /// low-discrepancy AO sampling (Hammersley + per-pixel rotation)
    bool m_bAoLowDiscrepancy;

    /// AO gather resolution divisor (0/1 = per shading hit, -1 = per output
    /// pixel + bilateral interpolation, k > 1 = explicit divisor)
    int m_nAoResDiv;

    /// cast shadows from the lights
    bool m_bShadows;

    /// shadow rays per light (>1 = soft area light)
    int m_nShadowSamples;

    /// light angular radius in degrees (>0 = soft shadows)
    double m_dLightRadius;

    /// lighting energy balance (POV _light_inten / _flash_frac / _amb_frac);
    /// negative = auto (resolved per GI state in UmbreonDisplayContext)
    double m_dLightIntensity;
    double m_dFlashFraction;
    double m_dAmbientFraction;

    /// draw silhouette/edge outline lines (CueMol toon edges)
    bool m_bEnableEdgeLines;

    /// crease detection angle limit (radian); negative = no crease limit
    double m_dCreaseLimit;

    /// edge line rise from the surface
    double m_dEdgeRise;

    /// ink the depth-continuous contact/intersection contour between DIFFERENT
    /// renderer sections (umbreon strokeEdges.contact); default off
    bool m_bContactEdges;

    /// Transparent background: emit an RGBA PNG with alpha = coverage (0 where
    /// no geometry is hit) so it can be composited over another image (POV
    /// "_transpbg"). Default false (opaque RGB over the scene background color).
    bool m_bTransparentBackground;

    /// diffuse global illumination (pt2 path-traced integrator); default off
    bool m_bGI;

    /// GI gather samples per pixel (higher = less noise)
    int m_nGiSamples;

    /// GI indirect intensity (indirect light gain)
    double m_dGiIntensity;

    /// GI environment (sky) intensity multiplier
    double m_dGiEnvIntensity;

    /// denoise the GI indirect irradiance with the Intel OIDN denoiser
    bool m_bGiDenoise;

    /// full-frame post-pass denoiser (0 = None, 1 = AtrousBilateral, 2 = OIDN)
    int m_nDenoiser;

    /// GI sky model: gradient (zenith white / ground = m_sGiGroundColor along
    /// the camera up axis) instead of the uniform white sky
    bool m_bGiSkyGradient;

    /// ground hemisphere color of the gradient sky ("#rrggbb")
    LString m_sGiGroundColor;

    /// NPR tone-hatching pass (ink drawing); default off
    bool m_bHatchEnable;

    /// hatch style: an umbreon look or layer-preset name; unknown names fall
    /// back to richardson with a warning in the render log
    LString m_sHatchStyle;

    /// mark density multiplier (2 = twice as many lines / dots)
    double m_dHatchDensity;

    /// mark size multiplier over the style's per-layer sizes (line width /
    /// dot scale)
    double m_dHatchWidthScale;

    /// hand-edited layers / tone as umbreon spec text; empty = the style's
    LString m_sHatchLayersSpec;
    LString m_sHatchToneSpec;

    /// ink-amount multipliers over the resolved tone recipe
    double m_dHatchToneStrength;
    double m_dHatchToneCurve;

    /// base / ink model overrides ("paper"/"albedo", "fixed"/"albedo");
    /// empty = keep the hatch style's own model
    LString m_sHatchBase;
    LString m_sHatchInk;

    /// ink / paper color overrides as "#RRGGBB" hex strings (display-encoded);
    /// empty = keep the hatch style's own colors
    LString m_sHatchInkColor;
    LString m_sHatchPaperColor;

    /// give sections without renderer-side edge lines a default contour
    bool m_bHatchDefaultEdges;

    /// Asynchronous render context, created by beginRender() and released by
    /// endRender(). Held across the poll phase so the scene walk + background
    /// ray trace outlive a single scriptable call. Null when no render is in
    /// progress.
    std::unique_ptr<UmbreonDisplayContext> m_pCtx;

    /// Whether the last endRender() returned because the render was cancelled
    /// (so no image file was written).
    bool m_bWasCancelled;

    /// Shared setup for write() and beginRender(): init the display context,
    /// apply the exporter properties, walk the scene, and fill the render
    /// params. Runs on the calling thread (touches the CueMol scene graph).
    void setupContext(UmbreonDisplayContext &ctx, UmbreonRenderParams &prm);

  public:
    UmbreonSceneExporter();
    ~UmbreonSceneExporter() override;

    /// render the scene and write the image (synchronous; blocks until done)
    void write() override;

    /// Resolve a hatch style name and return it as umbreon spec text (the
    /// layer editor's template); "" for an unknown name or without umbreon.
    LString getHatchStyleSpec(const LString &name) const;

    /// Apply the scene render settings (Scene app data "render") to this
    /// exporter. `backend` is "umbreon", "umbreon_npr" or "" (resolve from
    /// settings.backend, "umbreon" unless it says "umbreon_npr"); returns
    /// the block id applied. See the .qif for the mapping rules. Throws
    /// IllegalArgumentException for any other backend id.
    LString applyRenderSettings(qlib::LScrSp<RenderSettings> pSettings,
                                const LString &backend);

    /////////////////////////////////
    // Asynchronous render: drive with beginRender() -> poll -> endRender().
    // The synchronous write() above is preserved for scripts/UXP; these are an
    // additive, non-blocking alternative for a responsive UI (see the .qif).

    /// Build the scene and start the ray trace on a background thread, returning
    /// immediately. Throws if a render is already in progress, or if built
    /// without umbreon.
    void beginRender();

    /// Overall completion of the in-flight render in [0, 1] (0 when none).
    double getRenderProgress() const;

    /// Current render phase name ("Idle" when no render is in flight).
    LString getRenderPhaseName() const;

    /// True once the render has finished (or when none is in flight).
    bool isRenderDone() const;

    /// Request cooperative cancellation of the in-flight render (no-op if none).
    void cancelRender();

    /// Join the render and write the PNG to the output path (unless cancelled),
    /// then release the render state. Throws if no render is in progress.
    void endRender();

    /// Whether the last endRender() ended in cancellation (no image written).
    bool wasRenderCancelled() const;

    /// Diagnostics umbreon emitted since the last call (see the .qif).
    /// Process-wide, not per-exporter: umbreon's log sink is global.
    LString getRenderLog() const;

    /////////////////////////////////

    /// Get name of the writer
    const char *getName() const override;

    /// Get file-type description
    const char *getTypeDescr() const override;

    /// Get file extension
    const char *getFileExt() const override;
  };

}

#endif
