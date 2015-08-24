// -*-Mode: C++;-*-
//
//  CPK molecular renderer class (version 2)
//

#ifndef CPK2_RENDERER_HPP_INCLUDED
#define CPK2_RENDERER_HPP_INCLUDED

#include "molvis.hpp"
#include <gfx/DrawElem.hpp>

#include <modules/molstr/MolAtomRenderer.hpp>

// namespace molstr { class MolCoord; }

class CPK2Renderer_wrap;

namespace molvis {

  using namespace molstr;
  using gfx::DisplayContext;
  class GLSLSphereHelper;

  class MOLVIS_API CPK2Renderer : public MolAtomRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::CPK2Renderer_wrap;

    typedef MolAtomRenderer super_t;

  private:

    double m_vdwr_H;
    double m_vdwr_C;
    double m_vdwr_N;
    double m_vdwr_O;
    double m_vdwr_S;
    double m_vdwr_P;
    double m_vdwr_X;

    /// Detail of mesh rendering
    int m_nDetail;

    int m_nDetailOld;

    bool m_bUseShader;

  public:
    CPK2Renderer();
    virtual ~CPK2Renderer();

    virtual const char *getTypeName() const;

    /// override to initialize the shader
    virtual void setSceneID(qlib::uid_t nid);

    /// cleanup the shaders
    virtual void unloading();

    //////////////////////////////////////////////////////

    virtual void display(DisplayContext *pdc);

    virtual void invalidateDisplayCache();

    //////////////////////////////////////////////////////

    virtual bool isRendBond() const;

    virtual void beginRend(DisplayContext *pdl);
    virtual void endRend(DisplayContext *pdl);

    virtual void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded);
    virtual void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB);

    //////////////////////////////////////////////////////
    // properties

    virtual void propChanged(qlib::LPropEvent &ev);

    int getDetail() const { return m_nDetail; }
    void setDetail(int n) { m_nDetail = n; }

  private:
    double getVdWRadius(MolAtomPtr pAtom);

    ///////////////////////////////////
    // VBO Rendering implementation

    /// cached vertex array/VBO
    gfx::AbstDrawElem *m_pDrawElem;

    void renderVBOImpl();

  private:
    ///////////////////////////////////
    // shader rendering implementations

    GLSLSphereHelper *m_pSlSph;

    void initShader();
    void renderShaderImpl();

  private:
    int m_nGlRendMode;

  public:
    static const int REND_DEFAULT=0;
    static const int REND_SHADER=1;
    static const int REND_VBO=2;
    static const int REND_GLU=3;

    int getGLRenderMode() const { return m_nGlRendMode; }
    void setGLRenderMode(int n) { m_nGlRendMode = n; } 
  };

}

#endif

