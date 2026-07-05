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
    /// ambient occlusion: rays per mesh hit (0 = off), occluder search radius
    /// (world units), and strength (0 = none, 1 = full).
    int aoSamples = 0;
    double aoDistance = 1.0e20;
    double aoIntensity = 1.0;
    /// shadows: cast from the lights; samples per light (>1 = soft area light)
    /// and light angular radius in degrees (>0 = soft shadows).
    bool shadows = false;
    int shadowSamples = 1;
    double lightRadius = 0.0;
    /// diffuse global illumination (umbreon pt1 path-traced integrator). When
    /// on, the lighting is rebalanced to the POV radiosity split (energy moved
    /// into the GI-gathered ambient). giSamples = gather rays per pixel;
    /// giIntensity = indirect gain; giEnvIntensity = environment (sky)
    /// multiplier; giDenoise runs the built-in a-trous denoiser on the result.
    bool giEnabled = false;
    int giSamples = 32;
    double giIntensity = 1.0;
    double giEnvIntensity = 1.0;
    bool giDenoise = true;
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
    virtual ~UmbreonDisplayContext();

    /// Reset the accumulated umbreon scene. Called by Scene::display().
    virtual void startRender();

    virtual void startSection(const LString &name);

    /// Translate the just-finished section's RendIntData into umbreon
    /// primitives, then release the buffer (via the base class).
    virtual void endSection();

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

    /// Resolve a CueMol material name to an index into the per-mesh material
    /// table (Impl::matTable), parsing its POV finish (StyleMgr) on first use
    /// and caching the result. Empty name maps to "default". Returns 0 when
    /// built without umbreon.
    int materialIndexFor(const LString &matName);
  };

}

#endif
