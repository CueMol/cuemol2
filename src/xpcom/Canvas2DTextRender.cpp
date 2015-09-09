//
// Text rendering routine using HTML5 Canvas 2D
//

#include "xpcom.hpp"

#include <nsICanvasRenderingContextInternal.h>

#include "Canvas2DTextRender.hpp"

//
#include <nsIPresShell.h>
#include <nsIDocument.h>

//////////

#include <qlib/Utils.hpp>

using qlib::LString;

#ifdef WIN32

class gfxMySurface : public gfxImageSurface
{
public:
  gfxMySurface(const gfxIntSize& size, gfxImageFormat format)
       :gfxImageSurface(size, format) {}

  gfxMySurface(cairo_surface_t *csurf)
       :gfxImageSurface(csurf){}

  virtual ~gfxMySurface()
  {
    //MB_DPRINTLN("surface %p destructed.", this);
  }
  
  nsresult BeginPrinting(const nsAString& aTitle, const nsAString& aPrintToFileName)
  {
    return NS_OK;
  }
  
  nsresult EndPrinting()
  {
    return NS_OK;
  }
  
  nsresult AbortPrinting()
  {
    return NS_OK;
  }
};

#else

typedef gfxImageSurface gfxMySurface;

#endif

/////////////////////////////////////////////////////////////////////////////////////

/// Convert Thebes image surface data to qlib PixelBuffer object
void Canvas2DTextRender::convertToPixelBuffer(gfx::PixelBuffer &bytes, int w, int h)
{
  int i, j;

  gfxImageSurface *pImgSurf = static_cast<gfxImageSurface *>(mThebesSurface);
  QUE_BYTE *psf = pImgSurf->Data();
  int stride = pImgSurf->Stride();
  int ntype = pImgSurf->Format();
    
  //ConstArrayRef source(psf, boost::extents[h][w][4]);

  if (ntype==gfxASurface::ImageFormatA8) {
    int nsize = w*h;
    if (bytes.size()<nsize)
      bytes.resize(nsize);

    ConstArrayRef source(psf, boost::extents[h][w][1]);
    ArrayRef dest(bytes.data(), boost::extents[h][w][1]);
    for (j=0; j<h; j++) {
      for (i=0; i<w; i++) {
	//MB_DPRINTLN("(x=%d,y=%d,c=%d) = %d", i,j,0,xxx);
	dest[h-j-1][i][0] = source[j][i][0];
      }
    }

    bytes.setDepth(8);
    bytes.setWidth(w);
    bytes.setHeight(h);
  }
  else if (ntype==gfxASurface::ImageFormatA1) {
    int w2 = w/8;
    if (w2%4!=0)
      w2 += (4-w2%4);
    int nsize = w2*h;

    if (bytes.size()<nsize)
      bytes.resize(nsize);

    QUE_BYTE *dest = bytes.data();
    const QUE_BYTE *source = psf;
    for (j=0; j<h; ++j) {
      int mj = h-j-1;
      for (i=0; i<stride; i++) {
	QUE_BYTE val = source[j*stride+i];
	val = bit_reverse(val);
	dest[mj*w2+i] = val;
      }
      for (; i<w2; i++) {
	dest[mj*w2+i] = 0;
      }
    }

    bytes.setDepth(1);
    bytes.setWidth(w);
    bytes.setHeight(h);
  }

}

Canvas2DTextRender::Canvas2DTextRender()
{
  mThebesSurface = new gfxMySurface(gfxIntSize(1, 1), gfxASurface::ImageFormatARGB32);
  mThebesSurface->AddRef();

  m_dFontSize = 0.0;
  //m_nFontStyle = 0;
  //m_nFontWeight = 0;

  m_bUseAA = true;
}

Canvas2DTextRender::~Canvas2DTextRender()
{
  mThebesSurface->Release();
}

bool Canvas2DTextRender::setupFont(double fontsize, const LString &fontname,
				 const LString &font_style,
				 const LString &font_wgt)
{
  LString cssfont;

  // Font style
  if (font_style.equalsIgnoreCase("italic")) {
    cssfont += "italic ";
  }
  else if (font_style.equalsIgnoreCase("oblique")) {
    cssfont += "oblique ";
  }
  //else if (font_style.equalsIgnoreCase("normal"))
  // normal may be default

  // Font weight
  if (font_wgt.equalsIgnoreCase("bold")) {
    cssfont += "bold ";
  }
  //if (font_wgt.equalsIgnoreCase("normal")) {
  // default is normal

  // Font size (always in pixel)
  cssfont += LString::format("%dpx ", int(fontsize));
  cssfont += fontname;

  m_dFontSize = fontsize;
  m_strFontName = fontname;
  m_strCSSFont = cssfont;

  return true;
}

bool Canvas2DTextRender::makeSurface(int w, int h)
{
  int n = (int) mThebesSurface->Release();
    
  gfxASurface::gfxImageFormat nfmt;
  if (m_bUseAA)
    nfmt = gfxASurface::ImageFormatA8;
  else
    nfmt = gfxASurface::ImageFormatA1;
  mThebesSurface = new gfxMySurface(gfxIntSize(w, h), nfmt);
  mThebesSurface->AddRef();

  return true;
}

////////////////////////////////////////////

nsresult Canvas2DTextRender::getRenderingContext(PRUint32 width, PRUint32 height)
{
  nsresult rv;
  
  if (!mCanvasCtx) {
    // create the canvas rendering context
    //ctx = do_CreateInstance("@mozilla.org/content/canvas-rendering-context;1?id=2d", &rv);
    mCanvasCtx = do_CreateInstance("@mozilla.org/content/2dthebes-canvas-rendering-context;1", &rv);
    if (NS_FAILED(rv)) {
      //NS_WARNING("Could not create nsICanvasRenderingContextInternal for tab previews!");
      return rv;
    }
    //NS_ADDREF(mCanvasCtx);
  }
  
  nsIDocShell *pDocShell = getDocShell();
  if (pDocShell==NULL)
    return NS_ERROR_FAILURE;
  
  //nsCOMPtr<nsIPresShell> presShell;
  //pDocShell->GetPresShell(getter_AddRefs(presShell));
  //nsIDocument *documentNode = presShell->GetDocument();

  nsCOMPtr<nsICanvasRenderingContextInternal> ctxI = do_QueryInterface(mCanvasCtx, &rv);
  if (NS_FAILED(rv))
    return rv;
  
  // Set the surface we'll use to render.
  return ctxI->InitializeWithSurface(pDocShell, mThebesSurface, width, height);
}

void Canvas2DTextRender::resetRenderingContext()
{
  if (!mCanvasCtx)
    return;
  
  nsresult rv;
  nsCOMPtr<nsICanvasRenderingContextInternal> ctxI = do_QueryInterface(mCanvasCtx, &rv);
  if (NS_FAILED(rv))
    return;
  if (NS_FAILED(ctxI->Reset())) {
    //NS_RELEASE(gCtx);
    mCanvasCtx = nullptr;
  }
}

bool Canvas2DTextRender::renderText(const qlib::LString &str, gfx::PixelBuffer &buf)
{

  //LString fontname = LString::format("%dpx %s", int(m_dFontSize), m_strFontName.c_str());
  LString fontname = m_strCSSFont;
  nsAutoCString nsstr;
  nsAutoString ucs16;
  float fwidth;

  nsresult rv;
  rv = getRenderingContext(1, 1);
  NS_ENSURE_SUCCESS(rv, false);

  nsstr = nsAutoCString(fontname.c_str());
  ::CopyUTF8toUTF16(nsstr, ucs16);
  mCanvasCtx->SetFont(ucs16);
  
  nsstr = nsAutoCString(str.c_str());
  ::CopyUTF8toUTF16(nsstr, ucs16);
  
  nsCOMPtr<nsIDOMTextMetrics> metrics;
  rv = mCanvasCtx->MeasureText(ucs16, getter_AddRefs(metrics));
  if ( NS_FAILED(rv) ) {
    fwidth = 100;
  }
  else {
    metrics->GetWidth(&fwidth);
  }
  
  MB_DPRINTLN("texxt width: %f", fwidth);
  
  resetRenderingContext();

  //////////////////////////////

  int width = (int) ceil(fwidth);
  if (width%4!=0)
    width += (4-width%4);
  
  //int height = (int) ceil(m_dFontSize*3.0);
  int height = (int) ceil(m_dFontSize);
  
  if (!makeSurface(width, height))
    return false;

  rv = getRenderingContext(width, height);
  NS_ENSURE_SUCCESS(rv, false);

  nsstr = nsAutoCString(fontname.c_str());
  ::CopyUTF8toUTF16(nsstr, ucs16);
  mCanvasCtx->SetFont(ucs16);

  //mCanvasCtx->GetFont(ucs16);
  //::CopyUTF16toUTF8(ucs16, nsstr);
  //const char *pstr = ToNewCString(nsstr);
  //MB_DPRINTLN("font: %s", pstr);

  nsstr = nsAutoCString(str.c_str());
  ::CopyUTF8toUTF16(nsstr, ucs16);
  
  rv = mCanvasCtx->FillText(ucs16, 0, float(m_dFontSize), 0);
  NS_ENSURE_SUCCESS(rv, false);

  resetRenderingContext();
  convertToPixelBuffer(buf, width, height);
  return true;
}  

#if 0
gfx::TextRenderImpl *createTextRender()
{
  Canvas2DTextRender *pTTR = new Canvas2DTextRender;
  pTTR->setupFont(12.0, "sans-serif", "normal", "normal");
  //pTTR->setupFont(20.0, "Times New Roman", FONT_STYLE_NORMAL, FONT_WEIGHT_NORMAL);

  return pTTR;
}

void destroyTextRender(void *pTR)
{
  Canvas2DTextRender *pTTR = static_cast<Canvas2DTextRender *>(pTR);
  delete pTTR;
}
#endif

