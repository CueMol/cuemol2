// -*-Mode: C++;-*-
//
//  CPK molecular renderer class (version 2)
//

#ifndef CPK2_RENDERER_HPP_INCLUDED
#define CPK2_RENDERER_HPP_INCLUDED

#include "molvis.hpp"
#include <gfx/DrawElem.hpp>
#include <gfx/GpuPrim.hpp>

#include <modules/molstr/MolAtomRenderer.hpp>

class CPK2Renderer_wrap;

namespace molvis {

  using namespace molstr;
  using gfx::DisplayContext;

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

    bool m_bCheckShaderOK;

    gfx::SphereGpuPrim m_sphGpuPrim;

  public:
    CPK2Renderer();
    ~CPK2Renderer() override;

    const char *getTypeName() const override;

    // /// override to initialize the shader
    // virtual void setSceneID(qlib::uid_t nid);

    /// cleanup the shaders
    void unloading() override;

    //////////////////////////////////////////////////////

    void display(DisplayContext *pdc) override;

    void invalidateDisplayCache() override;

    //////////////////////////////////////////////////////

    bool isRendBond() const override;

    void beginRend(DisplayContext *pdl) override;
    void endRend(DisplayContext *pdl) override;

    void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded) override;
    void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB) override;

    //////////////////////////////////////////////////////
    // properties

    void propChanged(qlib::LPropEvent &ev) override;

    int getDetail() const { return m_nDetail; }
    void setDetail(int n) { m_nDetail = n; }

  private:
    double getVdWRadius(MolAtomPtr pAtom);

    ///////////////////////////////////
    // VBO Rendering implementation

    /// cached vertex array/VBO
    // gfx::AbstDrawElem *m_pDrawElem;

    // void renderVBOImpl();

  private:
    ///////////////////////////////////
    // shader rendering implementations

    void renderShaderImpl(DisplayContext *pdc);

  private:
    int m_nGlRendMode;

  public:
    static constexpr int REND_DEFAULT=0;
    static constexpr int REND_SHADER=1;
    static constexpr int REND_VBO=0;
    static constexpr int REND_GLU=0;

    int getGLRenderMode() const { return m_nGlRendMode; }
    void setGLRenderMode(int n) { m_nGlRendMode = n; } 
  };

}

#endif

