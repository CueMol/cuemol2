// -*-Mode: C++;-*-
//
//  Umbreon (Embree ray-tracer) display context implementation
//

#include <common.h>

#include "UmbreonDisplayContext.hpp"
#include "RendIntData.hpp"
#include "MeshData.hpp"

#include <qlib/Utils.hpp>
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

  // sRGB (display) -> linear. CueMol colors are sRGB display values; umbreon
  // shades in linear space and re-encodes to sRGB on output (srgbEncode8), so
  // the geometry colors must be linearized on the way in.
  inline float srgb2linear(double c)
  {
    if (c <= 0.04045)
      return float(c / 12.92);
    return float(std::pow((c + 0.055) / 1.055, 2.4));
  }

  inline umbreon::Vec3 toVec3(const Vector4D &v)
  {
    return umbreon::Vec3(float(v.x()), float(v.y()), float(v.z()));
  }

  // Resolve a CLUT color index to a linear-space umbreon RGBA (rgb linearized,
  // alpha kept as-is). Falls back to opaque white on lookup failure.
  inline umbreon::Vec4 resolveColor(gfx::ColorTable &clut,
                                    const gfx::ColorTable::elem_t &ci)
  {
    Vector4D rgba;
    if (!clut.getRGBAVecColor(ci, rgba))
      return umbreon::Vec4(1.0f, 1.0f, 1.0f, 1.0f);
    return umbreon::Vec4(srgb2linear(rgba.x()), srgb2linear(rgba.y()),
                         srgb2linear(rgba.z()), float(rgba.w()));
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
     : super_t(), m_pImpl(new Impl())
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

  // Normalize thin primitives: dots -> spheres, lines -> cylinders. Spheres
  // and cylinders are kept analytic (not folded into the mesh) so the ray
  // tracer renders them as true quadrics.
  pdat->convDots();
  pdat->convLines(true);

  // --- triangle mesh (de-indexed: 3 corners per triangle) ---
  {
    Mesh &mesh = pdat->m_mesh;
    const int nface = mesh.getFaceSize();
    umbreon::Mesh &um = scene.mesh;
    for (int i = 0; i < nface; ++i) {
      const MeshFace &f = mesh.getFace(i);
      const MeshVert *pv[3] = { mesh.getVertex(f.iv1),
                                mesh.getVertex(f.iv2),
                                mesh.getVertex(f.iv3) };
      for (int k = 0; k < 3; ++k) {
        um.positions.push_back(toVec3(pv[k]->v));
        um.normals.push_back(toVec3(pv[k]->n));
        um.colors.push_back(resolveColor(clut, pv[k]->c));
      }
    }
  }

  // --- spheres (shaded, not flat outline) ---
  for (RendIntData::SphList::const_iterator i = pdat->m_spheres.begin();
       i != pdat->m_spheres.end(); ++i) {
    const RendIntData::Sph *p = *i;
    umbreon::Sphere s;
    s.center = toVec3(p->v1);
    s.radius = float(p->r);
    s.color = resolveColor(clut, p->col);
    s.material = umbreon::Material();
    scene.spheres.push_back(s);
  }

  // --- cylinders / cones ---
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
    umbreon::Cylinder c;
    c.p0 = toVec3(v1);
    c.p1 = toVec3(v2);
    // umbreon cylinders are single-radius; approximate cones by the mean.
    c.radius = float((p->w1 + p->w2) * 0.5);
    c.color = resolveColor(clut, p->col);
    c.material = umbreon::Material();
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

void UmbreonDisplayContext::render(const UmbreonRenderParams &prm,
                                   int &outWidth, int &outHeight, int &outNcomp,
                                   std::vector<unsigned char> &outRGBA)
{
#ifdef HAVE_UMBREON
  buildCamera();

  umbreon::Scene &scene = m_pImpl->scene;

  // background color (sRGB -> linear); default black
  if (!m_bgcolor.isnull()) {
    scene.background = umbreon::Vec3(srgb2linear(m_bgcolor->fr()),
                                     srgb2linear(m_bgcolor->fg()),
                                     srgb2linear(m_bgcolor->fb()));
  }

  // Default lighting: a single distant key light from the upper-front-right
  // plus a constant ambient fill. This approximates CueMol's default
  // SpecLighting; faithful light mapping is a later phase.
  if (scene.lights.empty()) {
    umbreon::DistantLight key;
    key.direction = umbreon::normalize(umbreon::Vec3(-1.0f, -1.0f, -1.0f));
    key.color = umbreon::Vec3(1.0f, 1.0f, 1.0f);
    key.intensity = 0.8f;
    key.castsHighlight = true;
    scene.lights.push_back(key);
  }
  scene.ambientIntensity = 0.4f;
  scene.ambientColor = umbreon::Vec3(1.0f, 1.0f, 1.0f);

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
  std::vector<std::uint8_t> bytes = umbreon::srgbEncode8(frame, outNcomp);
  outRGBA.assign(bytes.begin(), bytes.end());

  MB_DPRINTLN("Umbreon> render done: %.3f sec",
              frame.renderSeconds);
#else
  outWidth = outHeight = outNcomp = 0;
  outRGBA.clear();
  MB_THROW(qlib::RuntimeException,
           "umbreon backend not available (built without ENABLE_UMBREON)");
#endif
}
