// -*-Mode: C++;-*-
//
//  Texture abstract class
//

#ifndef GFX_TEXTURE_HPP_INCLUDED
#define GFX_TEXTURE_HPP_INCLUDED

#include "gfx.hpp"

namespace gfx {

  /// Abstract class of Texture implementation REP
  class TextureRep
  {
  public:
    virtual ~TextureRep() {}

    virtual void setup(int iDim, int iPixFmt, int iPixType) =0;

    virtual void setData(int width, int height, int depth, const void *pdata) =0;

    virtual void use(int nUnit) =0;
    virtual void unuse() =0;

    virtual void setLinIntpol(bool b) {}
  };

  /////////////////////////////////////

  /// Texture class
  class Texture
  {
  public:
    Texture()
      : m_pTexRep(NULL), m_bInitOK(false), m_bDataChanged(false)
    {
    }

    virtual ~Texture()
    {
      if (m_pTexRep!=NULL)
	delete m_pTexRep;
    }

  private:
    mutable TextureRep *m_pTexRep;

  public:
    void setRep(TextureRep *pRep) const {
      m_pTexRep = pRep;
    }
    TextureRep *getRep() const {
      return m_pTexRep;
    }

  public:
    /// pixel format
    static const int FMT_R = 0;
    static const int FMT_RG = 1;
    static const int FMT_RGB = 2;
    static const int FMT_RGBA = 3;

    /// pixel type
    static const int TYPE_UINT8 = 0;
    static const int TYPE_UINT16 = 1;
    static const int TYPE_UINT32 = 2;

    static const int TYPE_FLOAT16 = 10;
    static const int TYPE_FLOAT32 = 11;
    static const int TYPE_FLOAT64 = 12;

    /// host: unsigned int (0-MAX) --> gpu: float (0-1)
    static const int TYPE_UINT8_COLOR = 20;

  private:
    bool m_bInitOK;

    int m_nDim;
    int m_iFmt;
    int m_iType;
    bool m_bLinIntpol;

    bool m_bDataChanged;
    int m_nWidth;
    int m_nHeight;
    int m_nDepth;
    const void *m_pData;


  public:

    void setup(int ndim, int iFmt, int iType)
    {
      m_bInitOK = false;
      m_nDim = ndim;
      m_iFmt = iFmt;
      m_iType = iType;
      //getRep()->setup(ndim, iFmt, iType);
    }

    void setLinIntpol(bool b)
    {
      m_bInitOK = false;
      m_bLinIntpol = b;
      // getRep()->setLinIntpol(b);
    }

    void setData(int w, int h, int d, const void *pdata)
    {
      m_nWidth = w;
      m_nHeight = h;
      m_nDepth = d;
      m_pData = pdata;
      m_bDataChanged = true;
    }

    //

    void use(int nUnit)
    {
      MB_DPRINTLN("Texture unit=%d use called.", nUnit);
      if (!m_bInitOK) {
	getRep()->setLinIntpol(m_bLinIntpol);
	getRep()->setup(m_nDim, m_iFmt, m_iType);
	m_bInitOK = true;
	MB_DPRINTLN("Texture unit=%d Setup OK.", nUnit);
      }
      if (m_bDataChanged) {
	getRep()->setData(m_nWidth, m_nHeight, m_nDepth, m_pData);
	m_bDataChanged = false;
	MB_DPRINTLN("Texture unit=%d setData OK.", nUnit);
      }
      getRep()->use(nUnit);
    }

    void unuse()
    {
      getRep()->unuse();
    }

  }; 

  /////////////////////////////////////

} // namespace gfx

#endif
