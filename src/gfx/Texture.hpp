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
  };

  /////////////////////////////////////

  /// Texture abstract class
  class AbstTexture
  {
  public:
    AbstTexture()
      : m_pTexRep(NULL)
    {
    }

    virtual ~AbstTexture()
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

    void use(int nUnit)
    {
      getRep()->use(nUnit);
    }

    void unuse()
    {
      getRep()->unuse();
    }

  }; 

  /////////////////////////////////////

  class Texture1D : public AbstTexture
  {
  public:
    Texture1D() : AbstTexture()
    {
    }

    virtual ~Texture1D()
    {
    }

  private:

  public:
    void setup(int iFmt, int iType)
    {
      getRep()->setup(1, iFmt, iType);
    }

    void setData(int w, const void *pdata)
    {
      getRep()->setData(w, 1, 1, pdata);
    }

  }; 

  //////////

  class Texture2D : public AbstTexture
  {
  public:
    Texture2D() : AbstTexture()
    {
    }

    virtual ~Texture2D()
    {
    }

  private:

  public:
    void setup(int iFmt, int iType)
    {
      getRep()->setup(2, iFmt, iType);
    }

    void setData(int w, int h, const void *pdata)
    {
      getRep()->setData(w, h, 1, pdata);
    }

  }; 

  //////////

  class Texture3D : public AbstTexture
  {
  public:
    Texture3D() : AbstTexture()
    {
    }

    virtual ~Texture3D()
    {
    }

  private:

  public:
    void setup()
    {
      getRep()->setup(3, FMT_R, TYPE_UINT8);
    }

    void setData(int w, int h, int d, const void *pdata)
    {
      getRep()->setData(w, h, d, pdata);
    }

  }; 

} // namespace gfx

#endif
