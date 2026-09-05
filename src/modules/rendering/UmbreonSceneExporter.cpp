// -*-Mode: C++;-*-
//
//  Umbreon ray-traced image scene exporter implementation
//

#include <common.h>

#include "UmbreonSceneExporter.hpp"
#include "UmbreonDisplayContext.hpp"
#include "RenderSettings.hpp"

#include <algorithm>
#include <cmath>

#include <qlib/LStream.hpp>
#include <qsys/qsys.hpp>
#include <qsys/Scene.hpp>
#include <qsys/Camera.hpp>
#include <qsys/View.hpp>

#define HAVE_PNG_H 1
#include <libpng/png.h>

using namespace render;

using qsys::ScenePtr;
using qsys::CameraPtr;
using qsys::ViewPtr;

namespace {

  void umb_png_error_fn(png_structp, png_const_charp msg)
  {
    LOG_DPRINTLN("Umbreon PNG: error %s", msg);
  }

  void umb_png_warning_fn(png_structp, png_const_charp msg)
  {
    LOG_DPRINTLN("Umbreon PNG: warning %s", msg);
  }

  void umb_png_write_fn(png_structp png_ptr, png_bytep data, png_size_t length)
  {
    qlib::OutStream *pOut =
        reinterpret_cast<qlib::OutStream *>(png_get_io_ptr(png_ptr));
    pOut->write((const char *) data, 0, length);
  }

  void umb_png_flush_fn(png_structp png_ptr)
  {
    qlib::OutStream *pOut =
        reinterpret_cast<qlib::OutStream *>(png_get_io_ptr(png_ptr));
    pOut->flush();
  }

  /// Write an interleaved 8-bit image (top-left origin, ncomp = 3 or 4) to the
  /// output stream as a PNG. Mirrors PngSceneExporter's libpng setup but emits
  /// the whole framebuffer in one pass. Always tags the file as sRGB (see the
  /// note at the png_set_sRGB_gAMA_and_cHRM call).
  void writePngToStream(qlib::OutStream *pOut, int width, int height,
                        const unsigned char *pBytes, int ncomp)
  {
    png_structp pPNG = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL,
                                               umb_png_error_fn,
                                               umb_png_warning_fn);
    if (pPNG == NULL) {
      MB_THROW(qlib::OutOfMemoryException, "Cannot alloc PNG write struct");
      return;
    }

    png_infop pInfo = png_create_info_struct(pPNG);
    if (pInfo == NULL) {
      png_destroy_write_struct(&pPNG, (png_infopp) NULL);
      MB_THROW(qlib::OutOfMemoryException, "Cannot alloc PNG info struct");
      return;
    }

    if (setjmp(png_jmpbuf(pPNG))) {
      png_destroy_write_struct(&pPNG, &pInfo);
      MB_THROW(qlib::IOException, "Cannot write PNG image");
      return;
    }

    png_set_write_fn(pPNG, pOut, umb_png_write_fn, umb_png_flush_fn);

    const int color_type =
        (ncomp == 4) ? PNG_COLOR_TYPE_RGB_ALPHA : PNG_COLOR_TYPE_RGB;
    png_set_IHDR(pPNG, pInfo, width, height, 8, color_type,
                 PNG_INTERLACE_NONE, PNG_COMPRESSION_TYPE_BASE,
                 PNG_FILTER_TYPE_BASE);

    // Tag the file as sRGB (+ matching gAMA/cHRM). The renderer applies no
    // assumed_gamma and no sRGB OETF: the umbreon linear HDR framebuffer is
    // mapped straight to 8-bit (clamp [0,1] * 255). So the file bytes are
    // exactly linear, and the sRGB tag tells a color-managed viewer to apply
    // the sRGB transfer curve at display time (the intended gamma look).
    png_set_sRGB_gAMA_and_cHRM(pPNG, pInfo, PNG_sRGB_INTENT_PERCEPTUAL);

    png_write_info(pPNG, pInfo);

    const int rowbytes = width * ncomp;
    for (int y = 0; y < height; ++y) {
      png_write_row(pPNG, (png_bytep)(pBytes + y * rowbytes));
    }

    png_write_end(pPNG, pInfo);
    png_destroy_write_struct(&pPNG, &pInfo);
  }

  /// Parse a "#RRGGBB" hex string into display-encoded RGB floats in [0, 1].
  /// Returns false (leaving rgb untouched) for an empty or malformed string,
  /// so an unset color degrades to "keep the hatch style's own color" instead
  /// of throwing.
  bool parseHexColor(const LString &str, float rgb[3])
  {
    LString s = str.trim();
    if (s.startsWith("#"))
      s = s.substr(1);
    if (s.length() != 6)
      return false;
    int v[6];
    for (int i = 0; i < 6; ++i) {
      const char c = s[i];
      if (c >= '0' && c <= '9')
        v[i] = c - '0';
      else if (c >= 'a' && c <= 'f')
        v[i] = c - 'a' + 10;
      else if (c >= 'A' && c <= 'F')
        v[i] = c - 'A' + 10;
      else
        return false;
    }
    for (int k = 0; k < 3; ++k)
      rgb[k] = float(v[k * 2] * 16 + v[k * 2 + 1]) / 255.0f;
    return true;
  }

}  // anonymous namespace

UmbreonSceneExporter::UmbreonSceneExporter()
     : m_bPerspective(true), m_bUseClipZ(true), m_nSupersample(3),
       m_nAaMode(0), m_nAaDepth(0),
       m_nAoSamples(0), m_dAoDistance(1.0e20), m_dAoIntensity(1.0),
       m_dAoDiffuseFactor(0.0), m_bAoMultiScale(false), m_bAoBentNormal(false),
       m_bAoLowDiscrepancy(false), m_nAoResDiv(0),
       m_bShadows(false), m_nShadowSamples(1), m_dLightRadius(0.0),
       m_dLightIntensity(-1.0), m_dFlashFraction(-1.0),
       m_dAmbientFraction(-1.0),
       m_bEnableEdgeLines(true), m_dCreaseLimit(-1.0), m_dEdgeRise(0.5),
       m_bContactEdges(true), m_dOutlineFarDepth(0.95),
       m_bTransparentBackground(false),
       m_bGI(false), m_nGiSamples(32), m_dGiIntensity(1.0),
       m_dGiEnvIntensity(1.0), m_bGiDenoise(true), m_nDenoiser(0),
       m_bGiSkyGradient(true), m_sGiGroundColor("#666666"),
       m_bHatchEnable(false), m_sHatchStyle("richardson"),
       m_dHatchDensity(1.0), m_dHatchWidthScale(1.0),
       m_sHatchLayersSpec(""), m_sHatchToneSpec(""),
       m_dHatchToneStrength(1.0), m_dHatchToneCurve(1.0),
       m_sHatchBase(""), m_sHatchInk(""),
       m_sHatchInkColor(""), m_sHatchPaperColor(""),
       m_bHatchDefaultEdges(true),
       m_bWasCancelled(false)
{
}

UmbreonSceneExporter::~UmbreonSceneExporter()
{
}

void UmbreonSceneExporter::setupContext(UmbreonDisplayContext &ctx,
                                        UmbreonRenderParams &prm)
{
  ScenePtr pScene = getClient();
  qlib::ensureNotNull(pScene.get());

  CameraPtr pCam = getCamera();
  qlib::ensureNotNull(pCam.get());

  ctx.init();

  ctx.setPerspective(m_bPerspective);
  ctx.setBgColor(pScene->getBgColor());

  // Clip to the camera slab. The geometry is handed to umbreon unclipped; the
  // context turns this flag plus the slab depth / view distance set below into
  // umbreon's view-space near clip plane (Scene::clipNear), and umbreon does
  // the cutting.
  ctx.setClipZ(m_bUseClipZ);

  ctx.enableEdgeLines(m_bEnableEdgeLines);
  ctx.setCreaseLimit(m_dCreaseLimit);
  ctx.setEdgeRise(m_dEdgeRise);

  const double zoom = pCam->getZoom();
  ctx.setZoom(zoom);
  ctx.setSlabDepth(pCam->getSlabDepth());
  ctx.setViewDist(pCam->getCamDist());

  // Seed the model-view matrix with the camera (same as PovSceneExporter), so
  // the geometry handed to the context is already in eye space.
  ctx.loadIdent();
  ctx.rotate(pCam->m_rotQuat);
  ctx.translate(-(pCam->m_center));

  // Resolve image size, falling back to the first view's size.
  int width = getWidth();
  int height = getHeight();
  if ((width <= 0 || height <= 0) && pScene->getViewCount() > 0) {
    ViewPtr pView = pScene->beginView()->second;
    if (width <= 0)
      width = pView->getWidth();
    if (height <= 0)
      height = pView->getHeight();
  }
  if (width <= 0)
    width = 640;
  if (height <= 0)
    height = 480;

  // line/point width scale factor (pixel/angstrom), as in PovSceneExporter
  ctx.setLineScale(zoom / double(height));

  // Walk the scene, accumulating umbreon geometry per renderer section.
  pScene->display(&ctx);

  prm.width = width;
  prm.height = height;
  prm.supersample = m_nSupersample;
  prm.aaMode = m_nAaMode;
  prm.aaDepth = m_nAaDepth;
  prm.aoSamples = m_nAoSamples;
  prm.aoDistance = m_dAoDistance;
  prm.aoIntensity = m_dAoIntensity;
  prm.aoDiffuseFactor = m_dAoDiffuseFactor;
  prm.aoMultiScale = m_bAoMultiScale;
  prm.aoBentNormal = m_bAoBentNormal;
  prm.aoLowDiscrepancy = m_bAoLowDiscrepancy;
  prm.aoResDiv = m_nAoResDiv;
  prm.shadows = m_bShadows;
  prm.shadowSamples = m_nShadowSamples;
  prm.lightRadius = m_dLightRadius;
  prm.lightIntensity = m_dLightIntensity;
  prm.flashFraction = m_dFlashFraction;
  prm.ambientFraction = m_dAmbientFraction;
  prm.contactEdges = m_bContactEdges;
  prm.outlineFarDepth = m_dOutlineFarDepth;
  prm.transparentBackground = m_bTransparentBackground;
  prm.giEnabled = m_bGI;
  prm.giSamples = m_nGiSamples;
  prm.giIntensity = m_dGiIntensity;
  prm.giEnvIntensity = m_dGiEnvIntensity;
  prm.giDenoise = m_bGiDenoise;
  prm.denoiser = m_nDenoiser;
  prm.giSkyGradient = m_bGiSkyGradient;
  prm.giGroundColorSet = parseHexColor(m_sGiGroundColor, prm.giGroundColor);
  prm.hatchEnable = m_bHatchEnable;
  prm.hatchStyle = m_sHatchStyle;
  prm.hatchDensity = m_dHatchDensity;
  prm.hatchWidthScale = m_dHatchWidthScale;
  prm.hatchLayersSpec = m_sHatchLayersSpec;
  prm.hatchToneSpec = m_sHatchToneSpec;
  prm.hatchToneStrength = m_dHatchToneStrength;
  prm.hatchToneCurve = m_dHatchToneCurve;
  prm.hatchBase = m_sHatchBase;
  prm.hatchInk = m_sHatchInk;
  prm.hatchInkColorSet = parseHexColor(m_sHatchInkColor, prm.hatchInkColor);
  prm.hatchPaperColorSet =
      parseHexColor(m_sHatchPaperColor, prm.hatchPaperColor);
  prm.hatchDefaultEdges = m_bHatchDefaultEdges;
}

LString UmbreonSceneExporter::getHatchStyleSpec(const LString &name) const
{
  return UmbreonDisplayContext::hatchStyleSpec(name);
}

/////////////////////////////////
// Scene render settings -> exporter properties

namespace {

  /// Typed reads of a settings object's properties. The RenderSettings
  /// classes declare a default for every property, so a read fails only for
  /// a property the class does not have; the fallback (the exporter's own
  /// value) then stands.
  struct SettingsReader
  {
    const qlib::LPropSupport *p;

    bool b(const char *name, bool fallback) const
    {
      bool v = fallback;
      return p->getPropBool(name, v) ? v : fallback;
    }
    int i(const char *name, int fallback) const
    {
      int v = fallback;
      return p->getPropInt(name, v) ? v : fallback;
    }
    double r(const char *name, double fallback) const
    {
      double v = fallback;
      return p->getPropReal(name, v) ? v : fallback;
    }
    LString s(const char *name, const LString &fallback) const
    {
      LString v;
      return p->getPropStr(name, v) ? v : fallback;
    }
  };

  /// Image size in `unit` at `dpi` -> pixels (1in = 25.4mm = 2.54cm; px
  /// passes through). Same conversion as the tritium size fields
  /// (sizeUnitToPx) so the stored value means the same pixels everywhere.
  double sizeUnitToPx(double value, double dpi, const LString &unit)
  {
    if (unit.equals("in")) return value * dpi;
    if (unit.equals("mm")) return (value / 25.4) * dpi;
    if (unit.equals("cm")) return (value / 2.54) * dpi;
    return value;
  }

  int toPixels(double value, double dpi, const LString &unit)
  {
    const double px = sizeUnitToPx(value, dpi, unit);
    if (!std::isfinite(px)) return 1;
    return std::max(1, int(std::lround(px)));
  }

  /// Ambient fraction used while GI is off: the direct-lighting balance
  /// (1.55 / 0.6 / 0.16, the GI lighting ladder's step 0). Without GI the
  /// fraction only dims the direct lights, so the value chosen for GI must
  /// not leak into a raytraced image; pinned here, the direct lights equal
  /// the GI-off auto lights (1.3 * 0.4 / 1.3 * 0.6). Derivation:
  /// docs/architecture/umbreon-gi-lighting-balance.md
  const double DIRECT_AMBIENT_FRACTION = 0.16;

  /// GI denoise method (the settings' "denoise" string) -> the two exporter
  /// knobs: OIDN denoises the indirect buffer (giDenoise), A-trous runs the
  /// full-frame post pass (denoiser 1), None turns both off. Unknown = OIDN.
  void denoiseMode(const LString &name, bool &giDenoise, int &denoiser)
  {
    if (name.equals("A-trous")) {
      giDenoise = false;
      denoiser = 1;
    } else if (name.equals("None")) {
      giDenoise = false;
      denoiser = 0;
    } else {
      giDenoise = true;
      denoiser = 0;
    }
  }

  /// NPR coloring pattern (the settings' "hatchColoring" string) -> the
  /// exporter's hatchBase / hatchInk model overrides; empty strings keep the
  /// style's own model. Unknown = "Style default".
  void hatchColoring(const LString &name, LString &base, LString &ink)
  {
    if (name.equals("Ink on paper")) {
      base = "paper";
      ink = "fixed";
    } else if (name.equals("Colored ink on paper")) {
      base = "paper";
      ink = "albedo";
    } else if (name.equals("Ink on color fill")) {
      base = "albedo";
      ink = "fixed";
    } else if (name.equals("Colored ink on color fill")) {
      base = "albedo";
      ink = "albedo";
    } else {
      base = "";
      ink = "";
    }
  }

}  // anonymous namespace

LString UmbreonSceneExporter::applyRenderSettings(
    qlib::LScrSp<RenderSettings> pSettings, const LString &backend)
{
  if (pSettings.isnull()) {
    MB_THROW(qlib::NullPointerException,
             "applyRenderSettings: render settings object is null");
  }
  const SettingsReader rs{pSettings.get()};

  LString id = backend;
  if (id.isEmpty()) {
    // Resolve from the settings: only the NPR choice changes the block, any
    // other value (unchosen "", "povray") renders with the plain umbreon block.
    id = rs.s("backend", "").equals("umbreon_npr") ? "umbreon_npr" : "umbreon";
  } else if (!id.equals("umbreon") && !id.equals("umbreon_npr")) {
    MB_THROW(qlib::IllegalArgumentException,
             LString::format("applyRenderSettings: unknown backend '%s'",
                             backend.c_str()));
  }
  const bool npr = id.equals("umbreon_npr");

  // The block objects are owned by the settings object, which outlives this
  // call (the caller holds the smart pointer).
  const UmbreonRenderSettings *pBlock =
      npr ? static_cast<const UmbreonRenderSettings *>(pSettings->getUmbreonNpr().get())
          : pSettings->getUmbreon().get();
  qlib::ensureNotNull(pBlock);
  const SettingsReader ub{pBlock};

  //////////
  // Backend-independent settings

  m_bPerspective = rs.s("projection", "perspective").equals("perspective");
  m_bUseClipZ = rs.b("clipPlane", m_bUseClipZ);
  m_bEnableEdgeLines = rs.b("edgeLines", m_bEnableEdgeLines);
  m_bTransparentBackground = rs.b("transparentBg", m_bTransparentBackground);
  {
    const LString unit = rs.s("unit", "px");
    const double dpi = rs.r("dpi", 600.0);
    setWidth(toPixels(rs.r("width", 640.0), dpi, unit));
    setHeight(toPixels(rs.r("height", 480.0), dpi, unit));
  }

  //////////
  // umbreon block (shared by both backends)

  // Supersampling only: adaptive AA is unsupported alongside GI and not offered.
  m_nSupersample = ub.i("supersample", m_nSupersample);

  // AO on/off is a dedicated switch; off maps to aoSamples 0 (umbreon gates
  // every AO computation on aoSamples > 0). The AO recipe is written only
  // while AO is on: aoResDiv is read before that gate, and an out-resolution
  // gather sent alongside GI makes umbreon warn on every GI render. Left
  // alone the knobs keep the neutral ctor values.
  const bool aoEnabled = ub.b("aoEnabled", false);
  m_nAoSamples = aoEnabled ? ub.i("aoSamples", m_nAoSamples) : 0;
  if (aoEnabled) {
    m_dAoDistance = ub.r("aoDistance", m_dAoDistance);
    m_dAoIntensity = ub.r("aoIntensity", m_dAoIntensity);
    m_dAoDiffuseFactor = ub.r("aoDiffuseFactor", m_dAoDiffuseFactor);
    m_bAoMultiScale = ub.b("aoMultiScale", m_bAoMultiScale);
    m_bAoBentNormal = ub.b("aoBentNormal", m_bAoBentNormal);
    m_bAoLowDiscrepancy = ub.b("aoLowDiscrepancy", m_bAoLowDiscrepancy);
    // "Per output pixel" (-1, interpolated; the fast path) or "Per shading
    // hit" (0); unknown = per output pixel
    m_nAoResDiv = ub.s("aoGather", "Per output pixel").equals("Per shading hit") ? 0 : -1;
  }

  m_bShadows = ub.b("shadows", m_bShadows);
  m_nShadowSamples = ub.i("shadowSamples", m_nShadowSamples);
  m_dLightRadius = ub.r("lightRadius", m_dLightRadius);

  // Energy balance: hatch ink mode discards the shaded color, so GI is never
  // used with the NPR block. The ambient fraction is the block's value only
  // while GI actually renders.
  const bool useGI = !npr && ub.b("useGI", false);
  m_dLightIntensity = ub.r("lightIntensity", m_dLightIntensity);
  m_dFlashFraction = ub.r("flashFraction", m_dFlashFraction);
  m_dAmbientFraction =
      useGI ? ub.r("ambientFraction", m_dAmbientFraction) : DIRECT_AMBIENT_FRACTION;

  m_dCreaseLimit = ub.r("creaseLimit", m_dCreaseLimit);
  m_dEdgeRise = ub.r("edgeRise", m_dEdgeRise);
  m_bContactEdges = ub.b("contactEdges", m_bContactEdges);
  m_dOutlineFarDepth = ub.r("outlineFarDepth", m_dOutlineFarDepth);

  m_bGI = useGI;
  m_bHatchEnable = npr;

  if (npr) {
    //////////
    // NPR tone hatching. Colors are sent only while their Custom switch is
    // on; an empty string keeps the style's own colors.
    m_sHatchStyle = ub.s("hatchStyle", m_sHatchStyle);
    m_dHatchDensity = ub.r("hatchDensity", m_dHatchDensity);
    m_dHatchWidthScale = ub.r("hatchWidthScale", m_dHatchWidthScale);
    hatchColoring(ub.s("hatchColoring", "Style default"), m_sHatchBase, m_sHatchInk);
    m_sHatchInkColor =
        ub.b("hatchCustomInk", false) ? ub.s("hatchInkColor", "#000000") : LString();
    m_sHatchPaperColor =
        ub.b("hatchCustomPaper", false) ? ub.s("hatchPaperColor", "#ffffff") : LString();
    m_bHatchDefaultEdges = ub.b("hatchDefaultEdges", m_bHatchDefaultEdges);
    // A hand-edited look as spec text; "" (the stored value of an untouched
    // look) keeps the style's own layers and tone, like the ctor default.
    m_sHatchLayersSpec = ub.s("hatchLayersSpec", "");
    m_sHatchToneSpec = ub.s("hatchToneSpec", "");
  } else {
    //////////
    // Diffuse global illumination. The sample count is stored as the GUI's
    // option string; giIntensity / giEnvIntensity are not stored and stay
    // at the exporter's neutral 1.0 (the energy balance covers that ground).
    int nSamples = 32;
    if (!ub.s("giSamples", "32").toInt(&nSamples) || nSamples <= 0) nSamples = 32;
    m_nGiSamples = nSamples;
    denoiseMode(ub.s("denoise", "OIDN"), m_bGiDenoise, m_nDenoiser);
    m_bGiSkyGradient = ub.b("giSkyGradient", m_bGiSkyGradient);
    m_sGiGroundColor = ub.s("giGroundColor", m_sGiGroundColor);
  }

  return id;
}

void UmbreonSceneExporter::write()
{
  UmbreonDisplayContext ctx;
  UmbreonRenderParams prm;
  setupContext(ctx, prm);

  int ow = 0, oh = 0, ncomp = 0;
  std::vector<unsigned char> pix;
  ctx.render(prm, ow, oh, ncomp, pix);

  if (pix.empty() || ow <= 0 || oh <= 0) {
    MB_THROW(qlib::RuntimeException, "umbreon render produced no image");
    return;
  }

  qlib::OutStream *pOut = createOutStream();
  writePngToStream(pOut, ow, oh, &pix[0], ncomp);
  pOut->close();
  delete pOut;
}

//////////////////////////////////////////////////////////////
// Asynchronous render: beginRender() -> poll -> endRender().

void UmbreonSceneExporter::beginRender()
{
  if (m_pCtx) {
    MB_THROW(qlib::RuntimeException, "umbreon: render already in progress");
    return;
  }
  m_bWasCancelled = false;
  m_pCtx.reset(new UmbreonDisplayContext());

  // setupContext (scene walk) and startAsyncRender both run on the calling
  // thread; only the ray trace it kicks off runs on a background thread.
  UmbreonRenderParams prm;
  try {
    setupContext(*m_pCtx, prm);
    m_pCtx->startAsyncRender(prm);
  } catch (...) {
    m_pCtx.reset();
    throw;
  }
}

double UmbreonSceneExporter::getRenderProgress() const
{
  return m_pCtx ? m_pCtx->getProgress() : 0.0;
}

LString UmbreonSceneExporter::getRenderPhaseName() const
{
  return m_pCtx ? m_pCtx->getPhaseName() : LString("Idle");
}

bool UmbreonSceneExporter::isRenderDone() const
{
  // No render in flight -> report done so a polling loop terminates safely.
  return m_pCtx ? m_pCtx->isDone() : true;
}

void UmbreonSceneExporter::cancelRender()
{
  if (m_pCtx)
    m_pCtx->cancelRender();
}

void UmbreonSceneExporter::endRender()
{
  if (!m_pCtx) {
    MB_THROW(qlib::RuntimeException, "umbreon: no render in progress");
    return;
  }

  int ow = 0, oh = 0, ncomp = 0;
  std::vector<unsigned char> pix;
  bool cancelled = false;
  // Release the context on every path (the worker join happens inside
  // finishAsyncRender) so a later beginRender() is never blocked.
  try {
    m_pCtx->finishAsyncRender(ow, oh, ncomp, pix, cancelled);
  } catch (...) {
    m_pCtx.reset();
    throw;
  }
  m_pCtx.reset();

  m_bWasCancelled = cancelled;
  if (cancelled)
    return;  // cancelled render: no image is written

  if (pix.empty() || ow <= 0 || oh <= 0) {
    MB_THROW(qlib::RuntimeException, "umbreon render produced no image");
    return;
  }

  qlib::OutStream *pOut = createOutStream();
  writePngToStream(pOut, ow, oh, &pix[0], ncomp);
  pOut->close();
  delete pOut;
}

bool UmbreonSceneExporter::wasRenderCancelled() const
{
  return m_bWasCancelled;
}

LString UmbreonSceneExporter::getRenderLog() const
{
  return UmbreonDisplayContext::drainLog();
}

/// name of the writer
const char *UmbreonSceneExporter::getName() const
{
  return "umbreon";
}

/// file-type description
const char *UmbreonSceneExporter::getTypeDescr() const
{
  return "Umbreon ray-traced image (*.png)";
}

/// file extension
const char *UmbreonSceneExporter::getFileExt() const
{
  return "*.png";
}
