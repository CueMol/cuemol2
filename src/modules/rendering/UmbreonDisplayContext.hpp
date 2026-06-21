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

    ////////////////////////////////////////////////////////////
    // Edge / silhouette line configuration (mirrors PovDisplayContext)

    /// Edge corner types
    enum {
      ECT_NONE = 0,
      ECT_JOINT = 1,
      ECT_ALL = 2
    };

    void enableEdgeLines(bool b) { m_bEnableEdgeLines = b; }
    void setCreaseLimit(double d) { m_dCreaseLimit = d; }
    void setEdgeRise(double d) { m_dEdgeRise = d; }

    /// Edge-emission hooks driven by RendIntData's silhouette extraction.
    /// They translate edges/corners into umbreon outline primitives; the
    /// PrintStream argument (used by the POV backend) is ignored here.
    virtual void writeEdgeLineImpl(PrintStream &ips, int xa1, int xa2,
                                   const Vector4D &x1, const Vector4D &n1,
                                   const Vector4D &x2, const Vector4D &n2);
    virtual void writePointImpl(PrintStream &ips, const Vector4D &v1,
                                const Vector4D &n1, int alpha);

  private:
    struct Impl;
    std::unique_ptr<Impl> m_pImpl;

    /// Main flag for edge line display
    bool m_bEnableEdgeLines;
    /// Crease detection angle limit (radian); negative = no crease limit
    double m_dCreaseLimit;
    /// Edge line rise from the surface (along the vertex normal)
    double m_dEdgeRise;
    /// Edge corner type (ECT_*)
    int m_nEdgeCornerType;

    /// Build the umbreon camera from the seeded view state (eye-space:
    /// camera at (0,0,viewDist) looking down -Z).
    void buildCamera();

    /// Append the current section buffer (m_pIntData) to the umbreon scene.
    void appendIntData();

    /// Run the silhouette/edge extraction over the current section mesh and
    /// emit outline primitives via writeEdgeLineImpl/writePointImpl. Mirrors
    /// PovDisplayContext::writeSilEdges2 without the POV-SDL declares.
    void appendEdges();
  };

}

#endif
