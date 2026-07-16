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
#include <qsys/style/StyleMgr.hpp>

#ifdef HAVE_UMBREON
#  include <umbreon/umbreon.hpp>
#  include <cmath>
#  include <cstdint>
#  include <cstdlib>
#  include <map>
#  include <sstream>
#  include <string>
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

  // CueMol's default POV material finish (default_style.xml): ambient 0.2,
  // diffuse 0.8, brilliance 1.0 (== umbreon Material() defaults) plus
  // specular 0.4 and roughness 0.01 (umbreon defaults are specular 0,
  // roughness 0.02). The SpecLighting key light casts highlights, so this
  // specular is what produces the reference's highlights.
  inline umbreon::Material surfaceFinish()
  {
    umbreon::Material m;
    m.specular = 0.4f;
    m.roughness = 0.01f;
    return m;
  }

  // POV named metal finishes (metals.inc presets) resolved by name. Mirrors
  // umbreon's mesh2_reader::lookupNamedFinish exactly so the in-process render
  // matches umbreon_cli reading the same .pov. Fields: ambient, brilliance,
  // diffuse, specular, roughness, reflection; all metallic with phong 0.
  bool lookupNamedFinish(const std::string &name, umbreon::Material &out)
  {
    struct Entry
    {
      const char *name;
      float ambient, brilliance, diffuse, specular, roughness, reflection;
    };
    static const Entry kTable[] = {
        {"F_MetalA", 0.35f, 2.0f, 0.3f, 0.80f, 1.0f / 20.0f, 0.10f},
        {"F_MetalB", 0.30f, 3.0f, 0.4f, 0.70f, 1.0f / 60.0f, 0.25f},
        {"F_MetalC", 0.25f, 4.0f, 0.5f, 0.80f, 1.0f / 80.0f, 0.50f},
        {"F_MetalD", 0.15f, 5.0f, 0.6f, 0.80f, 1.0f / 100.0f, 0.65f},
        {"F_MetalE", 0.10f, 6.0f, 0.7f, 0.80f, 1.0f / 120.0f, 0.80f},
    };
    for (const Entry &e : kTable) {
      if (name == e.name) {
        out = umbreon::Material();
        out.ambient = e.ambient;
        out.brilliance = e.brilliance;
        out.diffuse = e.diffuse;
        out.specular = e.specular;
        out.roughness = e.roughness;
        out.reflection = e.reflection;
        out.metallic = true;
        out.phong = 0.0f;
        return true;
      }
    }
    return false;
  }

  // Translate a CueMol POV material definition (StyleMgr::getMaterial(name,
  // "pov"), e.g. `texture { finish { ambient .2 diffuse .8 ... } pigment {..} }`)
  // into an umbreon::Material by parsing its `finish { ... }` block. Mirrors
  // umbreon's mesh2_reader::parseFinish (same keyword set + F_Metal presets,
  // starting from umbreon Material() defaults), so the result equals what
  // umbreon_cli derives from the equivalent .pov. A def with no finish block
  // (e.g. a procedural `texture { T_Wood31 }`, which umbreon cannot reproduce)
  // falls back to the default finish.
  umbreon::Material parsePovFinish(const LString &povDef)
  {
    const std::string s(povDef.c_str());

    const std::size_t fp = s.find("finish");
    if (fp == std::string::npos)
      return surfaceFinish();
    const std::size_t open = s.find('{', fp);
    if (open == std::string::npos)
      return surfaceFinish();
    int depth = 0;
    std::size_t close = std::string::npos;
    for (std::size_t k = open; k < s.size(); ++k) {
      if (s[k] == '{')
        ++depth;
      else if (s[k] == '}' && --depth == 0) {
        close = k;
        break;
      }
    }
    if (close == std::string::npos)
      return surfaceFinish();

    // Tokenize the finish body on whitespace (CueMol emits literal numbers).
    std::vector<std::string> toks;
    {
      std::istringstream iss(s.substr(open + 1, close - open - 1));
      for (std::string t; iss >> t;)
        toks.push_back(t);
    }

    static const char *kKeys[] = {"ambient",    "diffuse",   "specular",
                                  "roughness",  "brilliance", "phong",
                                  "phong_size", "reflection", "emission"};

    umbreon::Material m;  // umbreon defaults (specular 0, roughness 0.02)
    for (std::size_t k = 0; k < toks.size(); ++k) {
      const std::string &tk = toks[k];

      bool isKey = false;
      for (const char *key : kKeys) {
        if (tk == key) {
          isKey = true;
          break;
        }
      }
      if (isKey) {
        float f = 0.0f;
        if (k + 1 < toks.size()) {
          char *endp = NULL;
          const double d = std::strtod(toks[k + 1].c_str(), &endp);
          if (endp != toks[k + 1].c_str()) {
            f = float(d);
            ++k;
          }
        }
        if (tk == "ambient") m.ambient = f;
        else if (tk == "diffuse") m.diffuse = f;
        else if (tk == "specular") m.specular = f;
        else if (tk == "roughness") m.roughness = f;
        else if (tk == "brilliance") m.brilliance = f;
        else if (tk == "phong") m.phong = f;
        else if (tk == "phong_size") m.phongSize = f;
        else if (tk == "reflection") m.reflection = f;
        else m.emission = f;
        continue;
      }
      if (tk == "metallic") {
        m.metallic = true;
        // optional amount: a value at or below 0 disables it
        if (k + 1 < toks.size()) {
          char *endp = NULL;
          const double d = std::strtod(toks[k + 1].c_str(), &endp);
          if (endp != toks[k + 1].c_str()) {
            m.metallic = d > 0.0;
            ++k;
          }
        }
        continue;
      }
      // a bare identifier may be a named finish (e.g. F_MetalA); later keywords
      // can still override
      umbreon::Material named;
      if (lookupNamedFinish(tk, named))
        m = named;
    }
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

UmbreonDisplayContext::UmbreonDisplayContext()
     : super_t(), m_pImpl(new Impl()),
       m_bEnableEdgeLines(true), m_dCreaseLimit(-1.0), m_dEdgeRise(0.5)
{
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

  // Resolve via the same StyleMgr POV definition the POV exporter uses, then
  // translate its finish into an umbreon::Material. Fall back to the default
  // finish when there is no style manager or no POV def for this material.
  umbreon::Material mat = surfaceFinish();
  qsys::StyleMgr *pSM = qsys::StyleMgr::getInstance();
  if (pSM != NULL) {
    const LString povDef = pSM->getMaterial(name, LString("pov"));
    if (!povDef.isEmpty())
      mat = parsePovFinish(povDef);
  }

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
      // Edge line width: getEdgeLineWidth() is a world-space radius (as POV /
      // Lux use it); convert to the native stroke width in FINAL pixels via the
      // line scale (world units per pixel, seeded by the exporter). Fall back to
      // the default when the width is unset (< 0).
      const double elw = getEdgeLineWidth();
      const double lscale = getLineScale();
      float widthPx = float(EDGE_THICKNESS_PX);
      if (elw > 0.0 && lscale > 0.0)
        widthPx = float(2.0 * elw / lscale);
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
  // With slab clipping on (m_dClipZ >= 0), render the near-clipped mesh:
  // calcMeshClip() cuts triangles at z == m_dClipZ, interpolating position /
  // normal / color, exactly as the GL view and the Lux exporter do. It returns
  // NULL when nothing is clipped, in which case the original mesh is used.
  {
    Mesh *pClipped = NULL;
    Mesh *pmesh = &pdat->m_mesh;
    if (pdat->m_dClipZ >= 0.0) {
      pClipped = pdat->calcMeshClip();
      if (pClipped != NULL)
        pmesh = pClipped;
    }
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
    if (pClipped != NULL)
      delete pClipped;
  }

  // --- analytic spheres (shaded, not flat outline) ---
  // umbreon cannot cut a quadric at the clip plane, so (like the Lux exporter)
  // drop spheres that lie entirely in front of it and draw the rest whole.
  for (RendIntData::SphList::const_iterator i = pdat->m_spheres.begin();
       i != pdat->m_spheres.end(); ++i) {
    const RendIntData::Sph *p = *i;
    if (pdat->m_dClipZ >= 0.0 && p->v1.z() - p->r >= pdat->m_dClipZ)
      continue;
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
    // drop cylinders entirely in front of the near clip plane (umbreon cannot
    // cut a quadric there); the Lux exporter does the same.
    if (pdat->m_dClipZ >= 0.0) {
      const double zfar = (v1.z() < v2.z()) ? v1.z() : v2.z();
      const double delw = (p->w1 > p->w2) ? p->w1 : p->w2;
      if (zfar - delw >= pdat->m_dClipZ)
        continue;
    }
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
      m_pImpl->matTable.empty() ? surfaceFinish() : m_pImpl->matTable[0];

  // Semi-transparent sections (one per renderer) are post-blended per group so
  // overlapping primitives within a renderer do not double-blend (umbreon's
  // blendpng-equivalent multi-pass group alpha).
  scene.groupBlend = m_pImpl->groupBlend;

  // background color (passed through as the linear working color); default black
  umbreon::Vec3 bg(0.0f, 0.0f, 0.0f);
  if (!m_bgcolor.isnull())
    bg = umbreon::Vec3(float(m_bgcolor->fr()), float(m_bgcolor->fg()),
                       float(m_bgcolor->fb()));
  scene.background = bg;

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
  opt.aoSamples = (prm.aoSamples > 0) ? prm.aoSamples : 0;
  opt.aoDistance = float(prm.aoDistance);
  opt.aoIntensity = float(prm.aoIntensity);
  opt.shadows = prm.shadows;
  opt.shadowSamples = (prm.shadowSamples > 0) ? prm.shadowSamples : 1;
  opt.lightRadius = float(prm.lightRadius);
  opt.transparentBackground = prm.transparentBackground;

  // Diffuse global illumination (pt1 path-traced integrator). Enabling GI sets
  // gi + giIntegrator=1 (the composited path; the irradiance-cache integrator
  // does not composite yet). pt1Denoise runs Intel OIDN on the indirect
  // irradiance (E) buffer BEFORE the albedo multiply -- direct lighting and
  // albedo stay noise-free -- which needs umbreon built with UMBREON_WITH_OIDN
  // (linked from the deplibs OIDN bundle; see src/cmake/umbreon.cmake).
  if (prm.giEnabled) {
    opt.gi = true;
    opt.giIntegrator = 1;
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
    // Outward contour offset (world units); CueMol's edge-rise knob.
    opt.strokeEdges.raise = float(m_dEdgeRise);
    opt.strokeEdges.color[0] = 0.0f;
    opt.strokeEdges.color[1] = 0.0f;
    opt.strokeEdges.color[2] = 0.0f;
    // Cover every group id; sections with no edge lines keep an all-disabled
    // EdgeStyle, so the stroke pass draws nothing for them.
    if (m_pImpl->groupEdgeStyle.size() < std::size_t(m_pImpl->nextGroup))
      m_pImpl->groupEdgeStyle.resize(std::size_t(m_pImpl->nextGroup));
    scene.groupEdgeStyle = m_pImpl->groupEdgeStyle;
  }

  MB_DPRINTLN("Umbreon> render %dx%d ss=%d ao=%d tris=%d",
              opt.width, opt.height, opt.supersample, opt.aoSamples,
              int(scene.mesh.triangleCount()));
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
