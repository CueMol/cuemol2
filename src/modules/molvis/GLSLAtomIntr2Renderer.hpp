// -*-Mode: C++;-*-
//
//  Interaction line renderer class (GLSL ver 2)
//

#ifndef MOLVIS_GLSL_ATOM_INTR2_RENDERER_HPP
#define MOLVIS_GLSL_ATOM_INTR2_RENDERER_HPP

#include "molvis.hpp"

#include "AtomIntr2Renderer.hpp"

#include <gfx/DrawAttrArray.hpp>

class GLSLAtomIntr2Renderer_wrap;

namespace sysdep {
  class OglProgramObject;
}

namespace molvis {

  using gfx::ColorPtr;
  using gfx::DisplayContext;
  using qlib::Vector4D;
  using molstr::MolCoordPtr;
  using molstr::SelectionPtr;

  class MOLVIS_API GLSLAtomIntr2Renderer : public AtomIntr2Renderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;
    
    // friend class ::AtomIntr2Renderer_wrap;

    typedef AtomIntr2Renderer super_t;

  private:
    /////////////
    // Properties

  private:
    /////////////
    /// Implementation data

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

    struct AttrElem {
      qfloat32 pos1x, pos1y, pos1z;
      qfloat32 pos2x, pos2y, pos2z;
      qfloat32 hwidth;
      qfloat32 dir;
    };

    quint32 m_nPos1Loc;
    quint32 m_nPos2Loc;
    quint32 m_nHwidthLoc;
    quint32 m_nDirLoc;

    typedef gfx::DrawAttrElems<quint32, AttrElem> AttrArray;

    /// VBO for GLSL rendering
    AttrArray *m_pAttrAry;
    
    //////////

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pLabPO;

    /// Attribute for label rendering VBO
    struct LabAttrElem {
      // label origin position
      qfloat32 x, y, z;
      // label w-direction
      qfloat32 nx, ny, nz;
      // label texture coord
      qfloat32 w, h;
      // vertex displacement
      qfloat32 dx, dy;
    };

    typedef gfx::DrawAttrElems<quint32, LabAttrElem> LabAttrArray;

    /// VBO for GLSL rendering
    LabAttrArray *m_pLabAttrAry;

    typedef std::vector<qbyte> LabPixBuf;

    static const int LABEL_TEX_UNIT = 0;

    /// label image texture (in GPU)
    gfx::Texture *m_pLabelTex;

    /// Label image data (in CPU)
    LabPixBuf m_pixall;


    static const int TEX2D_WIDTH = 2048;

    /// Height and Width of CoordTex (2D texture mode for GL1.3)
    int m_nTexW, m_nTexH;

    int m_nDigitW, m_nDigitH;

    int m_nDigits;
    static const int NUM_TEX_UNIT = 1;
    gfx::Texture *m_pNumTex;
    LabPixBuf m_numpix;


    //////////////////////////////////////////////////////

  public:
    GLSLAtomIntr2Renderer();
    virtual ~GLSLAtomIntr2Renderer();

    //////////////////////////////////////////////////////

    virtual LString toString() const;

    //virtual const char *getTypeName() const;

    virtual bool isTransp() const;

    virtual void invalidateDisplayCache();

    //////////////////////////////////////////////////////
    // Ver. 2 interface

    /// Use ver2 interface
    virtual bool isUseVer2Iface() const;

    /// Initialize & setup capabilities (for glsl setup)
    virtual bool init(DisplayContext *pdc);
    
    virtual bool isCacheAvail() const;

    /// Create GLSL data (VBO, texture, etc)
    virtual void createGLSL();

    /// update VBO positions using CrdArray
    virtual void updateDynamicGLSL();

    /// update VBO positions using getPos
    virtual void updateStaticGLSL();


    // /// Render to display (using VBO)
    // virtual void renderVBO(DisplayContext *pdc);

    /// Render to display (using GLSL)
    virtual void renderGLSL(DisplayContext *pdc);

  private:
    //////////////////////////////////////////////////////
    // Specific implementation

    void createTextureData(DisplayContext *pdc, float asclx, float scly);

    //////////////////////////////////////////////////////
    // Event handling

    //virtual void propChanged(qlib::LPropEvent &ev);

    //virtual void styleChanged(qsys::StyleEvent &ev);

  private:

    void setLineAttr(int ive, const Vector4D &pos1, const Vector4D &pos2);
    void setLabelAttr(int ive, const Vector4D &pos1, const Vector4D &pos2);
    void setLabelDigits(int ilab, double dist);

  };

}


#endif

