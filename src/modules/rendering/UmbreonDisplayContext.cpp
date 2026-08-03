// -*-Mode: C++;-*-
//
//  Umbreon (Embree ray-tracer) display context implementation
//

#include <common.h>

#include "UmbreonDisplayContext.hpp"
#include "RendIntData.hpp"
#include "MeshData.hpp"

#include <qlib/Utils.hpp>
#include <qlib/PrintStream.hpp>
#include <qlib/StringStream.hpp>
#include <gfx/AbstractColor.hpp>

#ifdef HAVE_UMBREON
#  include <umbreon/umbreon.hpp>
#  include <umbreon/log.hpp>
#  include <cmath>
#  include <cstdint>
#  include <map>
#  include <mutex>
#  include <vector>
#endif

using namespace render;

using qlib::Vector4D;
using qlib::Matrix4D;

#ifdef HAVE_UMBREON
namespace {

  // CueMol stores colors as display (sRGB-ish) values and writes them to POV as
  // plain `color rgb`, which POV-Ray (assumed_gamma 1.0) and the umbreon CLI's
  // mesh2_reader both use AS-IS as the linear working color (only POV `srgb`
  // literals are sRGB-decoded). To match that reference, pass the CueMol color
  // through unchanged -- do NOT sRGB-decode it.

  /// Native stroke-edge line width, in final-resolution pixels (umbreon
  /// StrokeEdgeOptions::thickness / EdgeClassStyle::width).
  const int EDGE_THICKNESS_PX = 2;

  inline umbreon::Vec3 toVec3(const Vector4D &v)
  {
    return umbreon::Vec3(float(v.x()), float(v.y()), float(v.z()));
  }

  // Map one umbreon linear HDR channel straight to 8-bit: clamp to [0,1] and
  // scale by 255 (no assumed_gamma, no sRGB OETF). The PNG is tagged sRGB by the
  // exporter, so a color-managed viewer applies the transfer curve at display.
  inline unsigned char toUnorm8(float v)
  {
    if (v < 0.0f) v = 0.0f;
    if (v > 1.0f) v = 1.0f;
    return static_cast<unsigned char>(v * 255.0f + 0.5f);
  }

  // CueMol material name -> umbreon material.
  //
  // This used to read the style's POV `finish` def (StyleMgr::getMaterial(name,
  // "pov")), parse it, and shade with ShadingModel::Pov. POV material is
  // deprecated as an API surface: it exists so umbreon_cli can reproduce a
  // POV-Ray reference render from a .pov scene bit-exactly, which is a test
  // concern -- not a look a live render should be asking for. Physical
  // materials are authored here as Principled; the NPR ones are tagged Toon
  // (same non-physical lobes, but the GI exemption is declared rather than
  // sniffed out of the field values).
  //
  // INTERIM HOME: this table moves to a PBR style def in default_style.xml in
  // a follow-up, at which point StyleMgr comes back -- reading a PBR def, not
  // a POV one. Until then the names here must track default_style.xml.

  // Physical material. `reflection` is dormant in the principled BSDF but
  // drives the non-pt2 fake environment term: reflection > 0 uses
  // reflection * bg (flat and COLORLESS), while 0 falls back to F0 * bg, which
  // for a metal is pigment-tinted. So a finish ported from POV carries its
  // original scalar to keep its POV environment brightness, and an authored
  // metal leaves it at 0 to get the colored reflection instead.
  inline umbreon::Material pbrMaterial(float ambient, float diffuse,
                                       float metallic, float roughness,
                                       float specular, float reflection)
  {
    umbreon::Material m;
    m.model = umbreon::ShadingModel::Principled;
    m.ambient = ambient;
    m.diffuse = diffuse;
    m.reflection = reflection;
    m.pbr.metallic = metallic;
    m.pbr.roughness = roughness;
    m.pbr.specular = specular;
    return m;
  }

  // NPR material: shades through the POV lobes, because a toon look is BUILT
  // on them (a flat brilliance-0 diffuse and a saturating phong; an
  // energy-conserving BSDF can express neither). The Toon tag is what makes
  // umbreon's GI exemption explicit for these.
  inline umbreon::Material toonMaterial(float ambient, float diffuse,
                                        float brilliance, float phong,
                                        float phongSize)
  {
    umbreon::Material m;
    m.model = umbreon::ShadingModel::Toon;
    m.ambient = ambient;
    m.diffuse = diffuse;
    m.specular = 0.0f;
    m.brilliance = brilliance;
    m.phong = phong;
    m.phongSize = phongSize;
    return m;
  }

  // Resolve a CueMol material name. False for an unknown name (the caller
  // falls back to "default").
  //
  // The ported values are the principled equivalents of the POV finishes this
  // used to parse -- default_style.xml's `type="pov"` defs run through the
  // bench's toPrincipledMaterial mapping, whose POV-roughness leg is
  // r_pbr = sqrt(sqrt(2 / (1/r_pov + 2))):
  //   default     <- ambient .2 diffuse .8 specular .4 roughness .01
  //   matte       <- finish { ambient 0.3 } (diffuse-only: the exact class)
  //   diff_metal  <- POV F_MetalA,  spec_metal <- POV F_MetalD
  // The five procedural-texture names carried a bare `texture{T_*}` with no
  // finish block, so they fell back to the default plastic finish -- chrome
  // rendered as plastic. umbreon has no procedural texture, so an exact port
  // was never available; they are authored below as what the name says.
  bool lookupMaterial(const LString &name, umbreon::Material &out)
  {
    struct PbrEntry
    {
      const char *name;
      float ambient, diffuse, metallic, roughness, specular, reflection;
    };
    static const PbrEntry kPbr[] = {
        // ported from a POV finish
        {"default", 0.20f, 0.80f, 0.0f, 0.3742032f, 0.40f, 0.00f},
        {"matte", 0.30f, 0.80f, 0.0f, 0.5000000f, 0.00f, 0.00f},
        // TODO: add an "aniso_diff_metal" sibling -- brushed metal, driven by
        // pbr.anisotropy (+ pbr.anisotropyRotation, in turns: 0 = brushed
        // along the axis, 0.25 = a circumferential/lathe brush). The reviewed
        // bench demo (`--material principled --pbr-aniso 0.9`, outputs/
        // principled_20260717/bs_aniso_090.png) is metallic 1, roughness 0.35,
        // specular 0.5, anisotropy 0.9, rotation 0. It needs
        // PbrEntry extended (no anisotropy fields yet) and the name added to
        // default_style.xml so the UI can offer it. Constraint worth knowing
        // BEFORE wiring it: umbreon applies anisotropy to sphere/cylinder
        // primitives ONLY (sphere pole = world +Y, cylinder = its own axis);
        // mesh surfaces stay isotropic until a per-vertex tangent attribute
        // exists, so the material is inert on the mesh-based renderers and
        // only shows on ball-and-stick.
        {"diff_metal", 0.35f, 0.30f, 1.0f, 0.5491005f, 0.80f, 0.10f},
        {"spec_metal", 0.15f, 0.60f, 1.0f, 0.3742032f, 0.80f, 0.65f},
        // authored: no POV finish to port from (approximate by intent)
        {"metallic_chrome", 0.20f, 0.80f, 1.0f, 0.05f, 0.50f, 0.00f},
        {"metallic_copper", 0.20f, 0.80f, 1.0f, 0.15f, 0.50f, 0.00f},
        {"stone35", 0.20f, 0.80f, 0.0f, 0.85f, 0.25f, 0.00f},
        {"wood31", 0.20f, 0.80f, 0.0f, 0.45f, 0.50f, 0.00f},
        {"wood14scl2", 0.20f, 0.80f, 0.0f, 0.45f, 0.50f, 0.00f},
    };
    for (const PbrEntry &e : kPbr) {
      if (name.equals(e.name)) {
        out = pbrMaterial(e.ambient, e.diffuse, e.metallic, e.roughness,
                          e.specular, e.reflection);
        return true;
      }
    }

    struct ToonEntry
    {
      const char *name;
      float ambient, diffuse, brilliance, phong, phongSize;
    };
    static const ToonEntry kToon[] = {
        {"shadow", 0.75f, 0.0f, 1.0f, 0.0f, 40.0f},
        {"nolighting", 1.00f, 0.0f, 1.0f, 0.0f, 40.0f},
        {"toon1", 0.00f, 0.8f, 0.0f, 0.0f, 40.0f},
        {"toon2", 0.30f, 0.5f, 0.0f, 10000.0f, 50.0f},
    };
    for (const ToonEntry &e : kToon) {
      if (name.equals(e.name)) {
        out = toonMaterial(e.ambient, e.diffuse, e.brilliance, e.phong,
                           e.phongSize);
        return true;
      }
    }
    return false;
  }

  // The table's "default" row: fallback for an unknown material name and for a
  // mesh whose triangles carry no material id.
  inline umbreon::Material defaultMaterial()
  {
    umbreon::Material m;
    lookupMaterial(LString("default"), m);
    return m;
  }

  // Resolve a CLUT color index to an umbreon RGBA. The RGB is passed through as
  // the linear working color (see note above); the opacity is the per-color
  // (native) alpha, left untouched. The section's default alpha (getAlpha()) is
  // NOT folded in here: in umbreon's blendpng-equivalent model the section alpha
  // is a post-blend weight carried by Scene::groupBlend, and the section renders
  // with colors untouched (see the note at the groupBlend push). Folding it in
  // here as well would double-apply the transparency. Falls back to white.
  inline umbreon::Vec4 resolveColor(gfx::ColorTable &clut,
                                    const gfx::ColorTable::elem_t &ci)
  {
    Vector4D rgba;
    if (!clut.getRGBAVecColor(ci, rgba))
      return umbreon::Vec4(1.0f, 1.0f, 1.0f, 1.0f);
    return umbreon::Vec4(float(rgba.x()), float(rgba.y()), float(rgba.z()),
                         float(rgba.w()));
  }

  /// Convert a linear HDR umbreon framebuffer to interleaved 8-bit pixels
  /// (top-left origin, outNcomp = 3 or 4). Shared by the synchronous render()
  /// and the asynchronous finishAsyncRender() paths so both encode identically.
  /// When transparentBackground is true the input is premultiplied RGBA (alpha =
  /// coverage) and is un-premultiplied in linear space before the 8-bit encode.
  void encodeFrame(umbreon::FrameResult &frame, bool transparentBackground,
                   int &outWidth, int &outHeight, int &outNcomp,
                   std::vector<unsigned char> &outRGBA)
  {
    // Count saturated pixels: any RGB channel > 1.0 in the final framebuffer
    // will clamp to white on output (the encode step clips to [0,1]). Logged to
    // help judge whether the lighting/exposure is blowing out highlights.
    {
      const std::size_t npix =
          std::size_t(frame.width) * std::size_t(frame.height);
      std::size_t nsat = 0;
      for (std::size_t i = 0; i < npix; ++i) {
        if (frame.color[i * 4 + 0] > 1.0f ||
            frame.color[i * 4 + 1] > 1.0f ||
            frame.color[i * 4 + 2] > 1.0f)
          ++nsat;
      }
      const double pct =
          (npix > 0) ? (100.0 * double(nsat) / double(npix)) : 0.0;
      LOG_DPRINTLN("Umbreon> saturated pixels: %d / %d (%.2f%%)",
                   int(nsat), int(npix), pct);
    }

    outWidth = frame.width;
    outHeight = frame.height;
    outNcomp = transparentBackground ? 4 : 3;

    // For a transparent background umbreon returns premultiplied RGB (color
    // weighted by coverage) with alpha = coverage. PNG expects straight alpha, so
    // un-premultiply in linear space before encoding; the encode paths below then
    // emit the 4th (alpha) channel via outNcomp. The opaque path (outNcomp = 3)
    // is left byte-for-byte unchanged.
    if (transparentBackground) {
      const std::size_t npix =
          std::size_t(frame.width) * std::size_t(frame.height);
      for (std::size_t i = 0; i < npix; ++i) {
        float a = frame.color[i * 4 + 3];
        if (a < 0.0f) a = 0.0f;
        if (a > 1.0f) a = 1.0f;
        const float inv = (a > 1.0e-6f) ? 1.0f / a : 0.0f;
        frame.color[i * 4 + 0] *= inv;
        frame.color[i * 4 + 1] *= inv;
        frame.color[i * 4 + 2] *= inv;
        frame.color[i * 4 + 3] = a;
      }
    }

    // Direct linear mapping: clamp each HDR channel to [0,1] and scale to 8-bit
    // (no assumed_gamma, no sRGB OETF). The PNG is tagged sRGB by the exporter so
    // a color-managed viewer applies the transfer curve at display time.
    {
      const std::size_t npix =
          std::size_t(frame.width) * std::size_t(frame.height);
      outRGBA.resize(npix * std::size_t(outNcomp));
      for (std::size_t i = 0; i < npix; ++i) {
        for (int c = 0; c < outNcomp; ++c)
          outRGBA[i * outNcomp + c] = toUnorm8(frame.color[i * 4 + c]);
      }
    }

    MB_DPRINTLN("Umbreon> render done: %.3f sec", frame.renderSeconds);
  }

  /// Bounding-box diagonal of everything in the scene (mesh, balls, sticks).
  /// Used to scale the AO radius to the molecule; returns 0 for an empty scene.
  double sceneDiagonal(const umbreon::Scene &scene)
  {
    umbreon::Aabb bb = scene.mesh.bounds();
    // mesh.bounds() covers the triangles only, but a CPK / ball-and-stick
    // representation has no triangles at all, so fold in the primitives.
    for (const umbreon::Sphere &s : scene.spheres) {
      const umbreon::Vec3 r(s.radius, s.radius, s.radius);
      bb.extend(s.center - r);
      bb.extend(s.center + r);
    }
    for (const umbreon::Cylinder &c : scene.cylinders) {
      const umbreon::Vec3 r(c.radius, c.radius, c.radius);
      bb.extend(c.p0 - r);
      bb.extend(c.p0 + r);
      bb.extend(c.p1 - r);
      bb.extend(c.p1 + r);
    }
    return bb.valid() ? double(bb.diagonal()) : 0.0;
  }

}  // anonymous namespace
#endif  // HAVE_UMBREON

struct UmbreonDisplayContext::Impl
{
#ifdef HAVE_UMBREON
  umbreon::Scene scene;

  /// Per-material finish table handed to umbreon as scene.mesh.materials, with
  /// a name->index cache (doubles as the parse cache). Accumulated across
  /// sections; indices are stored per triangle in scene.mesh.triMaterialId.
  std::vector<umbreon::Material> matTable;
  std::map<LString, int> matIndex;

  /// Per-section transparency group (= one CueMol renderer). Assigned per
  /// section and stored on every primitive (Sphere/Cylinder.group,
  /// Mesh.triGroupId). A semi-transparent section is added to groupBlend as a
  /// {group, alpha} entry so umbreon post-blends the whole section (its
  /// blendpng-equivalent multi-pass group alpha), instead of blending each
  /// overlapping sphere/triangle over the next (which double-darkens overlaps).
  /// The alpha is the renderer's getAlpha(), matching CueMol's per-section
  /// transparency (PovDisplayContext::startSection / blendTab beta).
  int nextGroup = 0;
  int curGroup = 0;
  std::vector<umbreon::GroupBlend> groupBlend;

  /// Per-section (per group) native stroke-edge style for umbreon's screen-space
  /// edge pass (RenderOptions::strokeEdges + Scene::groupEdgeStyle). Indexed by
  /// group id; a section without edge lines gets an all-disabled EdgeStyle.
  std::vector<umbreon::EdgeStyle> groupEdgeStyle;
  /// Whether any section enabled edge lines (gates strokeEdges.enable) and
  /// whether any section requested creases (gates the global crease extraction).
  bool anyEdges = false;
  bool anyCrease = false;
  /// Representative stroke width (final px) for the global strokeEdges.thickness;
  /// per-section widths live in groupEdgeStyle[*].cls[*].width.
  float edgeThicknessPx = float(EDGE_THICKNESS_PX);

  /// Render options built from UmbreonRenderParams by buildSceneAndOptions();
  /// consumed by render() (sync) or moved into renderAsync() (async).
  umbreon::RenderOptions opt;

  /// In-flight asynchronous render handle (null when none). RenderTask is
  /// move-only and only constructible via umbreon::renderAsync, hence the
  /// unique_ptr. Its reads are lock-free, so the getters below are thread-safe.
  std::unique_ptr<umbreon::RenderTask> task;

  /// Whether the pending render emits a transparent (RGBA) background; captured
  /// in buildSceneAndOptions so finishAsyncRender() encodes without needing prm.
  bool transparentBackground = false;
#endif
};

namespace {

#ifdef HAVE_UMBREON
/// Process-wide collector behind UmbreonDisplayContext::drainLog(). umbreon's
/// sink is global (one render at a time in this process), so the buffer is too.
struct LogCollector
{
  std::mutex mtx;
  LString text;
};

LogCollector &logCollector()
{
  static LogCollector collector;
  return collector;
}

/// Route umbreon's diagnostics into the collector. Installed once and kept for
/// the process lifetime; before this the library wrote them to stderr, where a
/// GUI host never saw them.
void ensureLogSink()
{
  static std::once_flag once;
  std::call_once(once, [] {
    umbreon::setLogSink([](umbreon::LogLevel level, const char *text) {
      LogCollector &c = logCollector();
      std::lock_guard<std::mutex> lock(c.mtx);
      if (level == umbreon::LogLevel::Warning) c.text += "warning: ";
      c.text += text;
      c.text += "\n";
    });
  });
}
#endif

}  // anonymous namespace

UmbreonDisplayContext::UmbreonDisplayContext()
     : super_t(), m_pImpl(new Impl()),
       m_bEnableEdgeLines(true), m_dCreaseLimit(-1.0), m_dEdgeRise(0.5)
{
#ifdef HAVE_UMBREON
  ensureLogSink();
#endif
}

LString UmbreonDisplayContext::drainLog()
{
#ifdef HAVE_UMBREON
  LogCollector &c = logCollector();
  std::lock_guard<std::mutex> lock(c.mtx);
  LString out = c.text;
  c.text = LString();
  return out;
#else
  return LString();
#endif
}

UmbreonDisplayContext::~UmbreonDisplayContext()
{
}

void UmbreonDisplayContext::startRender()
{
  // Reset the accumulated scene; the view/camera state (m_dZoom etc.) is held
  // on the base context and is seeded by the exporter before display().
#ifdef HAVE_UMBREON
  m_pImpl->scene = umbreon::Scene();
  m_pImpl->matTable.clear();
  m_pImpl->matIndex.clear();
  m_pImpl->nextGroup = 0;
  m_pImpl->curGroup = 0;
  m_pImpl->groupBlend.clear();
  m_pImpl->groupEdgeStyle.clear();
  m_pImpl->anyEdges = false;
  m_pImpl->anyCrease = false;
  m_pImpl->edgeThicknessPx = float(EDGE_THICKNESS_PX);
#endif
}

int UmbreonDisplayContext::materialIndexFor(const LString &matName)
{
#ifdef HAVE_UMBREON
  // empty material name -> "default" (matches PovDisplayContext::dumpClut)
  const LString name = matName.isEmpty() ? LString("default") : matName;

  std::map<LString, int>::const_iterator it = m_pImpl->matIndex.find(name);
  if (it != m_pImpl->matIndex.end())
    return it->second;

  // Resolve straight from the name (see lookupMaterial): no StyleMgr, no POV
  // def, no finish parsing. An unknown name falls back to the default.
  umbreon::Material mat;
  if (!lookupMaterial(name, mat))
    mat = defaultMaterial();

  // triMaterialId is a uint8_t index; with ~13 named materials this ceiling is
  // never reached, but fall back to the default slot (0) if it ever is.
  if (m_pImpl->matTable.size() >= 255)
    return 0;
  const int idx = int(m_pImpl->matTable.size());
  m_pImpl->matTable.push_back(mat);
  m_pImpl->matIndex[name] = idx;
  return idx;
#else
  return 0;
#endif
}

void UmbreonDisplayContext::startSection(const LString &name)
{
  super_t::startSection(name);
  m_pIntData->start(name);
}

void UmbreonDisplayContext::endSection()
{
  // Translate before the base class frees m_pIntData.
  appendIntData();
  super_t::endSection();
}

void UmbreonDisplayContext::appendIntData()
{
#ifdef HAVE_UMBREON
  RendIntData *pdat = getIntData();
  if (pdat == NULL)
    return;

  umbreon::Scene &scene = m_pImpl->scene;
  gfx::ColorTable &clut = pdat->m_clut;

  // Section default alpha (the renderer's setAlpha()) = CueMol's per-section
  // group alpha. In umbreon's blendpng-equivalent post-blend model this is the
  // group blend weight (beta), not a per-color multiplier: the section's colors
  // stay untouched (see resolveColor) and umbreon composites the whole section
  // at this alpha. getAlpha() is what PovDisplayContext groups by in its blendTab.
  const float defAlpha = float(getAlpha());

  // Assign this section (= one CueMol renderer) a transparency group. A
  // semi-transparent section is registered as a groupBlend {group, alpha} entry
  // so umbreon post-blends the whole section (one extra render pass per group)
  // instead of blending each overlapping sphere/triangle over the next (which
  // double-darkens the overlaps). This matches CueMol's per-section transparency.
  m_pImpl->curGroup = m_pImpl->nextGroup++;
  const std::uint16_t group = static_cast<std::uint16_t>(m_pImpl->curGroup);
  if (defAlpha < 1.0f - 1.0e-4f)
    m_pImpl->groupBlend.push_back(umbreon::GroupBlend{group, defAlpha});

  MB_DPRINTLN("UmbreonDC> section %s: group=%d alpha=%f", getSecName().c_str(),
              int(group), double(defAlpha));

  // Normalize thin primitives: dots -> spheres, lines -> cylinders.
  pdat->convDots();
  pdat->convLines(true);

  // Native screen-space edge lines (umbreon strokeEdges). Record which edge
  // natures this section draws (silhouette / border / crease) and its edge
  // color into this group's EdgeStyle; the strokeEdges pass configured in
  // render() rasterizes them in screen space. Analytic spheres/cylinders are
  // kept (emitted below, not folded into the mesh) so umbreon outlines
  // ball-and-stick natively -- no CueMol-side outline geometry is built.
  {
    const int elt = getEdgeLineType();
    const bool bSil = m_bEnableEdgeLines &&
                      (elt == ELT_SILHOUETTE || elt == ELT_EDGES);
    const bool bBorder = m_bEnableEdgeLines && (elt == ELT_EDGES);
    const bool bCrease = bBorder && (m_dCreaseLimit > 0.0);

    umbreon::EdgeStyle es;  // every edge class disabled by default
    if (bSil || bBorder || bCrease) {
      float er = 0.0f, eg = 0.0f, eb = 0.0f;
      gfx::ColorPtr pcol = getEdgeLineColor();
      if (!pcol.isnull()) {
        er = float(pcol->fr());
        eg = float(pcol->fg());
        eb = float(pcol->fb());
      }
      // Edge line width: getEdgeLineWidth() is a world-space length (A); the
      // native stroke width is the FULL band width in FINAL pixels, so divide
      // by the line scale (world units per pixel, seeded by the exporter).
      //
      // The 1:1 conversion is what matches the INTERACTIVE GL view, which is
      // the look this backend is reproducing. GL draws edges as an inverted
      // hull (gfx/TrigGpuPrim::drawEdges + edge_vert.glsl): the mesh is offset
      // by edge_width ALONG THE NORMAL and its back faces are drawn behind the
      // surface. At a silhouette the normal lies in the screen plane, so the
      // contour moves out by exactly edge_width and the visible band -- the
      // sliver outside the true silhouette -- is edge_width wide. umbreon inks
      // a band of cls.width final px centred on the same contour, so equal
      // widths give equal line thickness (the band straddles the contour
      // instead of sitting outside it, which shifts it by half a line width).
      //
      // Note this is NOT the POV convention: PovSilBuilder emits the edge as a
      // cylinder of RADIUS getEdgeLineWidth(), i.e. a 2x wider band. Following
      // POV here is what made rendered images look heavily over-inked next to
      // the GL view.
      //
      // Falls back to the default when the width is unset (< 0).
      const double elw = getEdgeLineWidth();
      const double lscale = getLineScale();
      float widthPx = float(EDGE_THICKNESS_PX);
      if (elw > 0.0 && lscale > 0.0)
        widthPx = float(elw / lscale);
      if (widthPx < 1.0f)
        widthPx = 1.0f;
      // The stroke pass maps silhouette -> Silhouette, border -> Object,
      // crease -> Crease styling slots (umbreon scene_setup parity).
      const int slots[3] = { int(umbreon::EdgeClass::Silhouette),
                             int(umbreon::EdgeClass::Object),
                             int(umbreon::EdgeClass::Crease) };
      const bool on[3] = { bSil, bBorder, bCrease };
      for (int k = 0; k < 3; ++k) {
        umbreon::EdgeClassStyle &cs = es.cls[slots[k]];
        cs.enabled = on[k];
        cs.color[0] = er;
        cs.color[1] = eg;
        cs.color[2] = eb;
        cs.opacity = 1.0f;
        cs.width = widthPx;
      }
      // Representative width for the global stroke thickness (last edge section
      // wins); per-section cls.width above is what styles each group.
      m_pImpl->edgeThicknessPx = widthPx;
      m_pImpl->anyEdges = true;
      if (bCrease)
        m_pImpl->anyCrease = true;
    }
    if (m_pImpl->groupEdgeStyle.size() <= group)
      m_pImpl->groupEdgeStyle.resize(std::size_t(group) + 1);
    m_pImpl->groupEdgeStyle[group] = es;
  }

  // --- triangle mesh (de-indexed: 3 corners per triangle) ---
  // The camera slab is clipped by umbreon (Scene::clipNear, set in
  // buildSceneAndOptions), so the mesh is handed over UNCLIPPED and
  // RendIntData::m_dClipZ is deliberately ignored here. Cutting the triangles
  // on this side (calcMeshClip) would turn the cross-section into real geometry
  // -- an open mesh boundary that the native stroke pass then inks as a
  // silhouette. umbreon clamps the primary rays instead and knows which
  // boundaries its own planes cut, so the cut stays line-free.
  {
    Mesh *pmesh = &pdat->m_mesh;
    const int nface = pmesh->getFaceSize();
    umbreon::Mesh &um = scene.mesh;
    for (int i = 0; i < nface; ++i) {
      const MeshFace &f = pmesh->getFace(i);
      const MeshVert *pv[3] = { pmesh->getVertex(f.iv1),
                                pmesh->getVertex(f.iv2),
                                pmesh->getVertex(f.iv3) };
      // per-triangle finish from the first corner's color: the CLUT carries the
      // material name the renderer set, exactly as PovDisplayContext::dumpClut
      // reads it (m_clut.getMaterial)
      LString triMat;
      clut.getMaterial(pv[0]->c, triMat);
      um.triMaterialId.push_back(
          static_cast<std::uint8_t>(materialIndexFor(triMat)));
      um.triGroupId.push_back(group);
      for (int k = 0; k < 3; ++k) {
        um.positions.push_back(toVec3(pv[k]->v));
        um.normals.push_back(toVec3(pv[k]->n));
        um.colors.push_back(resolveColor(clut, pv[k]->c));
      }
    }
  }

  // --- analytic spheres (shaded, not flat outline) ---
  // Emitted whole: umbreon's clip plane cuts the quadric exactly, so a sphere
  // straddling the plane no longer has to be drawn whole (nor a fully clipped
  // one dropped) the way the Lux exporter still does.
  for (RendIntData::SphList::const_iterator i = pdat->m_spheres.begin();
       i != pdat->m_spheres.end(); ++i) {
    const RendIntData::Sph *p = *i;
    umbreon::Sphere s;
    s.center = toVec3(p->v1);
    s.radius = float(p->r);
    s.color = resolveColor(clut, p->col);
    LString smat;
    clut.getMaterial(p->col, smat);
    const int smatIdx = materialIndexFor(smat);
    s.material = m_pImpl->matTable[smatIdx];
    s.group = group;
    scene.spheres.push_back(s);
  }

  // --- analytic cylinders / cones ---
  for (RendIntData::CylList::const_iterator i = pdat->m_cylinders.begin();
       i != pdat->m_cylinders.end(); ++i) {
    const RendIntData::Cyl *p = *i;
    Vector4D v1 = p->v1, v2 = p->v2;
    if (p->pTransf != NULL) {
      // endpoints are stored pre-transform; map them into eye space
      v1.w() = 1.0;
      p->pTransf->xform4D(v1);
      v2.w() = 1.0;
      p->pTransf->xform4D(v2);
    }
    // Emitted whole, like the spheres above: the slab cut is umbreon's job.
    umbreon::Cylinder c;
    c.p0 = toVec3(v1);
    c.p1 = toVec3(v2);
    // umbreon cylinders are single-radius; approximate cones by the mean.
    c.radius = float((p->w1 + p->w2) * 0.5);
    c.color = resolveColor(clut, p->col);
    LString cmat;
    clut.getMaterial(p->col, cmat);
    const int cmatIdx = materialIndexFor(cmat);
    c.material = m_pImpl->matTable[cmatIdx];
    c.group = group;
    c.open = !p->bcap;
    scene.cylinders.push_back(c);
  }
#endif  // HAVE_UMBREON
}

void UmbreonDisplayContext::buildCamera()
{
#ifdef HAVE_UMBREON
  umbreon::Camera &cam = m_pImpl->scene.camera;
  const double dist = m_dViewDist;
  const double zoom = m_dZoom;

  // RendIntData geometry is already in eye space (the exporter seeds the
  // model-view matrix with the camera), so the camera sits on +Z looking down
  // -Z, matching the POV exporter's `location <0,0,distance> look_at <0,0,0>`.
  cam.position = umbreon::Vec3(0.0f, 0.0f, float(dist));
  cam.direction = umbreon::Vec3(0.0f, 0.0f, -1.0f);
  cam.up = umbreon::Vec3(0.0f, 1.0f, 0.0f);
  cam.orthographic = !isPerspective();
  if (cam.orthographic) {
    // image-plane height in world units == the CueMol zoom (view height)
    cam.height = float(zoom);
  }
  else {
    // POV: fov = 2*atan( zoom / (2*distance) ); umbreon uses the vertical fov
    cam.fovy = float(2.0 * umbreon::degrees(std::atan2(zoom, 2.0 * dist)));
  }
#endif
}

void UmbreonDisplayContext::buildSceneAndOptions(const UmbreonRenderParams &prm)
{
#ifdef HAVE_UMBREON
  // Captured so finishAsyncRender()/encodeFrame can pick the RGB vs RGBA path
  // without re-reading prm after the scene/options have been moved away.
  m_pImpl->transparentBackground = prm.transparentBackground;

  buildCamera();

  umbreon::Scene &scene = m_pImpl->scene;

  // Per-material finishes: the accumulated mesh carries one finish per triangle
  // in triMaterialId (filled in appendIntData from each color's CLUT material
  // name). Hand umbreon the material table; mesh.material stays as the fallback
  // used when a triangle has no id (empty triMaterialId).
  scene.mesh.materials = m_pImpl->matTable;
  scene.mesh.material =
      m_pImpl->matTable.empty() ? defaultMaterial() : m_pImpl->matTable[0];

  // Semi-transparent sections (one per renderer) are post-blended per group so
  // overlapping primitives within a renderer do not double-blend (umbreon's
  // blendpng-equivalent multi-pass group alpha).
  scene.groupBlend = m_pImpl->groupBlend;

  // Report the blend table umbreon receives. Each entry costs a full extra
  // render pass, and the background pass weight (1 - sum) goes negative once
  // several sections are nearly opaque -- both are worth seeing in a render
  // log when an image comes out unexpectedly bright or slow.
  if (!scene.groupBlend.empty()) {
    double sumA = 0.0;
    for (const umbreon::GroupBlend &gb : scene.groupBlend) sumA += gb.alpha;
    LOG_DPRINTLN("Umbreon> group alpha: %d of %d sections, sum=%f, bg weight=%f",
                 int(scene.groupBlend.size()), m_pImpl->nextGroup, sumA,
                 1.0 - sumA);
  }

  // background color (passed through as the linear working color); default black
  umbreon::Vec3 bg(0.0f, 0.0f, 0.0f);
  if (!m_bgcolor.isnull())
    bg = umbreon::Vec3(float(m_bgcolor->fr()), float(m_bgcolor->fg()),
                       float(m_bgcolor->fb()));
  scene.background = bg;

  // View-space slab clipping (the CueMol camera slab), done by umbreon: it
  // clamps every primary ray to linear view-z in [clipNear, clipFar] -- the
  // distance along the camera forward axis -- so the geometry above is handed
  // over UNCLIPPED and the plane does the cutting. Eye-space z maps to view-z
  // as vz = m_dViewDist - z (the camera sits at (0,0,m_dViewDist) looking down
  // -Z, see buildCamera), so the near cutaway plane RendIntData used to cut the
  // mesh at (m_dClipZ = slab/2 in eye z, the GL view's dist - slab/2) becomes
  // clipNear directly.
  //
  // Only the near plane is set. The GL view's far plane (dist + slabDepth) has
  // no observable effect here: the depth fog below ends at dist + slabDepth/2,
  // in FRONT of it, so anything the far plane could remove is already blended
  // fully into the background -- down to alpha 0 on the transparent-background
  // path. Secondary rays (shadow / AO / GI) stay unclipped in umbreon, matching
  // the interactive view where the slab is a display device, not scene geometry.
  if (m_bUseClipZ) {
    const double clipNear = m_dViewDist - m_dSlabDepth * 0.5;
    // A near plane at or behind the camera clips nothing; leaving it at -inf
    // keeps the whole ray (umbreon ignores a non-positive clipNear anyway).
    if (clipNear > 0.0) {
      scene.clipNear = float(clipNear);
      MB_DPRINTLN("Umbreon> near clip plane: view-z %f", clipNear);
    }
  }

  // OpenGL linear depth fog (depth cue): the umbreon renderer consumes only
  // fog.start/end (plane eye-z) + color; the legacy POV fog_type/offset/alt/up
  // fields are no longer applied. Match the umbreon CLI's POV-reader
  // restoration of CueMol's ground-fog hack (pov_scene_reader): start = view
  // distance (clamped to >= 1), end = start + 1.5 * (slabDepth/3) = start +
  // slabDepth/2. Without it far geometry is not sunk toward the background.
  const double fogStart = (m_dViewDist < 1.0) ? 1.0 : m_dViewDist;
  const double fogEnd = fogStart + 0.5 * m_dSlabDepth;
  scene.fog.color = bg;
  scene.fog.start = float(fogStart);
  scene.fog.end = float(fogEnd);
  // A degenerate slab (end <= start) would make the fog factor blow the whole
  // frame to the background color; skip fog entirely in that case.
  scene.fog.enabled = (fogEnd > fogStart);

  // Default lighting matching CueMol's POV output (the scene the umbreon CLI
  // builds from a .pov). Without GI the POV defaults are _light_inten=1.3,
  // _amb_frac=0, _flash_frac=0.6, giving SpecLighting=0.52 / FlashLighting=0.78.
  // With GI on, adopt the POV radiosity balance (_light_inten=1.6, _amb_frac=0.5,
  // _flash_frac=0.5): move half the energy into the ambient the GI gathers and
  // dim the direct lights, matching the umbreon CLI's scene_setup.
  const double li = prm.giEnabled ? 1.6 : 1.3;
  const double af = prm.giEnabled ? 0.5 : 0.0;
  const double ff = prm.giEnabled ? 0.5 : 0.6;
  if (scene.lights.empty()) {
    // SpecLighting: directional key light from the upper-front-right
    // (positioned at normalize(1,1,1), pointing at the origin). CueMol calls it
    // with aShadow=1, so it is NOT shadowless -> it casts highlights (specular).
    umbreon::DistantLight spec;
    spec.direction = umbreon::normalize(umbreon::Vec3(-1.0f, -1.0f, -1.0f));
    spec.color = umbreon::Vec3(1.0f, 1.0f, 1.0f);
    spec.intensity = float(li * (1.0 - af) * (1.0 - ff));
    spec.castsHighlight = true;
    scene.lights.push_back(spec);

    // FlashLighting: headlight along the view direction (from the camera);
    // always shadowless -> a fill light (diffuse only, no specular).
    umbreon::DistantLight flash;
    flash.direction = umbreon::Vec3(0.0f, 0.0f, -1.0f);
    flash.color = umbreon::Vec3(1.0f, 1.0f, 1.0f);
    flash.intensity = float(li * (1.0 - af) * ff);
    flash.castsHighlight = false;
    scene.lights.push_back(flash);
  }
  scene.ambientIntensity = 1.0f;
  // The GI gathers this ambient occlusion-aware; carry the ambient light energy
  // (light_inten * amb_frac) when GI is on, else a flat white ambient.
  const float amb = prm.giEnabled ? float(li * af) : 1.0f;
  scene.ambientColor = umbreon::Vec3(amb, amb, amb);

  // No assumed_gamma: keep umbreon's framebuffer linear (assumedGamma = 1.0 is
  // a no-op in the pipeline). The output is then a direct linear mapping of the
  // HDR framebuffer (see the encode below) and the PNG is tagged sRGB.
  scene.assumedGamma = 1.0f;

  m_pImpl->opt = umbreon::RenderOptions();
  umbreon::RenderOptions &opt = m_pImpl->opt;
  opt.width = (prm.width > 0) ? prm.width : 640;
  opt.height = (prm.height > 0) ? prm.height : 480;
  opt.supersample = (prm.supersample > 0) ? prm.supersample : 1;
  // Adaptive AA refines only the pixels an edge crosses, reaching a grid-like
  // edge for a fraction of the samples. umbreon cannot combine it with GI (it
  // warns and falls back), so decide that here instead of relying on the
  // warning path.
  opt.aaMode = prm.giEnabled ? 0 : ((prm.aaMode > 0) ? 1 : 0);
  opt.aaDepth = (prm.aaDepth > 0) ? prm.aaDepth : 0;
  opt.aoSamples = (prm.aoSamples > 0) ? prm.aoSamples : 0;
  // AO radius. A fixed world radius makes the effect depend on how large the
  // molecule is -- the same setting darkens a small peptide and does nothing
  // on a ribosome -- so <= 0 means "scale it to this scene": a fraction of the
  // bounding-box diagonal, which is what umbreon's own auto distances do
  // (giMaxDistance / giRecordSpacing). 0.7 sits mid-range of the 0.5-0.85 the
  // umbreon quality guide recommends for molecular scenes, where a larger
  // radius means stronger occlusion (a short one finds no occluders at all).
  opt.aoDistance = (prm.aoDistance > 0.0)
                       ? float(prm.aoDistance)
                       : float(sceneDiagonal(scene) * 0.7);
  opt.aoIntensity = float(prm.aoIntensity);
  // AO quality recipe. umbreon keeps its legacy binary single-scale estimator
  // while all of these are at their defaults, so an unset recipe renders
  // exactly as before. aoDiffuseFactor is the one that makes AO visible here:
  // CueMol's default lighting puts most energy in the direct lights, which the
  // ambient-only AO term never touches.
  opt.aoDiffuseFactor = float(prm.aoDiffuseFactor);
  opt.aoMultiScale = prm.aoMultiScale;
  opt.aoBentNormal = prm.aoBentNormal;
  opt.aoLowDiscrepancy = prm.aoLowDiscrepancy;
  opt.aoResDiv = prm.aoResDiv;
  opt.shadows = prm.shadows;
  opt.shadowSamples = (prm.shadowSamples > 0) ? prm.shadowSamples : 1;
  opt.lightRadius = float(prm.lightRadius);
  opt.transparentBackground = prm.transparentBackground;

  // Diffuse global illumination (pt2 path-traced integrator). Enabling GI sets
  // gi + giIntegrator=2. pt2 is a superset of pt1 built on the same gather core,
  // adding traced mirror/glossy reflection, emissive geometry as a GI source and
  // a blue-noise sampler; each extension is gated on a material/light the scene
  // actually carries, so a scene without them costs the same as pt1. pt1 (=1) is
  // frozen as umbreon's regression anchor and receives no further work.
  //
  // The integrator is pinned rather than left at umbreon's default: the deplibs
  // umbreon tracks a floating ref (UMBREON_GIT_REF=main in deplibs.env), so
  // following the default would silently change the rendered image whenever
  // umbreon promotes a new integrator. Pinning keeps that an explicit update.
  //
  // The pt1* knobs below apply to pt2 as well despite the pt1 naming (umbreon
  // shares spp / gather grid / denoise / sky / seed between the two).
  // pt1Denoise runs Intel OIDN on the indirect irradiance (E) buffer BEFORE the
  // albedo multiply -- direct lighting and albedo stay noise-free -- which needs
  // umbreon built with UMBREON_WITH_OIDN (linked from the deplibs OIDN bundle;
  // see src/cmake/umbreon.cmake).
  if (prm.giEnabled) {
    opt.gi = true;
    opt.giIntegrator = 2;
    opt.pt1Spp = (prm.giSamples > 0) ? prm.giSamples : 32;
    opt.giIntensity = float(prm.giIntensity);
    opt.giEnvIntensity = float(prm.giEnvIntensity);
    opt.pt1Denoise = prm.giDenoise;
  }

  // Full-frame post-pass denoiser on the final HDR color (0 = None, 1 =
  // AtrousBilateral, 2 = OIDN). Independent of the GI E-buffer denoise above and
  // a no-op at 0, so it is set unconditionally.
  opt.denoiser = prm.denoiser;

  // Native screen-space (Freestyle-style) edge lines. Enabled when any section
  // requested edge lines; each section's natures + edge color live in
  // scene.groupEdgeStyle (captured in appendIntData). The analytic silhouettes
  // of spheres/cylinders are outlined too (strokeEdges.analytic defaults on), so
  // ball-and-stick is edged without folding it into the mesh.
  if (m_pImpl->anyEdges) {
    opt.strokeEdges.enable = true;
    opt.strokeEdges.silhouette = true;
    opt.strokeEdges.border = true;
    opt.strokeEdges.crease = m_pImpl->anyCrease;
    opt.strokeEdges.thickness = int(m_pImpl->edgeThicknessPx + 0.5f);
    if (opt.strokeEdges.thickness < 1)
      opt.strokeEdges.thickness = 1;
    // strokeEdges.raise is deliberately left at 0. CueMol's edge-rise knob is a
    // DIMENSIONLESS multiplier of half the line width (PovSilBuilder writes the
    // offset as sl_rise * (w/2)), not a world-unit distance, so feeding
    // m_dEdgeRise straight in would lift the contour by whole angstroms. The
    // stroke pass has no use for the lift either: its visibility is ray-cast on
    // the true surface point, which is why umbreon documents raise == 0 for it
    // (only the object-space edge method reads the field).
    opt.strokeEdges.color[0] = 0.0f;
    opt.strokeEdges.color[1] = 0.0f;
    opt.strokeEdges.color[2] = 0.0f;
    // Round caps and round joins. umbreon defaults to butt caps + a mitered
    // join (its byte-identical legacy path), which shows up as flat stubs where
    // a chain ends against another line and as spikes at sharp corners. The GL
    // view has neither: its outline is an inverted hull, so an outline never
    // terminates flat and a corner is just the hull's own rounding. Rounded
    // ends/corners are the closer match, and they also hide the seams where the
    // chained silhouette is cut into visible runs.
    opt.strokeEdges.roundCap = true;
    opt.strokeEdges.roundJoin = true;
    // Cover every group id; sections with no edge lines keep an all-disabled
    // EdgeStyle, so the stroke pass draws nothing for them.
    if (m_pImpl->groupEdgeStyle.size() < std::size_t(m_pImpl->nextGroup))
      m_pImpl->groupEdgeStyle.resize(std::size_t(m_pImpl->nextGroup));
    scene.groupEdgeStyle = m_pImpl->groupEdgeStyle;
  }

  MB_DPRINTLN("Umbreon> render %dx%d ss=%d aa=%d ao=%d aodist=%f tris=%d",
              opt.width, opt.height, opt.supersample, opt.aaMode, opt.aoSamples,
              opt.aoDistance, int(scene.mesh.triangleCount()));
#endif
}

void UmbreonDisplayContext::render(const UmbreonRenderParams &prm,
                                   int &outWidth, int &outHeight, int &outNcomp,
                                   std::vector<unsigned char> &outRGBA)
{
#ifdef HAVE_UMBREON
  buildSceneAndOptions(prm);
  umbreon::FrameResult frame = umbreon::render(m_pImpl->scene, m_pImpl->opt);
  encodeFrame(frame, m_pImpl->transparentBackground,
              outWidth, outHeight, outNcomp, outRGBA);
#else
  outWidth = outHeight = outNcomp = 0;
  outRGBA.clear();
  MB_THROW(qlib::RuntimeException,
           "umbreon backend not available (built without ENABLE_UMBREON)");
#endif
}

void UmbreonDisplayContext::startAsyncRender(const UmbreonRenderParams &prm)
{
#ifdef HAVE_UMBREON
  buildSceneAndOptions(prm);
  // Hand the scene + options to a background render thread and return at once.
  // renderAsync takes both by value, so after the move m_pImpl->scene/opt are
  // empty until the next startRender() reset; nothing on the calling side may
  // touch them while the worker runs. RenderTask is move-only and only
  // constructible via renderAsync, hence the unique_ptr.
  m_pImpl->task = std::make_unique<umbreon::RenderTask>(
      umbreon::renderAsync(std::move(m_pImpl->scene), std::move(m_pImpl->opt)));
#else
  MB_THROW(qlib::RuntimeException,
           "umbreon backend not available (built without ENABLE_UMBREON)");
#endif
}

double UmbreonDisplayContext::getProgress() const
{
#ifdef HAVE_UMBREON
  return m_pImpl->task ? double(m_pImpl->task->progress()) : 0.0;
#else
  return 0.0;
#endif
}

LString UmbreonDisplayContext::getPhaseName() const
{
#ifdef HAVE_UMBREON
  if (!m_pImpl->task)
    return LString("Idle");
  return LString(umbreon::toString(m_pImpl->task->phase()));
#else
  return LString("Idle");
#endif
}

bool UmbreonDisplayContext::isDone() const
{
#ifdef HAVE_UMBREON
  // No task in flight -> report done so a polling loop terminates safely.
  return m_pImpl->task ? m_pImpl->task->done() : true;
#else
  return true;
#endif
}

void UmbreonDisplayContext::cancelRender() const
{
#ifdef HAVE_UMBREON
  if (m_pImpl->task)
    m_pImpl->task->cancel();
#endif
}

void UmbreonDisplayContext::finishAsyncRender(int &outWidth, int &outHeight,
                                              int &outNcomp,
                                              std::vector<unsigned char> &outRGBA,
                                              bool &outCancelled)
{
#ifdef HAVE_UMBREON
  if (!m_pImpl->task) {
    MB_THROW(qlib::RuntimeException, "umbreon: no async render in progress");
    return;
  }
  // get() joins the worker and rethrows any exception the render threw. Reset
  // the handle on every path (get() may be called only once) so a subsequent
  // startAsyncRender() is not blocked.
  umbreon::FrameResult frame;
  try {
    frame = m_pImpl->task->get();
  } catch (...) {
    m_pImpl->task.reset();
    throw;
  }
  m_pImpl->task.reset();

  outCancelled = frame.cancelled;
  if (frame.cancelled) {
    // A cancelled render yields a partial frame; do not encode it.
    outWidth = outHeight = outNcomp = 0;
    outRGBA.clear();
    return;
  }
  encodeFrame(frame, m_pImpl->transparentBackground,
              outWidth, outHeight, outNcomp, outRGBA);
#else
  outWidth = outHeight = outNcomp = 0;
  outCancelled = false;
  outRGBA.clear();
  MB_THROW(qlib::RuntimeException,
           "umbreon backend not available (built without ENABLE_UMBREON)");
#endif
}
