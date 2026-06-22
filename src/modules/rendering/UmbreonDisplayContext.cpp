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
#  include <cmath>
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
    s.material = surfaceFinish();
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
    c.material = surfaceFinish();
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

  // CueMol's default material finish for the accumulated triangle mesh
  // (surfaces, cartoons, folded spheres/cylinders).
  scene.mesh.material = surfaceFinish();

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
  opt.shadows = prm.shadows;

  MB_DPRINTLN("Umbreon> render %dx%d ss=%d ao=%d tris=%d",
              opt.width, opt.height, opt.supersample, opt.aoSamples,
              int(scene.mesh.triangleCount()));

  umbreon::FrameResult frame = umbreon::render(scene, opt);

  outWidth = frame.width;
  outHeight = frame.height;
  outNcomp = 3;
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
