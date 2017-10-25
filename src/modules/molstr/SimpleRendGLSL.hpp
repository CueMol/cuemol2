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

  public:

    // virtual void display(DisplayContext *pdc);

    /// cleanup Texture/VBO
    virtual void invalidateDisplayCache();

    //////////////////////////////////////////////////////
    // new rendering routine (using GLSL)

    /// Initialize &setup capabilities (shaders/texture)
    virtual bool init(DisplayContext *pdc);
    
    /// Render to display
    // virtual void render2(DisplayContext *pdc);

    /// rendering for GLSL version
    virtual void renderGLSL(DisplayContext *pdc);

    virtual bool isCacheAvail() const;

    /// Rendering using GLSL
    virtual void createGLSL();

    /// update coord texture for GLSL rendering (using crdarray)
    virtual void updateDynamicGLSL();

    /// update coord texture for GLSL rendering (using atompos)
    virtual void updateStaticGLSL();

  private:
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

    template <typename _Attr>
    inline void setColor(_Attr &attra, int ind, quint32 dcc) {
      attra.at(ind).r = (qbyte) gfx::getRCode(dcc);
      attra.at(ind).g = (qbyte) gfx::getGCode(dcc);
      attra.at(ind).b = (qbyte) gfx::getBCode(dcc);
      attra.at(ind).a = (qbyte) gfx::getACode(dcc);
    }

    //////////

    /// GLSL shader object for dbnbon drawing
    sysdep::OglProgramObject *m_pDbnPO;

    /// VBO elem for dblbon drawing
    struct DbnAttrElem {
      /// a_ind.x, a_ind.y, a_ind.z
      qfloat32 ind1, ind2, ind3;

      /// a_color
      qbyte r, g, b, a;
    };

    typedef gfx::DrawAttrArray<DbnAttrElem> DbnAttrArray;

    /// VBO for GLSL rendering for dblbon drawing
    DbnAttrArray *m_pDbnAttrAry;

  public:

    //////////////////////////////////////////////////////
    // Event handling

    /// object changed event (--> update vertex positions if required)
    // virtual void objectChanged(qsys::ObjectEvent &ev);

  };
}

#endif
