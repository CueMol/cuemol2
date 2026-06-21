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
    int aoSamples = 0;
    bool shadows = false;
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
    /// sRGB pixels (top-left origin, outNcomp components per pixel). Throws
    /// qlib::RuntimeException when built without umbreon (HAVE_UMBREON).
    void render(const UmbreonRenderParams &prm,
                int &outWidth, int &outHeight, int &outNcomp,
                std::vector<unsigned char> &outRGBA);

  private:
    struct Impl;
    std::unique_ptr<Impl> m_pImpl;

    /// Build the umbreon camera from the seeded view state (eye-space:
    /// camera at (0,0,viewDist) looking down -Z).
    void buildCamera();

    /// Append the current section buffer (m_pIntData) to the umbreon scene.
    void appendIntData();
  };

}

#endif
