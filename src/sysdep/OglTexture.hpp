// -*-Mode: C++;-*-
//
//  OpenGL texture map implementation
//

#ifndef GFX_OGL_TEXTUREMAP_HPP_
#define GFX_OGL_TEXTUREMAP_HPP_

#include "sysdep.hpp"

#include <gfx/Texture.hpp>

#ifndef CHK_GLERROR
#define CHK_GLERROR(MSG)\
{ \
  GLenum errc; \
  errc = glGetError(); \
  if (errc!=GL_NO_ERROR) \
    MB_DPRINTLN("%s GLError(%d): %s", MSG, errc, gluErrorString(errc)); \
  else \
    MB_DPRINTLN("%s : OK", MSG); \
}
#endif


namespace gfx {
  class DrawElemPix;
  class AbstDrawAttrs;
}

namespace sysdep {
	using namespace gfx;

  class OglTextureRep : public gfx::TextureRep
  {
  private:
    qlib::uid_t m_nSceneID;

    /// OpenGL ID of resource
    GLuint m_nTexID;
    GLuint m_nBufID;

    /// Dimension type
    GLenum m_iGlDimType;

    GLenum m_iGlPixFmt;
    GLenum m_iGlPixType;

    GLenum m_iGlIntPixFmt;

    /// size of data
    int m_nWidth;
    int m_nHeight;
    int m_nDepth;

    bool m_bInit;

    bool m_bUseTexBuf;

  public:
    OglTextureRep(qlib::uid_t nSceneID)
      : m_nSceneID(nSceneID)
    {
      m_nWidth = 0;
      m_nHeight = 0;
      m_nDepth = 0;
      m_bInit = false;
      m_bUseTexBuf = false;
      m_bUseIntpol = false;
    }

    virtual ~OglTextureRep() {
      destroy();
    }

    virtual void setup(int iDim, int iPixFmt, int iPixType)
    {
      switch (iDim) {
      case 1:
	m_iGlDimType = GL_TEXTURE_1D;
        break;
      case 2:
	m_iGlDimType = GL_TEXTURE_2D;
	break;
      case 3:
	m_iGlDimType = GL_TEXTURE_3D;
	break;
      default:
	MB_THROW(qlib::RuntimeException, "Unsupported dimension");
	break;
      }

      switch (iPixFmt) {
      case Texture::FMT_R:
	m_iGlPixFmt = GL_RED;
	break;
      case Texture::FMT_RG:
	m_iGlPixFmt = GL_RG;
	break;
      case Texture::FMT_RGB:
	m_iGlPixFmt = GL_RGB;
	break;
      case Texture::FMT_RGBA:
	m_iGlPixFmt = GL_RGBA;
	break;
      default:
	MB_THROW(qlib::RuntimeException, "Unsupported pixel format");
	break;
      }

      switch (iPixType) {
      case Texture::TYPE_UINT8:
	m_iGlPixType = GL_UNSIGNED_BYTE;
        // set internal pixel format (XXX: convert byte 0-255 --> float mediump, 0-1)
        switch (iPixFmt) {
        case Texture::FMT_R:
          m_iGlIntPixFmt = GL_R32F;
          break;
        case Texture::FMT_RG:
          m_iGlIntPixFmt = GL_RG32F;
          break;
        case Texture::FMT_RGB:
          m_iGlIntPixFmt = GL_RGB32F;
          break;
        case Texture::FMT_RGBA:
          m_iGlIntPixFmt = GL_RGBA32F;
          break;
        default:
          MB_THROW(qlib::RuntimeException, "Unsupported pixel format");
          break;
        }
        break;

      case Texture::TYPE_FLOAT32:
        m_iGlPixType = GL_FLOAT;
        // set internal pixel format (mediump)
        switch (iPixFmt) {
        case Texture::FMT_R:
          m_iGlIntPixFmt = GL_R16F;
          break;
        case Texture::FMT_RG:
          m_iGlIntPixFmt = GL_RG16F;
          break;
        case Texture::FMT_RGB:
          m_iGlIntPixFmt = GL_RGB16F;
          break;
        case Texture::FMT_RGBA:
          m_iGlIntPixFmt = GL_RGBA16F;
          break;
        default:
          MB_THROW(qlib::RuntimeException, "Unsupported pixel format");
          break;
        }
        break;

      default:
	MB_THROW(qlib::RuntimeException, "Unsupported pixel format");
	break;
      }

      m_bUseTexBuf = false;

      if (iDim==1 && iPixFmt==Texture::FMT_R && isTBOAvailable() ) {
        m_iGlDimType = GL_TEXTURE_BUFFER;
        m_bUseTexBuf = true;
      }

      createGL();
      setupGL();
    }

    virtual void setData(int width, int height, int depth, const void *pdata)
    {
      if (m_nWidth!=width ||
	  m_nHeight!=height ||
	  m_nDepth!=depth)
	m_bInit = false;
      
      m_nWidth = width;
      m_nHeight = height;
      m_nDepth = depth;
      setDataGL(pdata);
    }

    virtual void use(int nUnit)
    {
      glActiveTexture(GL_TEXTURE0 + nUnit);
      glBindTexture(m_iGlDimType, m_nTexID);
    }

    virtual void unuse()
    {
      glActiveTexture(GL_TEXTURE0);
      glBindTexture(m_iGlDimType, 0);
    }

    virtual void setLinIntpol(bool b)
    {
      m_bUseIntpol = b;
    }

  private:
    GLint m_nMaxTexSize, m_nMaxTexBufSize, m_nMax3DTexSize;
    bool m_bUseIntpol;

    bool isTBOAvailable()
    {
      if (GLEW_ARB_texture_buffer_object)
        return true;
      else
        return false;
    }
    
    void createGL()
    {
      glGenTextures(1, &m_nTexID);
      if (m_bUseTexBuf) {
        glGenBuffers(1, &m_nBufID);
      }

      glGetIntegerv(GL_MAX_TEXTURE_SIZE, &m_nMaxTexSize);
      glGetIntegerv(GL_MAX_TEXTURE_BUFFER_SIZE, &m_nMaxTexBufSize);
      glGetIntegerv(GL_MAX_3D_TEXTURE_SIZE, &m_nMax3DTexSize);

      MB_DPRINTLN("OglTex max tex size=%d", m_nMaxTexSize);
      MB_DPRINTLN("OglTex max tex buf size=%d", m_nMaxTexBufSize);
      MB_DPRINTLN("OglTex max 3D tex size=%d", m_nMax3DTexSize);
    }

    void setupGL()
    {
      CHK_GLERROR("(clearerr)");
      glEnable(m_iGlDimType);
      CHK_GLERROR("glEnable");
      glBindTexture(m_iGlDimType, m_nTexID);
      CHK_GLERROR("glBindTexture");

      // filter setting

      if (m_bUseIntpol) {
        glTexParameteri(m_iGlDimType, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(m_iGlDimType, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
      }
      else {
        glTexParameteri(m_iGlDimType, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
        glTexParameteri(m_iGlDimType, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
      }

      // clamp setting
      glTexParameteri(m_iGlDimType, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
      if (m_iGlDimType==GL_TEXTURE_3D ||
	  m_iGlDimType==GL_TEXTURE_2D) {
	glTexParameteri(m_iGlDimType, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
	if (m_iGlDimType==GL_TEXTURE_3D) {
	  glTexParameteri(m_iGlDimType, GL_TEXTURE_WRAP_R, GL_CLAMP_TO_EDGE);
	}
      }

      // Data alignment
      if (m_iGlPixType==GL_UNSIGNED_BYTE ||
          m_iGlPixType==GL_BYTE) {
        glPixelStorei( GL_UNPACK_ALIGNMENT, 1 );
      }
      else if (m_iGlPixType==GL_UNSIGNED_SHORT ||
               m_iGlPixType==GL_SHORT) {
        glPixelStorei( GL_UNPACK_ALIGNMENT, 2 );
      }
      else if (m_iGlPixType==GL_UNSIGNED_INT ||
               m_iGlPixType==GL_INT ||
               m_iGlPixType==GL_FLOAT) {
        glPixelStorei( GL_UNPACK_ALIGNMENT, 4 );
      }

      glTexEnvf( GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_REPLACE );

      glBindTexture(m_iGlDimType, 0);
      CHK_GLERROR("glBindTexture");
      glDisable(m_iGlDimType);
      CHK_GLERROR("glDisable");
    }

    void setDataGL(const void *pdata)
    {
      if (m_iGlDimType==GL_TEXTURE_BUFFER) {
        setDataGLBuf(pdata);
        return;
      }

      glEnable(m_iGlDimType);
      glBindTexture(m_iGlDimType, m_nTexID);

      if (m_iGlDimType==GL_TEXTURE_1D)
        setDataGL1D(pdata);
      else if (m_iGlDimType==GL_TEXTURE_2D)
        setDataGL2D(pdata);
      else if (m_iGlDimType==GL_TEXTURE_3D)
        setDataGL3D(pdata);
      else {
        MB_THROW(qlib::RuntimeException, "Unsupported texture type");
      }
    }

    void setDataGL1D(const void *pdata)
    {
      if (!m_bInit) {
	glTexImage1D(GL_TEXTURE_1D, 0,
                     m_iGlIntPixFmt,
		     m_nWidth, 0,
		     m_iGlPixFmt, m_iGlPixType, pdata);
	CHK_GLERROR("glTexImage1D");
	MB_DPRINTLN("OglTex1D glTexImage1D %d OK", m_nWidth);
	m_bInit = true;
      }
      else {
	glTexSubImage1D(GL_TEXTURE_1D,
			0, // LOD
			0, // offset
			m_nWidth, // size
			m_iGlPixFmt, // format
			m_iGlPixType, // type
			pdata);
      }
    }
      
    void setDataGL2D(const void *pdata)
    {
      if (!m_bInit) {
	glTexImage2D(GL_TEXTURE_2D, 0,
                     m_iGlIntPixFmt,
                     m_nWidth, m_nHeight, 0,
		     m_iGlPixFmt, m_iGlPixType, pdata);
	CHK_GLERROR("glTexImage2D");
	MB_DPRINTLN("OglTex2D glTexImage2D %dx%d OK", m_nWidth, m_nHeight);
	m_bInit = true;
      }
      else {
        glTexSubImage2D(GL_TEXTURE_2D,
			0, // LOD
			0, 0, // offset
			m_nWidth, m_nHeight, // size
			m_iGlPixFmt, // format
			m_iGlPixType, // type
			pdata);
      }
    }

    void setDataGL3D(const void *pdata)
    {
      if (!m_bInit) {
        glTexImage3D(GL_TEXTURE_3D, 0,
		     m_iGlIntPixFmt,
		     m_nWidth, m_nHeight, m_nDepth, 0,
		     m_iGlPixFmt, m_iGlPixType, pdata);
	m_bInit = true;
      }
      else {
	glTexSubImage3D(GL_TEXTURE_3D,
			0, // LOD
			0, 0, 0, // offset
			m_nWidth, m_nHeight, m_nDepth, // size
			m_iGlPixFmt, // format
			m_iGlPixType, // type
			pdata);
      }
    }

    void setDataGLBuf(const void *pdata)
    {
      CHK_GLERROR("(clearerr)");

      glBindBuffer(GL_TEXTURE_BUFFER, m_nBufID);
      CHK_GLERROR("glBindBuffer");

      int ncomp = 1;
      /*
      if (m_iGlPixFmt==GL_RED)
        ncomp = 1;
      else if (m_iGlPixFmt==GL_RG)
        ncomp = 2;
      else if (m_iGlPixFmt==GL_RGB)
        ncomp = 3;
      else if (m_iGlPixFmt==GL_RGBA)
        ncomp = 4;

      MB_ASSERT(ncomp==1);*/
      
      // always float32 (or int32)
      int elem_sz = 4;

      int nbytes = m_nWidth*elem_sz*ncomp;

      if (!m_bInit) {
        glBufferData(GL_TEXTURE_BUFFER, nbytes, pdata, GL_DYNAMIC_DRAW);
        CHK_GLERROR("glBufferData");
        MB_DPRINTLN("OglTexBuf glTexImageBuf %d pix/%d bytes OK", m_nWidth, nbytes);
        m_bInit = true;
      }
      else {
        glBufferSubData(GL_TEXTURE_BUFFER, 0, nbytes, pdata);
      }
      glBindBuffer(GL_TEXTURE_BUFFER, 0);

      // glEnable(GL_TEXTURE_BUFFER);
      // CHK_GLERROR("glEnable(GL_TEXTURE_BUFFER)");

      glActiveTexture(GL_TEXTURE0);
      CHK_GLERROR("glActiveTexture(GL_TEXTURE0)");

      glBindTexture(GL_TEXTURE_BUFFER, m_nTexID);
      CHK_GLERROR("glBindTexture(GL_TEXTURE_BUFFER, m_nTexID)");

      //glTexBuffer(GL_TEXTURE_BUFFER, m_iGlIntPixFmt, m_nBufID);
      glTexBuffer(GL_TEXTURE_BUFFER, GL_R32F, m_nBufID);
      CHK_GLERROR("glTexBuffer(GL_TEXTURE_BUFFER, m_iGlIntPixFmt, m_nBufID)");

      //glDisable(GL_TEXTURE_BUFFER);
    }

    void setCurrentContext()
    {
      qsys::ScenePtr rsc = qsys::SceneManager::getSceneS(m_nSceneID);
      if (rsc.isnull()) {
        MB_DPRINTLN("OglVBO> unknown scene, VBO %d cannot be deleted", m_nTexID);
        return;
      }

      qsys::Scene::ViewIter viter = rsc->beginView();
      if (viter==rsc->endView()) {
        MB_DPRINTLN("OglVBO> no view, VBO %d cannot be deleted", m_nTexID);
        return;
      }

      qsys::ViewPtr rvw = viter->second;
      if (rvw.isnull()) {
        // If any views aren't found, it is no problem,
        // because the parent context (and also all DLs) may be already destructed.
        return;
      }
      gfx::DisplayContext *pctxt = rvw->getDisplayContext();
      pctxt->setCurrent();
    }

    void destroy()
    {
      setCurrentContext();
      glDeleteTextures(1, &m_nTexID);
      if (m_bUseTexBuf)
        glDeleteBuffers(1, &m_nBufID);
    }
  };

}

#endif

