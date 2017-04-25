// -*-Mode: C++;-*-
//
//  Ball & Stick model renderer class ver. 2
//

#ifndef BALL_STICK2_RENDERER_HPP_INCLUDED
#define BALL_STICK2_RENDERER_HPP_INCLUDED

#include "molvis.hpp"
#include <gfx/DrawElem.hpp>
#include <modules/molstr/MolAtomRenderer.hpp>

namespace molstr { class MolCoord; }

class BallStick2Renderer_wrap;

namespace molvis {

  using namespace molstr;
  using gfx::DisplayContext;

#ifdef USE_OPENGL
  class GLSLSphereHelper;
  class GLSLCylinderHelper;
#endif

  class MOLVIS_API BallStick2Renderer : public MolAtomRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::BallStick2Renderer_wrap;

    typedef MolAtomRenderer super_t;

    //////////////////////////////
    // Properties

  private:
    /// Bond width
    double m_bondw;

  public:
    double getBondw() const { return m_bondw; }
    void setBondw(double s) { m_bondw = s; }

  private:
    /// Sphere radius
    double m_sphr;

  public:
    double getSphr() const { return m_sphr; }
    void setSphr(double s) { m_sphr = s; }

  private:
    /// Tesselation detail level
    int m_nDetail;

  public:
    int getDetail() const { return m_nDetail; }
    void setDetail(int n) { m_nDetail = n; }

  private:
    /// Ring plate tickness
    double m_thickness;

  public:
    double getRingThick() const { return m_thickness; }
    void setRingThick(double s) { m_thickness = s; }

  private:
    /// Ring plate flag
    bool m_fRing;

  public:
    bool isShowRing() const { return m_fRing; }
    void setShowRing(bool b) { m_fRing = b; }

  private:
    /// Ring plate color
    gfx::ColorPtr m_ringcol;

  public:
    const gfx::ColorPtr &getRingColor() const { return m_ringcol; }
    void setRingColor(const gfx::ColorPtr &col) { m_ringcol = col; }

  private:
    /// Valence-Bond drawing mode
    int m_nVBMode;

  public:
    static const int VBMODE_OFF = 0;
    static const int VBMODE_TYPE1 = 1;

    int getVBMode() const { return m_nVBMode; }
    void setVBMode(int n) { m_nVBMode = n; }

    //////////////////////////////
    // workarea

    struct Atom {
      quint32 aid;
      float rad;
    };

    typedef std::deque<Atom> AtomData;

    AtomData m_atomdat;

    ////

    struct Bond {
      quint32 aid1, aid2;
      quint32 btype;
      float rad;
    };

    typedef std::deque<Bond> BondData;

    BondData m_bonddat;

    ////

    typedef std::vector<int> RingAtoms;
    struct Ring {
      RingAtoms atoms;
      int piv_atom_id;
    };

    typedef std::deque<Ring> RingData;

    RingData m_ringdat;

  public:
    BallStick2Renderer();
    virtual ~BallStick2Renderer();

    virtual const char *getTypeName() const;

    //////////////////////////////

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void preRender(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc);

    //////////////////////////////
    // Old rendering interface (for renderFile()/GL compatible prof)

    virtual bool isRendBond() const;
    virtual void beginRend(DisplayContext *pdl);
    virtual void endRend(DisplayContext *pdl);
    virtual void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded);
    virtual void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB);

  private:
    //void drawInterAtomLine(MolAtomPtr pAtom1, MolAtomPtr pAtom2);

    void buildRingData();

  public:
    //////////////////////////////////////////////////////
    // new rendering interface (VBO version)

    /// Use Ver2 interface (returns true)
    virtual bool isUseVer2Iface() const;

    virtual bool isCacheAvail() const;

    /// Rendering for file display contexts
    // --> default implementation in DispCacheRenderer: use old render() interface
    // virtual void renderFile(DisplayContext *pdc);

    /// Rendering using VBO
    virtual void renderVBO(DisplayContext *pdc);

    /// Create VBO
    virtual void createVBO();

    /// update VBO positions (using CrdArray)
    virtual void updateDynamicVBO();

    /// update VBO positions (using MolAtom)
    virtual void updateStaticVBO();

    /// update VBO colors
    virtual void updateVBOColor();

    /// cleanup VBO
    virtual void invalidateDisplayCache();

  private:
    
    /// cached vertex array/VBO
    gfx::DrawElemVNCI32 *m_pVBO;
    
    /// Template of sphere
    gfx::DrawElemVNCI32 *m_pSphrTmpl;

    /// Template of cylinders
    gfx::DrawElemVNCI32 *m_pCylTmpl;

    int m_nSphs;

  };

}

#endif
