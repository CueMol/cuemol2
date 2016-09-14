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

  public:
    OglTextureRep(qlib::uid_t nSceneID)
      : m_nSceneID(nSceneID)
    {
      m_nWidth = 0;
      m_nHeight = 0;
      m_nDepth = 0;
      m_bInit = false;
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
      case AbstTexture::FMT_R:
	m_iGlPixFmt = GL_RED;
	break;
      case AbstTexture::FMT_RG:
	m_iGlPixFmt = GL_RG;
	break;
      case AbstTexture::FMT_RGB:
	m_iGlPixFmt = GL_RGB;
	break;
      case AbstTexture::FMT_RGBA:
	m_iGlPixFmt = GL_RGBA;
	break;
      default:
	MB_THROW(qlib::RuntimeException, "Unsupported pixel format");
	break;
      }

      switch (iPixType) {
      case AbstTexture::TYPE_UINT8:
	m_iGlPixType = GL_UNSIGNED_BYTE;
	break;
      case AbstTexture::TYPE_FLOAT32:
        m_iGlPixType = GL_FLOAT;

        // set internal pixel format (mediump)
        switch (iPixFmt) {
        case AbstTexture::FMT_R:
          m_iGlIntPixFmt = GL_R16F;
          break;
        case AbstTexture::FMT_RG:
          m_iGlIntPixFmt = GL_RG16F;
          break;
        case AbstTexture::FMT_RGB:
          m_iGlIntPixFmt = GL_RGB16F;
          break;
        case AbstTexture::FMT_RGBA:
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

  private:
    void createGL()
    {
      glGenTextures(1, &m_nTexID);
    }

    void setupGL()
    {
      glEnable(m_iGlDimType);
      glBindTexture(m_iGlDimType, m_nTexID);

      // filter setting
      //glTexParameteri(m_iGlDimType, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
      //glTexParameteri(m_iGlDimType, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
      glTexParameteri(m_iGlDimType, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
      glTexParameteri(m_iGlDimType, GL_TEXTURE_MAG_FILTER, GL_NEAREST);

      // clamp setting
      glTexParameteri(m_iGlDimType, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
      if (m_iGlDimType==GL_TEXTURE_3D ||
	  m_iGlDimType==GL_TEXTURE_2D) {
	glTexParameteri(m_iGlDimType, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
	if (m_iGlDimType==GL_TEXTURE_3D) {
	  glTexParameteri(m_iGlDimType, GL_TEXTURE_WRAP_R, GL_CLAMP_TO_EDGE);
	}
      }
      glBindTexture(m_iGlDimType, 0);
      glDisable(m_iGlDimType);
    }

    void setDataGL(const void *pdata)
    {
      glEnable(m_iGlDimType);
      glBindTexture(m_iGlDimType, m_nTexID);
      glTexEnvf( GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_REPLACE );
      glPixelStorei( GL_UNPACK_ALIGNMENT, 1 );

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
                     m_iGlPixFmt,
                     m_nWidth, m_nHeight, 0,
		     m_iGlPixFmt, m_iGlPixType, pdata);
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
		     m_iGlPixFmt,
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
    }
  };

}

#endif

