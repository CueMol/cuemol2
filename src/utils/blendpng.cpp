//
// PNG alpha blending utility
//

#if defined(HAVE_CONFIG_H)
# include "config.h"
#elif defined(WIN32)
# define HAVE_PNG_H
#endif

#include <stdio.h>
#include <math.h>
#include <stdlib.h>

#include <string>
#include <locale>
#include <iostream>
#include <vector>
#include <algorithm>

#include <libpng/png.h>

void usage()
{
  std::cerr << "Usage: blendpng file1 file2 alpha2 [file3 alpha3 ...] output" << std::endl;
}

class PNGImage
{
public:
  unsigned char **m_ppImage;
  
  png_uint_32 m_nWidth, m_nHeight, m_nRowSize;

  int m_nBitDepth, m_nColorType, m_nIntrType;

  static const int NCOMP = 3;

  double m_alpha;

public:
  PNGImage()
    : m_ppImage(NULL), m_nWidth(0), m_nHeight(0), m_nRowSize(0),
      m_nBitDepth(0), m_nColorType(0), m_nIntrType(0), m_alpha(1.0),
      m_dpi(-1.0)
  {}

  PNGImage(int w, int h)
    : m_nWidth(w), m_nHeight(h), 
      m_nBitDepth(8), m_nColorType(PNG_COLOR_TYPE_RGB),
      m_nIntrType(PNG_INTERLACE_NONE), m_alpha(1.0),
      m_dpi(-1.0)
  {
    m_nRowSize = w * NCOMP;
    m_ppImage = new png_bytep[m_nHeight];
    for (int i = 0; i < m_nHeight; i++)
      m_ppImage[i] = (png_bytep) new unsigned char[m_nRowSize];
  }

  ~PNGImage()
  {
    cleanup();
  }

  ////////////////////

  void copyFrom(const PNGImage &orig)
  {
    m_nWidth = orig.m_nWidth;
    m_nHeight = orig.m_nHeight;
    m_nBitDepth = orig.m_nBitDepth;
    m_nColorType = orig.m_nColorType;
    m_nIntrType = orig.m_nIntrType;
    m_nRowSize = orig.m_nRowSize;
    
    m_ppImage = new png_bytep[m_nHeight];
    for (int i = 0; i < m_nHeight; i++) {
      m_ppImage[i] = (png_bytep) new unsigned char[m_nRowSize];
      for (int j = 0; j < m_nRowSize; j++) {
        m_ppImage[i][j] = orig.m_ppImage[i][j];
      }
    }
  }

  unsigned char *m_pAlpha;

  void allocAlpha()
  {
    const int nsize = m_nHeight * m_nWidth;
    m_pAlpha = new unsigned char[nsize];
    for (int i=0; i<nsize; ++i)
      m_pAlpha[i] = 0;
  }

  unsigned char getAlpha(int x, int y) const
  {
    return m_pAlpha[x + y * m_nWidth];
  }
  void setAlpha(int x, int y, unsigned char b)
  {
    m_pAlpha[x + y * m_nWidth] = b;
  }

  unsigned char getAt(int x, int y, int c) const
  {
    return m_ppImage[y][x*NCOMP+c];
  }

  void setAt(int x, int y, int c, unsigned char val)
  {
    m_ppImage[y][x*NCOMP+c] = val;
  }

  void cleanup()
  {
    if (m_ppImage!=NULL)
      for (int i = 0; i < m_nHeight; i++)
	delete [] m_ppImage[i];
    delete [] m_ppImage;
  }

  bool read(const std::string &fname)
  {
    int i;
    cleanup();

    FILE *fp = fopen(fname.c_str(), "rb");
    if (fp==NULL)
      return false;

    png_structp png_ptr = png_create_read_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
    png_infop info_ptr = png_create_info_struct(png_ptr);
    png_init_io(png_ptr, fp);
    png_read_info(png_ptr, info_ptr);

    png_get_IHDR(png_ptr, info_ptr, &m_nWidth, &m_nHeight,
		 &m_nBitDepth, &m_nColorType, &m_nIntrType,
		 NULL, NULL);
    m_nRowSize = png_get_rowbytes(png_ptr, info_ptr);

    m_ppImage = new png_bytep[m_nHeight];

    for (i = 0; i < m_nHeight; i++)
      m_ppImage[i] = (png_bytep) new unsigned char[m_nRowSize];
    png_read_image(png_ptr, m_ppImage);
    png_destroy_read_struct(&png_ptr, &info_ptr, (png_infopp) NULL);
    fclose(fp);
    return true;
  }

  bool write(const std::string &fname)
  {
    FILE            *fp;
    png_structp     png_ptr;
    png_infop       info_ptr;
    
    fp = fopen(fname.c_str(), "wb");
    if (fp==NULL) return false;

    png_ptr = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
    info_ptr = png_create_info_struct(png_ptr);
    png_init_io(png_ptr, fp);

    png_set_IHDR(png_ptr, info_ptr, m_nWidth, m_nHeight,
		 8, PNG_COLOR_TYPE_RGB, PNG_INTERLACE_NONE,
		 PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);

    // Store resolution in ppm
    if (m_dpi>0) {
      png_uint_32 xres = (png_uint_32)(39.37 * m_dpi + 0.5);
      png_uint_32 yres = xres;
      png_set_pHYs(png_ptr, info_ptr, xres, yres, PNG_RESOLUTION_METER);
    }

    png_write_info(png_ptr, info_ptr);
    png_write_image(png_ptr, m_ppImage);
    png_write_end(png_ptr, info_ptr);
    png_destroy_write_struct(&png_ptr, &info_ptr);
    fclose(fp);

    return true;
  }

  double m_dpi;
  double getResDPI() const {
    return m_dpi;
  }
  void setResDPI(double dpi) {
    m_dpi = dpi;
  }
};

bool isNear(int a, int b)
{
  int del = a-b;
  if (del<0)
    del = -del;
  if (del<10)
    return true;

  return false;
}

bool compare_alpha(const PNGImage *pImg1, const PNGImage *pImg2)
{
  return pImg1->m_alpha > pImg2->m_alpha;
}

void writeDPI(const char *inpath, const char *outpath, const char *sdpi)
{
  char *endptr;
  double dpi = strtod(sdpi, &endptr);
  if (sdpi==endptr)
    dpi = -1.0;

  PNGImage img;
  if (!img.read(inpath)) {
    std::cerr << "Open input :[" << inpath << "] was failed." << std::endl;
    return;
  }

  std::cerr << "Input " << inpath << std::endl;
  std::cerr << "SetDPI mode:" << std::endl;
  std::cerr << "Image width = " << img.m_nWidth << std::endl;
  std::cerr << "Image height = " << img.m_nHeight << std::endl;
  std::cerr << "Image row size = " << img.m_nRowSize << std::endl;
  std::cerr << "Image depth = " << img.m_nBitDepth << std::endl;
  std::cerr << "Image color type = " << img.m_nColorType << std::endl;
  std::cerr << "SetDPI = " << dpi << std::endl;
  std::cerr << "Output " << outpath << std::endl;

  if (dpi>1.0)
    img.setResDPI(dpi);

  img.write(outpath);
}

int blend1(int argc, const char *argv[])
{
  int ind;

  // blend mode (args: in_bg, in_1, alpha_1, ..., in_n, alpha_n, out, dpi)

  double dpi = -1.0;
  if (argc%2!=1) {
    std::string sdpi = argv[argc-1];
    --argc;
    std::cerr << "SetDPI: " << sdpi << std::endl;

    char *endptr;
    const char *nptr = sdpi.c_str();
    dpi = strtod(nptr, &endptr);
    if (nptr==endptr)
      dpi = -1.0;
  }

  int nblend = (argc-3)/2;

  std::string file_bg = argv[1];
  std::string outfile = argv[argc-1];

  std::cerr << "input file_bg: " << file_bg << std::endl;
  std::cerr << "output file: " << outfile << std::endl;

  PNGImage img_bg;
  if (!img_bg.read(file_bg)) {
    std::cerr << "Open input file_bg:[" << file_bg << "] was failed." << std::endl;
    return -1;
  }

  img_bg.m_alpha = 1.0;
  std::cerr << "Image width = " << img_bg.m_nWidth << std::endl;
  std::cerr << "Image height = " << img_bg.m_nHeight << std::endl;
  std::cerr << "Image row size = " << img_bg.m_nRowSize << std::endl;
  std::cerr << "Image depth = " << img_bg.m_nBitDepth << std::endl;
  std::cerr << "Image color type = " << img_bg.m_nColorType << std::endl;

  int w = img_bg.m_nWidth;
  int h = img_bg.m_nHeight;
  
  PNGImage imgout;
  imgout.copyFrom(img_bg);
  if (dpi>1.0)
    imgout.setResDPI(dpi);

  std::vector<PNGImage *> images;
  // images.push_back(&img_bg);

  for (ind=0; ind<nblend; ++ind) {

    std::string file2 = argv[2+ind*2];
    std::string salpha = argv[3+ind*2];

    char *endptr;
    double alpha = strtod(salpha.c_str(), &endptr);

    std::cerr << "input file" << ind << " : " << file2 << std::endl;
    std::cerr << "blend alpha = " << alpha << std::endl;

    PNGImage *pimg2 = new PNGImage();
    if (!pimg2->read(file2)) {
      std::cerr << "Open input file:[" << file2 << "] was failed." << std::endl;
      return -1;
    }
    pimg2->m_alpha = alpha;
    
    if (img_bg.m_nWidth!=pimg2->m_nWidth ||
        img_bg.m_nHeight!=pimg2->m_nHeight) {
      std::cerr << "ERROR: Image size mismatch." << std::endl;
      return -1;
    }
    
    if (img_bg.m_nBitDepth!=pimg2->m_nBitDepth) {
      std::cerr << "ERROR: Image depth mismatch." << std::endl;
      return -1;
    }
    if (img_bg.m_nBitDepth!=8) {
      std::cerr << "ERROR: Image depth is not 8bpc." << std::endl;
      return -1;
    }
    
    if (img_bg.m_nColorType!=pimg2->m_nColorType) {
      std::cerr << "ERROR: Image colortype mismatch." << std::endl;
      return -1;
    }
    if (img_bg.m_nColorType!=PNG_COLOR_TYPE_RGB) {
      std::cerr << "ERROR: Image colortype is not RGB." << std::endl;
      return -1;
    }

    pimg2->allocAlpha();
    images.push_back(pimg2);
  } // for
    
  // std::sort(images.begin(), images.end(), compare_alpha);

  for (int y = 0; y < h; ++y) {
    for (int x = 0; x < w; ++x) {

      unsigned char bg[3], c;
      bg[0] = img_bg.getAt(x, y, 0);
      bg[1] = img_bg.getAt(x, y, 1);
      bg[2] = img_bg.getAt(x, y, 2);

      std::vector<PNGImage *>::const_iterator iter = images.begin();
      for (; iter!=images.end(); ++iter) {
        PNGImage *pimg = *iter;
        bool bdiff = false;
        for (int i=0; i<3; ++i) {
          c = pimg->getAt(x, y, i);
          if (c!=bg[i]) {
            bdiff = true;
            break;
          }
        }
        if (bdiff) {
          pimg->setAlpha(x, y, 1);
        }
      }

    }
  }

  for (int y = 0; y < h; ++y) {
    for (int x = 0; x < w; ++x) {
      for (int i = 0; i < 3; ++i) {
        unsigned char bg = img_bg.getAt(x, y, i);
        double value = bg;
        std::vector<PNGImage *>::const_iterator iter = images.begin();
        for (; iter!=images.end(); ++iter) {
          PNGImage *pimg = *iter;
          if (pimg->getAlpha(x, y)==0) continue;
          // if (isNear(bg,pimg->getAt(x, y, i))) continue;
          const double c = double( pimg->getAt(x, y, i) );
          const double alpha = pimg->m_alpha;
          value = value * (1.0 - alpha) + c * alpha;
        }

        if (value>255.0) value = 255.0;
        else if (value<0.0) value = 0.0;
        imgout.setAt(x, y, i, (unsigned char) value);
      }
    }
  }

  imgout.write(outfile);
  
  return 0;
}

int blend2(int argc, const char *argv[])
{
  int ind;

  // blend mode 2 (args: in_bg, in_1, alpha_1, ..., in_n, alpha_n, in_all, out, dpi)

  std::string sdpi = argv[argc-1];
  --argc;
  std::cerr << "SetDPI: " << sdpi << std::endl;

  char *endptr;
  const char *nptr = sdpi.c_str();
  double dpi = strtod(nptr, &endptr);
  if (nptr==endptr)
    dpi = -1.0;

  int nblend = (argc-4)/2;
  std::cerr << "Nblend: " << nblend << std::endl;

  return 0;
}

////////////////////////////////////////////////

int main(int argc, const char *argv[])
{
  std::cerr << "=======================" << std::endl;
  std::cerr << "BlendPNG/setDPI utility" << std::endl;
  std::cerr << "=======================" << std::endl;

  if (argc<3) {
    usage();
    return -1;
  }

  if (argc==4) {
    // just set the DPI value (in, out, dpi)
    writeDPI(argv[1], argv[2], argv[3]);
    // OK
    return 0;
  }

  return blend1(argc, argv);
  // return blend2(argc, argv);

}

