// -*-Mode: C++;-*-
//
//  Ball & Stick model renderer class
//

#ifndef BALL_STICK_RENDERER_HPP_INCLUDED
#define BALL_STICK_RENDERER_HPP_INCLUDED

#include "molvis.hpp"
#include <modules/molstr/MolAtomRenderer.hpp>
#include <gfx/GpuPrim.hpp>

namespace molstr { class MolCoord; }

class BallStickRenderer_wrap;

namespace molvis {

  using namespace molstr;
  using gfx::DisplayContext;

  class MOLVIS_API BallStickRenderer : public MolAtomRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::BallStickRenderer_wrap;

    typedef MolAtomRenderer super_t;

  private:

    /////////////
    // Properties

    double m_bondw;

    double m_sphr;

    int m_nDetail;

    double m_tickness;

    bool m_fRing;

    gfx::ColorPtr m_ringcol;

  public:
    double getSphr() const { return m_sphr; }
    void setSphr(double s) { m_sphr = s; }

    double getBondw() const { return m_bondw; }
    void setBondw(double s) { m_bondw = s; }

    int getDetail() const { return m_nDetail; }
    void setDetail(int n) { m_nDetail = n; }

    bool isShowRing() const { return m_fRing; }
    void setShowRing(bool b) { m_fRing = b; }

    void setRingColor(const gfx::ColorPtr &col) { m_ringcol = col; }

    double getRingThick() const { return m_tickness; }
    void setRingThick(double s) { m_tickness = s; }

  private:
    /// Valence-Bond drawing mode
    int m_nVBMode;

  public:
    static const int VBMODE_OFF = 0;
    static const int VBMODE_TYPE1 = 1;

    int getVBMode() const { return m_nVBMode; }
    void setVBMode(int n) { m_nVBMode = n; }

    /////////////
    // workarea

    std::set<int> m_atoms;
    int m_nDetailOld;

  public:
    BallStickRenderer();
    ~BallStickRenderer() override;

    const char *getTypeName() const override;

    //////////////////////////////////////////////////////

    void display(DisplayContext *pdc) override;

    void invalidateDisplayCache() override;

    //////////////////////////////////////////////////////

    void preRender(DisplayContext *pdc) override;
    void postRender(DisplayContext *pdc) override;

    bool isRendBond() const override;
    void beginRend(DisplayContext *pdl) override;
    void endRend(DisplayContext *pdl) override;
    void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded) override;
    void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB) override;

    //////////////////////////////////////////////////////

    void propChanged(qlib::LPropEvent &ev) override;

    //////////////////////////////////////////////////////

  private:
    void drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                           DisplayContext *pdl);

    void drawVBondType1(MolAtomPtr pAtom1, MolAtomPtr pAtom2,
                        MolBond *pMB, DisplayContext *pdl);

    void drawRings(DisplayContext *pdl);
    void drawRingImpl(const std::list<int> atoms, DisplayContext *pdl);

    bool m_bDrawRingOnly;

  protected:
    void checkRing(int aid) {
      if (m_fRing)
        m_atoms.insert(aid);
    }

    //////////////////////////
    // Shader-based implementations using GpuPrim

  private:
    bool m_bUseShader;
    bool m_bCheckShaderOK;

    gfx::SphereGpuPrim *m_pSphGpuPrim;
    gfx::CylinderGpuPrim *m_pCylGpuPrim;

    void renderShaderImpl(DisplayContext *pdc);

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
