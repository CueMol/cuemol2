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

  inline umbreon::Vec3 toVec3(const Vector4D &v)
  {
    return umbreon::Vec3(float(v.x()), float(v.y()), float(v.z()));
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
  // alpha scaled by alphaScale, the section's default alpha (the renderer's
  // setAlpha()). This mirrors POV, which writes transmit = 1 - colorAlpha *
  // defAlpha (PovDisplayContext::dumpClut). Falls back to white on failure.
  inline umbreon::Vec4 resolveColor(gfx::ColorTable &clut,
                                    const gfx::ColorTable::elem_t &ci,
                                    float alphaScale)
  {
    Vector4D rgba;
    if (!clut.getRGBAVecColor(ci, rgba))
      return umbreon::Vec4(1.0f, 1.0f, 1.0f, alphaScale);
    return umbreon::Vec4(float(rgba.x()), float(rgba.y()), float(rgba.z()),
                         float(rgba.w()) * alphaScale);
  }

  // Position raised off the surface along its normal (POV edge_line uses
  // `v + raise*n` to lift the outline cylinder/sphere off the geometry).
  inline umbreon::Vec3 riseToVec3(const Vector4D &v, const Vector4D &n,
                                  double raise)
  {
    return umbreon::Vec3(float(v.x() + n.x() * raise),
                         float(v.y() + n.y() * raise),
                         float(v.z() + n.z() * raise));
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
  /// Mesh.triGroupId). Semi-transparent sections are added to veilGroups so the
  /// renderer composites as a single-layer "veil" (only the frontmost surface
  /// per group), instead of blending each overlapping sphere/triangle over the
  /// next (which double-darkens overlaps). Mirrors CueMol's per-section
  /// transparency (PovDisplayContext::startSection / blendTab).
  int nextGroup = 0;
  int curGroup = 0;
  std::vector<std::uint16_t> veilGroups;
#endif
};

UmbreonDisplayContext::UmbreonDisplayContext()
     : super_t(), m_pImpl(new Impl()),
       m_bEnableEdgeLines(true), m_dCreaseLimit(-1.0), m_dEdgeRise(0.5),
       m_nEdgeCornerType(ECT_ALL)
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
  m_pImpl->veilGroups.clear();
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

  // Section default alpha (the renderer's setAlpha()); multiplies each color's
  // own opacity so a translucent renderer (e.g. a surface drawn with alpha 0.5)
  // becomes see-through, matching POV's transmit = 1 - colorAlpha * defAlpha.
  // Applied unconditionally (defAlpha == 1 is opaque); POV's post-blend mode is
  // not relevant to umbreon's single-pass front-to-back compositing.
  const float defAlpha = float(getAlpha());

  // Assign this section (= one CueMol renderer) a transparency group. A
  // semi-transparent renderer is registered as a veil so umbreon composites it
  // as a single layer (the frontmost surface per group) instead of blending
  // each overlapping sphere/triangle over the next (which double-darkens the
  // overlaps). This matches CueMol's per-section transparency (the renderer
  // alpha, getAlpha(), is what PovDisplayContext groups by in its blendTab).
  m_pImpl->curGroup = m_pImpl->nextGroup++;
  const std::uint16_t group = static_cast<std::uint16_t>(m_pImpl->curGroup);
  if (defAlpha < 1.0f - 1.0e-4f)
    m_pImpl->veilGroups.push_back(group);

  // Normalize thin primitives: dots -> spheres, lines -> cylinders.
  pdat->convDots();
  pdat->convLines(true);

  const int elt = getEdgeLineType();
  const bool bEdges = m_bEnableEdgeLines &&
                      (elt == ELT_EDGES || elt == ELT_SILHOUETTE);

  if (bEdges) {
    // POV-style: fold spheres/cylinders into the mesh, so both the shaded
    // surface and the derived silhouette cover them. (Analytic quadrics are
    // not kept while edge lines are on.)
    pdat->convSpheres();
    pdat->convCylinders();
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
        um.colors.push_back(resolveColor(clut, pv[k]->c, defAlpha));
      }
    }
    if (pClipped != NULL)
      delete pClipped;
  }

  if (bEdges) {
    // Derive and emit silhouette/edge outline primitives from the mesh.
    appendEdges();
    return;
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
    s.color = resolveColor(clut, p->col, defAlpha);
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
    c.color = resolveColor(clut, p->col, defAlpha);
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

void UmbreonDisplayContext::appendEdges()
{
#ifdef HAVE_UMBREON
  RendIntData *pdat = getIntData();
  if (pdat == NULL)
    return;
  if (pdat->m_mesh.getVertexSize() <= 0 || pdat->m_mesh.getFaceSize() <= 0)
    return;

  // The edge-emission hooks (writeEdgeLineImpl/writePointImpl) push umbreon
  // outline primitives and ignore the stream, so a discard stream is fine.
  qlib::StrOutStream nullout;
  qlib::PrintStream ips(nullout);

  const int elt = getEdgeLineType();
  pdat->setSilhMode(elt == ELT_SILHOUETTE);

  pdat->calcSilEdgeLines(m_dViewDist, m_dCreaseLimit);

  if (elt == ELT_SILHOUETTE) {
    pdat->buildAABBTree(-1);
    pdat->calcSilhIntrsec(getEdgeLineWidth() / 2.0);
    pdat->writeSilhLines(ips);
  }
  else {
    // edge mode: intersections only for cyl/sph meshes
    pdat->buildAABBTree(MFMOD_MESH);
    pdat->calcEdgeIntrsec();
    pdat->writeEdgeLines(ips);
  }

  if (m_nEdgeCornerType != ECT_NONE)
    pdat->writeCornerPoints(ips);

  pdat->cleanupSilEdgeLines();
#endif  // HAVE_UMBREON
}

void UmbreonDisplayContext::writeEdgeLineImpl(PrintStream &, int xa1, int xa2,
                                              const Vector4D &x1,
                                              const Vector4D &n1,
                                              const Vector4D &x2,
                                              const Vector4D &n2)
{
#ifdef HAVE_UMBREON
  const double w = getEdgeLineWidth();
  const double raise = m_dEdgeRise * (w * 0.5);

  // edge line color (passed through as the linear working color); default black
  double er = 0.0, eg = 0.0, eb = 0.0;
  gfx::ColorPtr pcol = getEdgeLineColor();
  if (!pcol.isnull()) {
    er = pcol->fr();
    eg = pcol->fg();
    eb = pcol->fb();
  }
  const float lr = float(er), lg = float(eg), lb = float(eb);

  umbreon::Cylinder c;
  c.p0 = riseToVec3(x1, n1, raise);
  c.p1 = riseToVec3(x2, n2, raise);
  c.radius = float(w);
  c.material = umbreon::Material::flatOutline();
  c.open = true;
  if (xa1 == 255 && xa2 == 255) {
    c.color = umbreon::Vec4(lr, lg, lb, 1.0f);
    c.opacity1 = -1.0f;
  }
  else {
    // edge_line2: per-endpoint opacity gradient
    c.color = umbreon::Vec4(lr, lg, lb, float(1.0 - xa1 / 255.0));
    c.opacity1 = float(1.0 - xa2 / 255.0);
  }
  c.group = static_cast<std::uint16_t>(m_pImpl->curGroup);
  m_pImpl->scene.cylinders.push_back(c);
#endif  // HAVE_UMBREON
}

void UmbreonDisplayContext::writePointImpl(PrintStream &, const Vector4D &v1,
                                           const Vector4D &n1, int alpha)
{
#ifdef HAVE_UMBREON
  // POV omits junction dots for semi-transparent edges (avoids spotty seams).
  if (alpha != 255)
    return;

  const double w = getEdgeLineWidth();
  const double raise = m_dEdgeRise * (w * 0.5);

  double er = 0.0, eg = 0.0, eb = 0.0;
  gfx::ColorPtr pcol = getEdgeLineColor();
  if (!pcol.isnull()) {
    er = pcol->fr();
    eg = pcol->fg();
    eb = pcol->fb();
  }

  umbreon::Sphere s;
  s.center = riseToVec3(v1, n1, raise);
  s.radius = float(w);
  s.material = umbreon::Material::flatOutline();
  s.color = umbreon::Vec4(float(er), float(eg), float(eb), 1.0f);
  s.group = static_cast<std::uint16_t>(m_pImpl->curGroup);
  m_pImpl->scene.spheres.push_back(s);
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

void UmbreonDisplayContext::render(const UmbreonRenderParams &prm,
                                   int &outWidth, int &outHeight, int &outNcomp,
                                   std::vector<unsigned char> &outRGBA)
{
#ifdef HAVE_UMBREON
  buildCamera();

  umbreon::Scene &scene = m_pImpl->scene;

  // Per-material finishes: the accumulated mesh carries one finish per triangle
  // in triMaterialId (filled in appendIntData from each color's CLUT material
  // name). Hand umbreon the material table; mesh.material stays as the fallback
  // used when a triangle has no id (empty triMaterialId).
  scene.mesh.materials = m_pImpl->matTable;
  scene.mesh.material =
      m_pImpl->matTable.empty() ? surfaceFinish() : m_pImpl->matTable[0];

  // Semi-transparent sections (one per renderer) are composited as single-layer
  // veils so overlapping primitives within a renderer do not double-blend.
  scene.veilGroups = m_pImpl->veilGroups;

  // background color (passed through as the linear working color); default black
  umbreon::Vec3 bg(0.0f, 0.0f, 0.0f);
  if (!m_bgcolor.isnull())
    bg = umbreon::Vec3(float(m_bgcolor->fr()), float(m_bgcolor->fg()),
                       float(m_bgcolor->fb()));
  scene.background = bg;

  // POV fog (depth cue): CueMol writes, for an opaque background,
  //   fog { distance slab/3, color bg, fog_type 2 (ground), fog_offset 0,
  //         fog_alt 1e-10, up <0,0,1> }
  // and the umbreon CLI applies it as a depth post-process. Without it the
  // far geometry is not sunk toward the background, so shading looks flat.
  scene.fog.enabled = true;
  scene.fog.color = bg;
  scene.fog.distance = float(m_dSlabDepth / 3.0);
  scene.fog.type = 2;
  scene.fog.offset = 0.0f;
  scene.fog.alt = 1.0e-10f;
  scene.fog.up = umbreon::Vec3(0.0f, 0.0f, 1.0f);

  // Default lighting matching CueMol's POV output (the scene the umbreon CLI
  // builds from a .pov). The umbreon CLI predefines _light_inten=1.3,
  // _flash_frac=0.6, _amb_frac=0, and the .pov's `#ifndef(_light_inten)`
  // override is skipped, so the evaluated macro intensities are:
  //   SpecLighting  = _light_inten*(1-_amb_frac)*(1-_flash_frac) = 0.52
  //   FlashLighting = _light_inten*(1-_amb_frac)*_flash_frac     = 0.78
  if (scene.lights.empty()) {
    // SpecLighting: directional key light from the upper-front-right
    // (positioned at normalize(1,1,1), pointing at the origin). CueMol calls it
    // with aShadow=1, so it is NOT shadowless -> it casts highlights (specular).
    umbreon::DistantLight spec;
    spec.direction = umbreon::normalize(umbreon::Vec3(-1.0f, -1.0f, -1.0f));
    spec.color = umbreon::Vec3(1.0f, 1.0f, 1.0f);
    spec.intensity = 0.52f;
    spec.castsHighlight = true;
    scene.lights.push_back(spec);

    // FlashLighting: headlight along the view direction (from the camera);
    // always shadowless -> a fill light (diffuse only, no specular).
    umbreon::DistantLight flash;
    flash.direction = umbreon::Vec3(0.0f, 0.0f, -1.0f);
    flash.color = umbreon::Vec3(1.0f, 1.0f, 1.0f);
    flash.intensity = 0.78f;
    flash.castsHighlight = false;
    scene.lights.push_back(flash);
  }
  scene.ambientIntensity = 1.0f;
  scene.ambientColor = umbreon::Vec3(1.0f, 1.0f, 1.0f);

  // POV assumed_gamma: raises the final image to this power (1.0 = no-op).
  // The linear-output mode forces it off (assumedGamma = 1.0) so the bytes are
  // a direct linear mapping of the HDR framebuffer.
  scene.assumedGamma = prm.linearOutput ? 1.0f : float(prm.assumedGamma);

  umbreon::RenderOptions opt;
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

  MB_DPRINTLN("Umbreon> render %dx%d ss=%d ao=%d tris=%d",
              opt.width, opt.height, opt.supersample, opt.aoSamples,
              int(scene.mesh.triangleCount()));

  umbreon::FrameResult frame = umbreon::render(scene, opt);

  // Count saturated pixels: any RGB channel > 1.0 in the final framebuffer will
  // clamp to white on output (the encode step clips to [0,1]). Since
  // applyAssumedGamma is monotonic with g > 0, "frame.color > 1" is the same
  // set whether measured before or after gamma. Logged to help judge whether
  // the lighting/exposure is blowing out highlights.
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
  outNcomp = prm.transparentBackground ? 4 : 3;

  // For a transparent background umbreon returns premultiplied RGB (color
  // weighted by coverage) with alpha = coverage. PNG expects straight alpha, so
  // un-premultiply in linear space before encoding; the encode paths below then
  // emit the 4th (alpha) channel via outNcomp. The opaque path (outNcomp = 3)
  // is left byte-for-byte unchanged.
  if (prm.transparentBackground) {
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

  if (prm.linearOutput) {
    // Direct linear mapping: clamp each HDR channel to [0,1] and scale to 8-bit
    // (no sRGB OETF). Bypasses srgbEncode8 entirely.
    const std::size_t npix =
        std::size_t(frame.width) * std::size_t(frame.height);
    outRGBA.resize(npix * std::size_t(outNcomp));
    for (std::size_t i = 0; i < npix; ++i) {
      for (int c = 0; c < outNcomp; ++c) {
        float v = frame.color[i * 4 + c];
        if (v < 0.0f) v = 0.0f;
        if (v > 1.0f) v = 1.0f;
        outRGBA[i * outNcomp + c] =
            static_cast<unsigned char>(v * 255.0f + 0.5f);
      }
    }
  }
  else {
    std::vector<std::uint8_t> bytes = umbreon::srgbEncode8(frame, outNcomp);
    outRGBA.assign(bytes.begin(), bytes.end());
  }

  MB_DPRINTLN("Umbreon> render done: %.3f sec",
              frame.renderSeconds);
#else
  outWidth = outHeight = outNcomp = 0;
  outRGBA.clear();
  MB_THROW(qlib::RuntimeException,
           "umbreon backend not available (built without ENABLE_UMBREON)");
#endif
}
