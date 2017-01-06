// -*-Mode: C++;-*-
//
//  Simple renderer implementation using GLSL
//

#ifndef SIMPLE_RENDERER_GLSL_HPP_INCLUDED
#define SIMPLE_RENDERER_GLSL_HPP_INCLUDED

#include "molstr.hpp"
#include "SimpleRenderer.hpp"
#include <gfx/DrawAttrArray.hpp>

namespace sysdep {
  class OglProgramObject;
}

namespace gfx {
  class Texture;
}

namespace molstr {

  class MOLSTR_API SimpleRendGLSL : public SimpleRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef SimpleRenderer super_t;

    //////////////////////////////////////////////////////
    // Properties


    //////////////////////////////////////////////////////

  public:
    SimpleRendGLSL();
    virtual ~SimpleRendGLSL();

    // virtual const char *getTypeName() const;

  public:

    virtual void display(DisplayContext *pdc);

    /// cleanup Texture/VBO
    virtual void invalidateDisplayCache();

    //////////////////////////////////////////////////////
    // new rendering routine (using GLSL & VBO)

  private:
    /// display() for GLSL version
    void displayGLSL(DisplayContext *pdc);

    /// Initialize shaders/texture
    void initShader(DisplayContext *pdc);

    /// Rendering using GLSL
    //void createGLSL(DisplayContext *pdc);
    void createGLSL();

    /// update coord texture for GLSL rendering (using crdarray)
    void updateDynamicGLSL();

    /// update coord texture for GLSL rendering (using atompos)
    void updateStaticGLSL();

    /// Use GLSL rendering mode (for dynamic update)
    bool m_bUseGLSL;

    /// shader check was performed
    bool m_bChkShaderDone;

    /// coordinate float texture
    gfx::Texture *m_pCoordTex;

    bool m_bUseSels;
    std::vector<quint32> m_sels;
    std::vector<float> m_coordbuf;

    /// Height and Width of CoordTex (2D texture mode)
    int m_nTexW, m_nTexH;

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

    struct AttrElem {
      /// a_ind12.x, a_ind12.y
      qfloat32 ind1, ind2;
      //qint32 ind1, ind2;
      /// a_color
      qbyte r, g, b, a;
    };

    /// location of ind1/ind2
    quint32 m_nInd12Loc;
    /// location of color (rgba)
    quint32 m_nColLoc;

    typedef gfx::DrawAttrArray<AttrElem> AttrArray;

    /// VBO for GLSL rendering
    AttrArray *m_pAttrAry;

  public:

    //////////////////////////////////////////////////////
    // Event handling

    /// object changed event (--> update vertex positions if required)
    virtual void objectChanged(qsys::ObjectEvent &ev);

  };
}

#endif
