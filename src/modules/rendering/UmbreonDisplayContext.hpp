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
    /// Lighting energy balance, the POV exporter's _light_inten / _flash_frac
    /// / _amb_frac: key light = li*(1-af)*(1-ff), headlight = li*(1-af)*ff,
    /// and with GI on the gathered ambient energy = li*af (without GI the
    /// ambient stays POV's unit ambient_light and af only dims the direct
    /// lights). Negative = auto: resolved per GI state in
    /// buildSceneAndOptions(); see docs/architecture/umbreon-gi-lighting-balance.md.
    double lightIntensity = -1.0;
    double flashFraction = -1.0;
    double ambientFraction = -1.0;
    /// diffuse global illumination (umbreon pt2 path-traced integrator). When
    /// on, the flat material ambient is replaced by the occlusion-aware gather
    /// of the ambient energy above (li*af). giSamples = gather rays per pixel;
    /// giIntensity = indirect gain; giEnvIntensity = environment (sky)
    /// multiplier; giDenoise runs Intel OIDN on the indirect irradiance.
    bool giEnabled = false;
    int giSamples = 32;
    double giIntensity = 1.0;
    double giEnvIntensity = 1.0;
    bool giDenoise = true;
    /// GI sky model: gradient sky (zenith white, ground = giGroundColor along
    /// the camera up axis) instead of umbreon's uniform white sky, so the
    /// gathered ambient carries a shape cue independent of occlusion.
    /// giGroundColor applies only when giGroundColorSet (parsed "#rrggbb").
    bool giSkyGradient = false;
    bool giGroundColorSet = false;
    float giGroundColor[3] = {0.4f, 0.4f, 0.4f};
    /// Full-frame post-pass denoiser on the final HDR color (umbreon
    /// RenderOptions::denoiser): 0 = None, 1 = AtrousBilateral, 2 = OIDN. This
    /// is independent of giDenoise, which denoises only the GI indirect buffer.
    int denoiser = 0;
    /// Ink the depth-CONTINUOUS contact/intersection contour between DIFFERENT
    /// renderer sections (umbreon strokeEdges.contact): the circle where one
    /// section's primitive plunges into another section's surface, e.g. a
    /// stick entering the ribbon mesh of another EDGE GROUP (renderers are
    /// grouped by their egroup property, unnamed ones per object). Inside an
    /// edge group a contact never inks: such a boundary is surface contact
    /// rather than occlusion, and the GL view draws no line there either
    /// (its inverted hull is buried inside the other surface). Between edge
    /// groups the contact contour inks by default, closing a silhouette-mode
    /// group's outer contour where it meets another group; false suppresses
    /// every contact line.
    bool contactEdges = true;
    /// Silhouette (outline) edge mode: depth, as a fraction of the fog range
    /// (0 = the view center where the fog starts, 1 = the fog end), beyond
    /// which a surface of the same edge group no longer hides the contour of
    /// a nearer object: the contour is then drawn as in the edges mode
    /// (umbreon strokeEdges.outlineFarVz). 0.95 = surfaces more than 95% sunk
    /// into the fog no longer hide contours; at 1 only the fully fogged zone
    /// between the fog end and the far clip plane (dist + slab) lies beyond.
    double outlineFarDepth = 0.95;
    /// When true, render a transparent background: the output is RGBA (4
    /// components) with alpha = coverage (0 where no geometry is hit), so the
    /// PNG can be composited over another image (POV "_transpbg").
    bool transparentBackground = false;
    /// NPR tone-hatching pass (umbreon RenderOptions::hatch). When on, the
    /// image is an ink drawing: hatch marks carry the shading tone on a paper
    /// base, and GI is not used (umbreon force-disables it under the default
    /// ink mode, so it is decided here instead of relying on the warning).
    bool hatchEnable = false;
    /// Hatch style: an umbreon look (richardson / ink-cross / manga) or layer
    /// preset (pen-cross / pencil / engraving / stipple / screentone-60 /
    /// manga-square). An unknown name warns and falls back to richardson.
    qlib::LString hatchStyle = "richardson";
    /// Mark density multiplier: every layer's lattice pitch is DIVIDED by it,
    /// so 2 doubles the number of hatch lines / halftone dots. A multiplier
    /// (not an absolute pitch) so the relative pitches of a multi-layer look
    /// are preserved.
    double hatchDensity = 1.0;
    /// Mark size multiplier over the style's per-layer sizes: the line width
    /// of Line layers, the dot scale of Dot / Stipple layers.
    double hatchWidthScale = 1.0;
    /// Hand-edited mark layers as umbreon spec text ("layer:" lines; see
    /// umbreon applyHatchSpec). Applied after the style, so a non-empty text
    /// REPLACES the style's layers; empty keeps them. A malformed text warns
    /// into the render log and is ignored.
    qlib::LString hatchLayersSpec;
    /// Hand-edited tone recipe / ink model as spec text ("tone:" / "ink:"
    /// lines), overriding the keys it names; empty keeps the style's own.
    qlib::LString hatchToneSpec;
    /// Ink-amount multipliers over the resolved tone recipe (umbreon
    /// ToneRecipe::strength / curve): strength scales the coverage a display
    /// tone asks for, curve bends the response (> 1 = lighter mid tones).
    double hatchToneStrength = 1.0;
    double hatchToneCurve = 1.0;
    /// Base / ink model overrides (umbreon --hatch-base / --hatch-ink). The
    /// four combinations are the manual's coloring patterns: paper+fixed =
    /// pen figure, paper+albedo = colored pencil (richardson), albedo+fixed =
    /// comic (flat fill under black ink), albedo+albedo = print-like. Empty =
    /// keep the style's own model. hatchBase: "paper" | "albedo"; hatchInk:
    /// "fixed" | "albedo".
    qlib::LString hatchBase;
    qlib::LString hatchInk;
    /// Ink / paper color overrides, display-encoded RGB in [0, 1] (the hatch
    /// composite runs on the display-encoded frame; see umbreon HatchOptions).
    /// Applied only when the matching *Set flag is true; otherwise the style's
    /// own colors are kept (richardson, for one, carries a warm paper color
    /// that a fixed white default would silently destroy).
    bool hatchInkColorSet = false;
    bool hatchPaperColorSet = false;
    float hatchInkColor[3] = {0.0f, 0.0f, 0.0f};
    float hatchPaperColor[3] = {1.0f, 1.0f, 1.0f};
    /// Give sections whose renderer requests no edge lines a default contour
    /// (silhouette outline in the ink color), so an unconfigured scene still
    /// reads as a drawing. Sections WITH renderer-side edge settings keep
    /// their captured per-section style.
    bool hatchDefaultEdges = true;
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

    /// Resolve a hatch style name (look or mark preset, as hatchStyle takes
    /// it) on fresh options and return it as umbreon spec text: the
    /// "layer:" / "tone:" / "ink:" lines a host loads as an editable
    /// template and sends back through hatchLayersSpec / hatchToneSpec.
    /// Empty for an unknown name, or when built without umbreon.
    static LString hatchStyleSpec(const LString &style);

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
    /// Edge group of the next section (Scene::displayRendImpl calls this
    /// before startSection): renderers of one edge group are ONE section for
    /// umbreon's edge pass. A non-empty `name` (the renderer's egroup
    /// property) groups by name across the scene; an empty name groups the
    /// renderer with every other renderer that draws the SAME edge lines
    /// (type/mode, width, color) -- the only grouping consistent with one
    /// style per group.
    void setEdgeGroup(const LString &name) override;

  private:
    struct Impl;
    std::unique_ptr<Impl> m_pImpl;

    /// Main flag for edge line display
    bool m_bEnableEdgeLines;
    /// Crease detection angle limit (radian); negative = no crease limit
    double m_dCreaseLimit;
    /// Edge line rise from the surface (along the vertex normal)
    double m_dEdgeRise;
    /// Edge group name of the section being displayed (setEdgeGroup); empty
    /// means "group by the edge settings themselves".
    LString m_edgeGroupName;

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
