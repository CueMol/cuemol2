//
// Text rendering routine using Thebes API
//
// $Id: ThebesTextRender.cpp,v 1.16 2011/03/04 18:34:46 rishitani Exp $
//

#include <common.h>
//#include <boost/multi_array.hpp>
//#include <boost/shared_ptr.hpp>

#include <nsICanvasRenderingContextInternal.h>
#include <nsIDOMCanvasRenderingContext2D.h>

#include "ThebesTextRender.hpp"
#include <nsIAtom.h>
#include <nsILanguageAtomService.h>

//////////

#include <qlib/Utils.hpp>

using qlib::LString;

//#define _num_to_str(num) #num
//#define num_to_str(num) _num_to_str(num)
//#pragma message ("mozilla_mozalloc_h = " num_to_str(mozilla_mozalloc_h))
/*
namespace {
  gfxFontStyle *gpFontStyle = NULL;

  class StubPropertyProvider : public gfxTextRun::PropertyProvider
  {
  public:
    virtual void GetHyphenationBreaks(PRUint32 aStart, PRUint32 aLength,
                                      PRPackedBool* aBreakBefore)
    {
      NS_ERROR("This shouldn't be called because we never call BreakAndMeasureText");
    }
    virtual gfxFloat GetHyphenWidth()
    {
      NS_ERROR("This shouldn't be called because we never enable hyphens");
      return 0;
    }
    virtual void GetSpacing(PRUint32 aStart, PRUint32 aLength,
                            Spacing* aSpacing)
    {
      NS_ERROR("This shouldn't be called because we never enable spacing");
    }

#if (GECKO_SDK_MAJOR_VER>=6)
    virtual PRInt8 GetHyphensOption()
    {
      return 0;
    }
#endif
  };

}
*/

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

#define _num_to_str(num) #num
#define num_to_str(num) _num_to_str(num)

/////////////////////////////////////////////////////////////////////////////////////

/// Convert Thebes image surface data to qlib PixelBuffer object
void ThebesTextRender::convertToPixelBuffer(gfx::PixelBuffer &bytes, int w, int h)
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

ThebesTextRender::ThebesTextRender()
{
  //m_pBytes = NULL;
  //m_nByteSize = 0;
  mThebesSurface = new gfxMySurface(gfxIntSize(1, 1), gfxASurface::ImageFormatARGB32);
  mThebesSurface->AddRef();
  mThebesContext = new gfxContext(mThebesSurface);
  mThebesContext->AddRef();
//  mFontGroup = NULL;
  // mFontStyle = NULL;
  m_dFontSize = 0.0;
  m_nFontStyle = 0;
  m_nFontWeight = 0;
  //m_bUseAA = false;
  m_bUseAA = true;
}

ThebesTextRender::~ThebesTextRender()
{
  // if (mFontStyle != NULL)
  // delete mFontStyle;

  delete mThebesContext;
  //delete mThebesSurface;

  //mThebesContext->Release();
  mThebesSurface->Release();
//  if (mFontGroup != NULL)
//    mFontGroup->Release();
}

bool ThebesTextRender::setupFont(double fontsize, const LString &fontname,
				 const LString &font_style,
				 const LString &font_wgt)
{
/*  PRUint8 nStyle;
  PRUint16 nWeight;

  if (font_style.equalsIgnoreCase("italic")) {
    nStyle = FONT_STYLE_ITALIC;
  }
  else if (font_style.equalsIgnoreCase("oblique")) {
    nStyle = FONT_STYLE_OBLIQUE;
  }
  //else if (font_style.equalsIgnoreCase("normal")) {
  else {
    // default is normal
    nStyle = FONT_STYLE_NORMAL;
  }

  if (font_wgt.equalsIgnoreCase("bold")) {
    nWeight = FONT_WEIGHT_BOLD;
  }
  //if (font_wgt.equalsIgnoreCase("normal")) {
  else {
    // default is normal
    nWeight = FONT_WEIGHT_NORMAL;
  }

  if (mFontGroup==NULL) {
    // font-group not initialized
    m_dFontSize = fontsize;
    m_strFontName = fontname;
    m_nFontStyle = nStyle;
    m_nFontWeight = nWeight;
    return true;
  }

  if (qlib::isNear4(m_dFontSize, fontsize) &&
      m_strFontName.equals(fontname) &&
      m_nFontStyle==nStyle &&
      m_nFontWeight==nWeight)
    return true; // already has the same fontface

  // font face is changed --> invalidate the existing font-group
  mFontGroup->Release();
  mFontGroup = NULL;
*/

  m_dFontSize = fontsize;
  m_strFontName = fontname;

  return true;
}

void ThebesTextRender::makeFontGroup()
{
/*
  MB_ASSERT(mFontGroup==NULL);

  if (gpFontStyle==NULL)
    setupGlobalFontStyle();

  MB_ASSERT(gpFontStyle!=NULL);
    
  // gfxFontStyle &style = *(mFontStyle);
  gfxFontStyle &style = *gpFontStyle;

  style.style = m_nFontStyle;
  style.weight = m_nFontWeight;
  style.size = gfxFloat(m_dFontSize);
  style.sizeAdjust = 0.0;
  style.systemFont = PR_FALSE;
  //style.familyNameQuirks = PR_FALSE;

  nsAutoString ucs16;
  nsAutoCString nsstr(m_strFontName.c_str());
  ::CopyUTF8toUTF16(nsstr, ucs16);
  mFontGroup =
    gfxPlatform::GetPlatform()->CreateFontGroup(ucs16, &style, nsnull);
    
  mFontGroup->AddRef();
*/
}

void ThebesTextRender::setupGlobalFontStyle()
{
/*
  if (gpFontStyle==NULL) {
    gpFontStyle = new gfxFontStyle;

    if (gpFontStyle->language.get()==NULL) {
      LOG_DPRINTLN("ERROR: setupFONT style.language=%p", gpFontStyle->language.get());

      nsCOMPtr<nsILanguageAtomService> langService;
      langService = do_GetService(NS_LANGUAGEATOMSERVICE_CONTRACTID);
      gpFontStyle->language = langService->GetLocaleLanguage();

      LOG_DPRINTLN("--> setupFONT style.language=%p", gpFontStyle->language.get());
    }
  }
*/
}

bool ThebesTextRender::makeSurface(int w, int h)
{
  //mThebesContext->Release();
  delete mThebesContext;
  int n = (int) mThebesSurface->Release();
  //m_n = n;
  //delete mThebesSurface;
    
  gfxASurface::gfxImageFormat nfmt;
  if (m_bUseAA)
    nfmt = gfxASurface::ImageFormatA8;
  else
    nfmt = gfxASurface::ImageFormatA1;
  mThebesSurface = new gfxMySurface(gfxIntSize(w, h), nfmt);
  mThebesSurface->AddRef();

  mThebesContext = new gfxContext(mThebesSurface);
  mThebesContext->AddRef();

  return true;
}

#if 0
bool ThebesTextRender::measureText(const LString &str, gfxTextRun::Metrics &rval)
{
  const PRUint8 *pstr = reinterpret_cast<const PRUint8 *>(str.c_str());

  if (mFontGroup==NULL)
    makeFontGroup();

  // XXX
  PRUint32 aupdp = 1, aupcp = 1;
  PRUint32 textrunflags = 0;

  //gfxTextRunCache::AutoTextRun textRun;
  gfxTextRun *textRun;
  textRun = gfxTextRunCache::MakeTextRun(pstr,
					 str.length(),
					 mFontGroup,
					 mThebesContext,
					 aupdp,
					 textrunflags);

  if(!textRun)
    return false;

  PRBool tightBoundingBox = PR_FALSE;
  rval =
    textRun->MeasureText(/* offset = */ 0, str.length(),
			 gfxFont::TIGHT_INK_EXTENTS, mThebesContext,
			 nsnull);

  gfxTextRunCache::ReleaseTextRun(textRun);
  return true;
}
#endif

////////////////////////////////////////////

namespace {

  nsIDOMCanvasRenderingContext2D* gCtx = NULL;

  nsresult GetRenderingContext(nsIDocShell *shell, gfxASurface *surface,
                               PRUint32 width, PRUint32 height)
  {
    nsresult rv;
    nsCOMPtr<nsIDOMCanvasRenderingContext2D> ctx = gCtx;

    if (!ctx) {
      // create the canvas rendering context
      //ctx = do_CreateInstance("@mozilla.org/content/canvas-rendering-context;1?id=2d", &rv);
      ctx = do_CreateInstance("@mozilla.org/content/2dthebes-canvas-rendering-context;1", &rv);
      if (NS_FAILED(rv)) {
        //NS_WARNING("Could not create nsICanvasRenderingContextInternal for tab previews!");
        return rv;
      }
      gCtx = ctx;
      NS_ADDREF(gCtx);
    }

    nsCOMPtr<nsICanvasRenderingContextInternal> ctxI = do_QueryInterface(ctx, &rv);
    if (NS_FAILED(rv))
      return rv;

    // Set the surface we'll use to render.
    return ctxI->InitializeWithSurface(shell, surface, width, height);
  }

  void ResetRenderingContext()
  {
    if (!gCtx)
      return;

    nsresult rv;
    nsCOMPtr<nsICanvasRenderingContextInternal> ctxI = do_QueryInterface(gCtx, &rv);
    if (NS_FAILED(rv))
      return;
    if (NS_FAILED(ctxI->Reset())) {
      NS_RELEASE(gCtx);
      gCtx = nsnull;
    }
  }

}

bool ThebesTextRender::renderText(const qlib::LString &str, gfx::PixelBuffer &buf)
{
  {
    LString fontname = LString::format("%dpx %s", int(m_dFontSize), m_strFontName.c_str());
    nsAutoCString nsstr;
    nsAutoString ucs16;
    float fwidth;

    nsIDocShell *pDocShell = getDocShell();
    if (pDocShell!=NULL) {
      nsresult rv = GetRenderingContext(pDocShell, mThebesSurface, 1, 1);

      nsstr = nsAutoCString(fontname.c_str());
      ::CopyUTF8toUTF16(nsstr, ucs16);
      gCtx->SetFont(ucs16);
 
      nsstr = nsAutoCString(str.c_str());
      ::CopyUTF8toUTF16(nsstr, ucs16);

      nsCOMPtr<nsIDOMTextMetrics> metrics;
      rv = gCtx->MeasureText(ucs16, getter_AddRefs(metrics));
      metrics->GetWidth(&fwidth);

      //nsIDOMTextMetrics *pmetrics = NULL;
      //rv = gCtx->MeasureText(ucs16, &pmetrics);
      //if (pmetrics==NULL)
      //fwidth = 100;
      //      else
      //  pmetrics->GetWidth(&fwidth);

      MB_DPRINTLN("texxt width: %f", fwidth);

      ResetRenderingContext();
    }

    int width = (int) ceil(fwidth);
    if (width%4!=0)
      width += (4-width%4);

    //int height = (int) ceil(m_dFontSize*3.0);
    int height = (int) ceil(m_dFontSize);

    if (pDocShell!=NULL) {
      if (!makeSurface(width, height))
        return false;
      nsresult rv = GetRenderingContext(pDocShell, mThebesSurface, width, height);

      nsstr = nsAutoCString(fontname.c_str());
      ::CopyUTF8toUTF16(nsstr, ucs16);
      gCtx->SetFont(ucs16);

      gCtx->GetFont(ucs16);
      ::CopyUTF16toUTF8(ucs16, nsstr);
      const char *pstr = ToNewCString(nsstr);
      MB_DPRINTLN("font: %s", pstr);

      nsstr = nsAutoCString(str.c_str());
      ::CopyUTF8toUTF16(nsstr, ucs16);

      rv = gCtx->FillText(ucs16, 0, m_dFontSize, 0);

      ResetRenderingContext();
      convertToPixelBuffer(buf, width, height);
      return true;
    }
  }
  
  return false;

/*  
  ///////////////////////////////////////////////////////////
  
  //MB_DPRINTLN("renderImpl called... %f, %f", xxx.x, xxx.y);

  gfxTextRun::Metrics mtx;
  if (!measureText(str, mtx)) {
    LOG_DPRINTLN("measure text failed");
    return false;
  }
    
  MB_ASSERT(mFontGroup!=NULL);

  //MB_DPRINTLN("RenderText (w,h) = %f,%f", mtx.mBoundingBox.Width(), mtx.mBoundingBox.Height());
  //MB_DPRINTLN("RenderText (x,y) = %f,%f", mtx.mBoundingBox.X(), mtx.mBoundingBox.Y());
    
  int width = (int) ceil( mtx.mBoundingBox.Width() );
  int height = (int) ceil( mtx.mBoundingBox.Height() );

  if (width%4!=0)
    width += (4-width%4);

  //return false;
    
  if (!makeSurface(width, height))
    return false;

  const PRUint8 *pstr = reinterpret_cast<const PRUint8 *>(str.c_str());
  PRUint32 textrunflags = 0;

  // XXX
  PRUint32 aupdp = 1;

  gfxTextRunCache::AutoTextRun textRun;
  textRun = gfxTextRunCache::MakeTextRun(pstr,
					 str.length(),
					 mFontGroup,
					 mThebesContext,
					 aupdp,
					 textrunflags);

  if(!textRun.get())
    return false;

  //gfxPoint pt(0.0f, -mtx.mBoundingBox.Y());
  gfxPoint pt(0.0f, height);

  mThebesContext->SetColor(gfxRGBA(0.0, 0.0, 0.0, 0.0));
  mThebesContext->Paint();
  mThebesContext->SetColor(gfxRGBA(1.0, 1.0, 1.0, 1.0));

  StubPropertyProvider provider;
  int nStart = 0;
  int nLen = str.length();
  //MB_DPRINTLN("StubPropProvider addr=%p", &provider);
  //MB_DPRINTLN("pt addr=%p", &pt);
  //MB_DPRINTLN("str=%s", str.c_str());
  //MB_DPRINTLN("str.len=%d", nLen);

#if (GECKO_SDK_MAJOR_VER>=6)
  textRun->Draw(mThebesContext, // aContext
		pt, // aPt
		nStart, // aStart
		nLen, // aLength
		&provider, // aProvider
		nsnull // aAdvancedWidth
		);
#else
  textRun->Draw(mThebesContext,
		pt,
		nStart, nLen,
#if (GECKO_SDK_MAJOR_VER>=2)
		nsnull,
#endif
		&provider,
		nsnull);
#endif

  convertToPixelBuffer(buf, width, height);
  return true;
*/
}


gfx::TextRenderImpl *createTextRender()
{
  ThebesTextRender *pTTR = new ThebesTextRender;
  pTTR->setupFont(12.0, "sans-serif", "normal", "normal");
  //pTTR->setupFont(20.0, "Times New Roman", FONT_STYLE_NORMAL, FONT_WEIGHT_NORMAL);

  return pTTR;
}

void destroyTextRender(void *pTR)
{
  ThebesTextRender *pTTR = static_cast<ThebesTextRender *>(pTR);
  delete pTTR;
}

