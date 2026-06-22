// -*-Mode: C++;-*-
//
//  Umbreon ray-traced image scene exporter implementation
//

#include <common.h>

#include "UmbreonSceneExporter.hpp"
#include "UmbreonDisplayContext.hpp"

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
  /// the whole framebuffer in one pass.
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

    // Tag the file as sRGB (+ matching gAMA/cHRM). This is paired with the
    // exporter's default assumedGamma=2.2: applyAssumedGamma(.,2.2) ~ an sRGB
    // DECODE that cancels srgbEncode8, so the file bytes are ~linear, and the
    // sRGB tag makes a color-managed viewer apply exactly one sRGB transfer for
    // display (the correct look). Without the tag those ~linear bytes show too
    // dark; with assumedGamma=1.0 the bytes are already sRGB and the tag would
    // double-encode (too bright).
    png_set_sRGB_gAMA_and_cHRM(pPNG, pInfo, PNG_sRGB_INTENT_PERCEPTUAL);

    png_write_info(pPNG, pInfo);

    const int rowbytes = width * ncomp;
    for (int y = 0; y < height; ++y) {
      png_write_row(pPNG, (png_bytep)(pBytes + y * rowbytes));
    }

    png_write_end(pPNG, pInfo);
    png_destroy_write_struct(&pPNG, &pInfo);
  }

}  // anonymous namespace

UmbreonSceneExporter::UmbreonSceneExporter()
     : m_bPerspective(true), m_nSupersample(3), m_nAoSamples(0),
       m_bShadows(false), m_bEnableEdgeLines(true), m_dCreaseLimit(-1.0),
       m_dEdgeRise(0.5), m_dAssumedGamma(2.2)
{
}

UmbreonSceneExporter::~UmbreonSceneExporter()
{
}

void UmbreonSceneExporter::write()
{
  ScenePtr pScene = getClient();
  qlib::ensureNotNull(pScene.get());

  CameraPtr pCam = getCamera();
  qlib::ensureNotNull(pCam.get());

  UmbreonDisplayContext ctx;
  ctx.init();

  ctx.setPerspective(m_bPerspective);
  ctx.setBgColor(pScene->getBgColor());

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

  UmbreonRenderParams prm;
  prm.width = width;
  prm.height = height;
  prm.supersample = m_nSupersample;
  prm.aoSamples = m_nAoSamples;
  prm.shadows = m_bShadows;
  prm.assumedGamma = m_dAssumedGamma;

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
