// -*-Mode: C++;-*-
//
//  OpenGL texture map implementation
//

#ifndef GFX_OGL_TEXTUREMAP_HPP_
#define GFX_OGL_TEXTUREMAP_HPP_

#include "sysdep.hpp"

#include <gfx/Texture.hpp>

#if HAVE_GLEW
#  include <GL/glew.h>
#endif

namespace sysdep {
  using namespace gfx;

  class SYSDEP_API OglTextureRep : public gfx::TextureRep
  {
  private:
    qlib::uid_t m_nSceneID;

    int m_nUnit;

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

    int m_iDim;
    int m_iPixFmt;
    int m_iPixType;

  public:
    OglTextureRep(qlib::uid_t nSceneID, int nUnit);

    virtual ~OglTextureRep();

    virtual void setup(int iDim, int iPixFmt, int iPixType);

    /// Setup TextureBufferObject
    void setupTBO(int iPixFmt, int iPixType);

    /// Returns OpenGL buffer ID
    GLuint getBufID() const { return m_nBufID; }

    //////////

    virtual void setData(int width, int height, int depth, const void *pdata);

    virtual void use();

    virtual void unuse();

    virtual void setLinIntpol(bool b);

  private:
    GLint m_nMaxTexSize, m_nMaxTexBufSize, m_nMax3DTexSize;
    bool m_bUseIntpol;

    bool isTBOAvailable();
    
    void createGL();

    void setupGL();

    void setDataGL(const void *pdata);

    void setDataGL1D(const void *pdata);
      
    void setDataGL2D(const void *pdata);

    void setDataGL3D(const void *pdata);

    void setDataGLBuf(const void *pdata);

    void setCurrentContext();

    void destroy();
  };

}

#endif

