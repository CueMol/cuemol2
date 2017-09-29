// -*-Mode: C++;-*-
//
//  GLSL label rendering helper class
//

#ifndef GLSL_LABEL_HELPER_HPP_INCLUDED
#define GLSL_LABEL_HELPER_HPP_INCLUDED

#include "molstr.hpp"

#include <qlib/LTypes.hpp>
#include <gfx/DrawAttrArray.hpp>

namespace sysdep {
  class OglProgramObject;
}

namespace gfx {
  class Texture;
  class DisplayContext;
}

namespace qsys {
  class Renderer;
}

namespace molstr {

  ///  GLSL label rendering helper class
  class MOLSTR_API GLSLLabelHelper
  {
  private:
    // data structure

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

  public:
    /// Attribute for label rendering VBO
    struct AttrElem {
      qfloat32 x, y, z;
      qfloat32 w, h;
      qfloat32 nx, ny;
      qfloat32 width;
      qfloat32 addr;
    };

    typedef gfx::DrawAttrElems<quint32, AttrElem> AttrArray;

  private:
    quint32 m_nXyzLoc;
    quint32 m_nWhLoc;
    quint32 m_nNxyLoc;
    quint32 m_nWidthLoc;
    quint32 m_nAddrLoc;

    /// VBO for GLSL rendering
    AttrArray *m_pAttrAry;

  public:
    typedef std::vector<qbyte> PixBuf;

  private:
    /// Texture unit ID
    static const int LABEL_TEX_UNIT = 0;
    static const int TEX2D_WIDTH = 2048;
    
    /// label image texture (in GPU)
    gfx::Texture *m_pLabelTex;

    /// Label image data (in CPU)
    PixBuf m_pixall;

    /// Height and Width of CoordTex (2D texture mode for GL1.3)
    int m_nTexW, m_nTexH;

  public:
    /// label's color
    gfx::ColorPtr m_pcolor;

  public:
    GLSLLabelHelper()
         : m_pPO(NULL), m_pAttrAry(NULL), m_pLabelTex(NULL)
    {
    }

    ~GLSLLabelHelper()
    {
      invalidate();
    }

    bool initShader(qsys::Renderer *pRend);

    /// Allocate Attr VBO/setup Texture
    void alloc(int nlab);
    
    AttrArray *getDrawElem() const
    {
      return m_pAttrAry;
    }

    PixBuf &getPixBuf()
    {
      return m_pixall;
    }

    void createPixBuf(int npix);

    void setTexData();

    void draw(gfx::DisplayContext *pdc,
              float width, float height, float ppa,
              qlib::uid_t nSceneID = qlib::invalid_uid);

    void invalidate();

    bool isAvailable() const {
      return m_pAttrAry!=NULL && m_pLabelTex!=NULL;
    }

    bool isPixDataAvail() const {
      return !m_pixall.empty();
    }

  };

}

#endif

