// -*-Mode: C++;-*-
//
// PNG image scene output class
//
// $Id: PngSceneExporter.cpp,v 1.3 2011/03/14 12:59:45 rishitani Exp $

#include <common.h>

//#include "View.hpp"
#include "PngSceneExporter.hpp"

#define HAVE_PNG_H 1
#include <libpng/png.h>

#include <qlib/FileStream.hpp>

using namespace render;

PngSceneExporter::PngSceneExporter()
{
  m_pPNG = NULL;
  m_pPNGInfo = NULL;
  m_bIntrl = false;
  m_nCompLev = 0;
}

PngSceneExporter::~PngSceneExporter()
{
}

/** name of the writer */
const char *PngSceneExporter::getName() const
{
  return "png";
}

/** get file-type description */
const char *PngSceneExporter::getTypeDescr() const
{
  return "Portable Network Graphics image (*.png)";
}

/** get file extension */
const char *PngSceneExporter::getFileExt() const
{
  return "*.png";
}

///////////////////////////////////////////////

#ifdef HAVE_PNG_H
namespace {
  void user_error_fn(png_structp png_ptr,
                     png_const_charp error_msg)
  {
    LOG_DPRINTLN("PNG: error %s", error_msg);
  }
  
  void user_warning_fn(png_structp png_ptr,
                       png_const_charp warning_msg)
  {
    LOG_DPRINTLN("PNG: warning %s", warning_msg);
  }

  void MyPNGWrite(png_structp png_ptr, png_bytep data, png_size_t length)
  {
    qlib::OutStream* pOut = reinterpret_cast<qlib::OutStream*>(png_get_io_ptr(png_ptr));
    pOut->write((const char*)data, 0, length);
  }

  void MyPNGFlush(png_structp png_ptr)
  {
    qlib::OutStream* pOut = reinterpret_cast<qlib::OutStream*>(png_get_io_ptr(png_ptr));
    pOut->flush();
  }

}
#endif

int PngSceneExporter::prepare(const char *filename)
{
  int nsize = super_t::prepare(filename);

#ifdef HAVE_PNG_H

  qlib::OutStream *pOut = getOutStream();
  MB_ASSERT(pOut!=NULL);
  
  int width = getWidth();
  int height = getHeight();
  png_structp pPNG;
  png_infop pInfo;

  m_pPNG = pPNG = png_create_write_struct(PNG_LIBPNG_VER_STRING,
                                          NULL, user_error_fn, user_warning_fn);

  // make write struct
  if (pPNG == NULL) {
    MB_THROW(qlib::OutOfMemoryException, "Cannot alloc PNG write struct");
    return -1;
  }

  // make info struct
  m_pPNGInfo = pInfo = png_create_info_struct(pPNG);
  if (pInfo == NULL) {
    png_destroy_write_struct(&pPNG, (png_infopp)NULL);
    return -1;
  }

  // set error fn : XXX
  if (setjmp(png_jmpbuf(pPNG))) {
    // If we get here, we had a problem reading the file 
    png_destroy_write_struct(&pPNG, &pInfo);
    MB_THROW(qlib::IOException, "Cannot write PNG file");
    return -1;
  }

  //png_init_io(pPNG, m_pFile);
  png_set_write_fn(pPNG, pOut, MyPNGWrite, MyPNGFlush);

  //int intrl = (m_bIntrl)?PNG_INTERLACE_ADAM7:PNG_INTERLACE_NONE;
  int intrl = PNG_INTERLACE_NONE;

  int color_type = (getUseAlpha())?PNG_COLOR_TYPE_RGB_ALPHA:PNG_COLOR_TYPE_RGB;

  png_set_IHDR(pPNG, pInfo, width, height, 8,
               color_type,
               intrl,
               PNG_COMPRESSION_TYPE_BASE,
               PNG_FILTER_TYPE_BASE);

  // Store resolution in ppm
  png_uint_32 xres = (png_uint_32)(39.37 * getResDPI() + 0.5);
  png_uint_32 yres = xres;
  png_set_pHYs(pPNG, pInfo, xres, yres, PNG_RESOLUTION_METER);

  png_write_info(pPNG, pInfo);

#endif

  return nsize;
}

/*
bool PngSceneExporter::request(int &posx, int &posy, int &width, int &height)
{
  if (m_nIter>=getHeight())
    return false;
  
  posx = 0;
  posy = getHeight()-1 - m_nIter;
  width = getWidth();
  height = 1;
  ++m_nIter;

  return true;
}
*/

void PngSceneExporter::writeData(const char *pbuf, int nsize)
{
  // nsize should be the same as the row size

#ifdef HAVE_PNG_H
  //m_pfos->write(pbuf, 0, nsize);
  png_structp pPNG = (png_structp) m_pPNG;
  png_write_row(pPNG, (png_bytep) pbuf);  
#endif
}

void PngSceneExporter::completed()
{
#ifdef HAVE_PNG_H
  png_structp pPNG = (png_structp) m_pPNG;
  png_infop pInfo = (png_infop) m_pPNGInfo;
  png_write_end(pPNG, pInfo);
  png_destroy_write_struct(&pPNG, &pInfo);
#endif

  super_t::completed();
}
