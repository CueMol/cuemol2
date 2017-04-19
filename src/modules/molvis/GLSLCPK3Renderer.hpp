// -*-Mode: C++;-*-
//
//  CPK renderer implementation using GLSL (ver.3)
//

#ifndef GLSL_CPK3_RENDERER_HPP_INCLUDED
#define GLSL_CPK3_RENDERER_HPP_INCLUDED

#include "molvis.hpp"
#include "CPK3Renderer.hpp"
#include <gfx/DrawAttrArray.hpp>

namespace sysdep {
  class OglProgramObject;
}

namespace gfx {
  class Texture;
}

namespace molvis {

  class MOLSTR_API GLSLCPK3Renderer : public CPK3Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef CPK3Renderer super_t;

    //////////////////////////////////////////////////////
    // Properties


    //////////////////////////////////////////////////////
    //

  public:
    GLSLCPK3Renderer();
    virtual ~GLSLCPK3Renderer();

  public:

    //////////////////////////////////////////////////////
    // new rendering routine (using GLSL)

    /// Initialize & setup capabilities (shaders/texture)
    virtual bool init(DisplayContext *pdc);
    
    /// VBO/texture data availability check
    virtual bool isCacheAvail() const;

    /// Rendering using GLSL
    virtual void createGLSL();

    /// update coord texture for GLSL rendering (using crdarray)
    virtual void updateDynamicGLSL();

    /// update coord texture for GLSL rendering (using MolAtom.getPos)
    virtual void updateStaticGLSL();

    /// update colors for GLSL rendering
    virtual void updateGLSLColor();

    /// rendering for GLSL version
    virtual void renderGLSL(DisplayContext *pdc);

    /// cleanup Texture/VBO
    virtual void invalidateDisplayCache();

  private:
    static const int COORD_TEX_UNIT = 0;
    static const int COLOR_TEX_UNIT = 1;

    /// coordinate float texture (2D tex or TexBuf)
    gfx::Texture *m_pCoordTex;

    /// CPU-side storage of coordTex
    std::vector<float> m_coordbuf;
    
    bool m_bUseSels;
    std::vector<quint32> m_sels;

    /// color texture
    gfx::Texture *m_pColorTex;
    std::vector<qbyte> m_colorTexData;

    /// Height and Width of CoordTex (for 2D texture mode)
    int m_nTexW, m_nTexH;

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

    /// Elem of VBO
    struct AttrElem {
      qfloat32 rad;
    };

    /// location of radius (float32)
    quint32 m_nRadLoc;

    typedef gfx::DrawAttrElems<quint32, AttrElem> AttrArray;

    /// VBO for GLSL rendering
    AttrArray *m_pAttrAry;

  public:

    //////////////////////////////////////////////////////
    // Event handling

  };
}

#endif
