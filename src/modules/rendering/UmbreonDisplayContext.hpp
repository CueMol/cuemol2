// -*-Mode: C++;-*-
//
//  Umbreon (Embree ray-tracer) display context.
//
//  Accumulates scene geometry through the shared RendIntData buffer (the same
//  intermediate representation the POV-Ray exporter builds) and translates it
//  into an umbreon::Scene for offscreen ray tracing. The umbreon dependency is
//  hidden behind a pimpl so this header stays umbreon-free and the class still
//  compiles when HAVE_UMBREON is not defined (the render path then throws).
//

#ifndef UMBREON_DISPLAY_CONTEXT_HPP_INCLUDED
#define UMBREON_DISPLAY_CONTEXT_HPP_INCLUDED

#include "render.hpp"

#include "FileDisplayContext.hpp"

#include <qlib/LString.hpp>

#include <memory>
#include <vector>

namespace render {

  /// Options forwarded to umbreon::render(). Kept umbreon-free so this header
  /// (and consumers such as UmbreonSceneExporter) need not include the umbreon
  /// public headers; the umbreon types live only in the .cpp.
  struct UmbreonRenderParams
  {
    int width = 0;
    int height = 0;
    int supersample = 1;
    /// Antialiasing mode (umbreon RenderOptions::aaMode): 0 = grid, 1 =
    /// adaptive (refine only edge pixels, aaDepth x aaDepth; 0 = supersample).
    /// Adaptive is unsupported alongside GI and is forced back to grid there.
    int aaMode = 0;
    int aaDepth = 0;
    /// ambient occlusion: rays per mesh hit (0 = off), occluder search radius
    /// (world units; <= 0 = auto from the scene bounding box) and strength
    /// (0 = none, 1 = full).
    int aoSamples = 0;
    double aoDistance = 1.0e20;
    double aoIntensity = 1.0;
    /// AO quality recipe (umbreon RenderOptions::ao*). The defaults reproduce
    /// umbreon's legacy single-scale binary AO; any non-default value switches
    /// it to the enhanced estimator. aoDiffuseFactor > 0 also darkens the
    /// direct diffuse term, which is what makes AO visible under CueMol's
    /// mostly-direct default lighting. aoResDiv: 0/1 = gather per shading hit,
    /// -1 = gather per output pixel and interpolate (needs supersample > 1).
    double aoDiffuseFactor = 0.0;
    bool aoMultiScale = false;
    bool aoBentNormal = false;
    bool aoLowDiscrepancy = false;
    int aoResDiv = 0;
    /// shadows: cast from the lights; samples per light (>1 = soft area light)
    /// and light angular radius in degrees (>0 = soft shadows).
    bool shadows = false;
    int shadowSamples = 1;
    double lightRadius = 0.0;
    /// diffuse global illumination (umbreon pt2 path-traced integrator). When
    /// on, the lighting is rebalanced to the POV radiosity split (energy moved
    /// into the GI-gathered ambient). giSamples = gather rays per pixel;
    /// giIntensity = indirect gain; giEnvIntensity = environment (sky)
    /// multiplier; giDenoise runs Intel OIDN on the indirect irradiance.
    bool giEnabled = false;
    int giSamples = 32;
    double giIntensity = 1.0;
    double giEnvIntensity = 1.0;
    bool giDenoise = true;
    /// Full-frame post-pass denoiser on the final HDR color (umbreon
    /// RenderOptions::denoiser): 0 = None, 1 = AtrousBilateral, 2 = OIDN. This
    /// is independent of giDenoise, which denoises only the GI indirect buffer.
    int denoiser = 0;
    /// When true, render a transparent background: the output is RGBA (4
    /// components) with alpha = coverage (0 where no geometry is hit), so the
    /// PNG can be composited over another image (POV "_transpbg").
    bool transparentBackground = false;
  };

  /// DisplayContext backend that renders a scene with umbreon (Embree).
  class RENDER_API UmbreonDisplayContext : public FileDisplayContext
  {
    typedef FileDisplayContext super_t;

  public:
    UmbreonDisplayContext();
    ~UmbreonDisplayContext() override;

    /// Reset the accumulated umbreon scene. Called by Scene::display().
    void startRender() override;

    void startSection(const LString &name) override;

    /// Translate the just-finished section's RendIntData into umbreon
    /// primitives, then release the buffer (via the base class).
    void endSection() override;

    /// Render the accumulated scene with umbreon and return interleaved 8-bit
    /// pixels (top-left origin, outNcomp components per pixel). The umbreon
    /// linear HDR framebuffer is mapped straight to 8-bit (clamp [0,1] * 255,
    /// no assumed_gamma and no sRGB OETF); the exporter tags the PNG as sRGB so
    /// a color-managed viewer applies the transfer curve at display time. Throws
    /// qlib::RuntimeException when built without umbreon (HAVE_UMBREON).
    void render(const UmbreonRenderParams &prm,
                int &outWidth, int &outHeight, int &outNcomp,
                std::vector<unsigned char> &outRGBA);

    ////////////////////////////////////////////////////////////
    // Asynchronous render (umbreon RenderTask).
    //
    // The heavy ray trace runs on a background thread so the caller (a single-
    // threaded worker) can poll progress and keep its UI/view responsive.
    // Usage: startAsyncRender() -> poll getProgress()/isDone() (optionally
    // cancelRender()) -> finishAsyncRender() once done. The scene build itself
    // (buildSceneAndOptions, driven from startAsyncRender) still runs on the
    // calling thread, which must own the CueMol scene graph.

    /// Build the umbreon scene + options and start rendering on a background
    /// thread, returning immediately. Throws when built without umbreon.
    void startAsyncRender(const UmbreonRenderParams &prm);

    /// Overall completion of the in-flight async render in [0, 1] (0 if none).
    double getProgress() const;

    /// Human-readable current render phase (umbreon RenderPhase name); "Idle"
    /// when no render is in flight.
    LString getPhaseName() const;

    /// True once the async render has finished (or when none is in flight).
    bool isDone() const;

    /// Request cooperative cancellation of the in-flight async render (no-op
    /// when none). finishAsyncRender() then reports outCancelled = true.
    void cancelRender() const;

    /// Join the async render and encode its result to interleaved 8-bit pixels
    /// (identical encoding to render()). On cancellation outCancelled is set
    /// true and no pixels are produced (outRGBA empty). Throws when no async
    /// render is in flight, or built without umbreon. Call at most once per
    /// startAsyncRender().
    /// Drain the diagnostics umbreon has emitted since the last call.
    ///
    /// umbreon's log sink is process-wide (umbreon/log.hpp), so this is too:
    /// one buffer collects whatever the library reported -- fallback warnings,
    /// Embree errors, the per-stage GI timing of a finished render -- and hands
    /// it over as newline-separated text for the host's render log. Empty when
    /// nothing was reported. Safe to call from any thread.
    static LString drainLog();

    void finishAsyncRender(int &outWidth, int &outHeight, int &outNcomp,
                           std::vector<unsigned char> &outRGBA,
                           bool &outCancelled);

    ////////////////////////////////////////////////////////////
    // Edge / silhouette line configuration (mirrors PovDisplayContext).
    // Edge lines are rendered by umbreon's native screen-space stroke pass
    // (RenderOptions::strokeEdges), configured from these settings in
    // appendIntData / render() -- no CueMol-side outline geometry is built.

    void enableEdgeLines(bool b) { m_bEnableEdgeLines = b; }
    void setCreaseLimit(double d) { m_dCreaseLimit = d; }
    void setEdgeRise(double d) { m_dEdgeRise = d; }

  private:
    struct Impl;
    std::unique_ptr<Impl> m_pImpl;

    /// Main flag for edge line display
    bool m_bEnableEdgeLines;
    /// Crease detection angle limit (radian); negative = no crease limit
    double m_dCreaseLimit;
    /// Edge line rise from the surface (along the vertex normal)
    double m_dEdgeRise;

    /// Build the umbreon camera from the seeded view state (eye-space:
    /// camera at (0,0,viewDist) looking down -Z).
    void buildCamera();

    /// Append the current section buffer (m_pIntData) to the umbreon scene.
    void appendIntData();

    /// Build the umbreon scene + render options (stored in the pimpl) from prm.
    /// Shared by the synchronous render() and the asynchronous
    /// startAsyncRender(). Touches the CueMol scene graph, so it must run on the
    /// calling thread. No-op when built without umbreon (callers throw first).
    void buildSceneAndOptions(const UmbreonRenderParams &prm);

    /// Resolve a CueMol material name to an index into the per-mesh material
    /// table (Impl::matTable), building the umbreon material from the name on
    /// first use (see lookupMaterial in the .cpp: principled for physical
    /// materials, Toon for the NPR ones -- no POV def, no StyleMgr) and
    /// caching the result. Empty name maps to "default"; an unknown name falls
    /// back to it too. Returns 0 when built without umbreon.
    int materialIndexFor(const LString &matName);
  };

}

#endif
