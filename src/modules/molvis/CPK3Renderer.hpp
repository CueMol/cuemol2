// -*-Mode: C++;-*-
//
//  CPK (space filling) molecule renderer class (version 3)
//  Using VBO/Not using GLSL
//

#ifndef CPK3_RENDERER_HPP_INCLUDED
#define CPK3_RENDERER_HPP_INCLUDED

#include "molvis.hpp"
#include <gfx/DrawElem.hpp>

#include <modules/molstr/MolAtomRenderer.hpp>

class CPK3Renderer_wrap;

namespace molvis {

  using namespace molstr;
  using gfx::DisplayContext;
  using qlib::Vector3F;

  class MOLVIS_API CPK3Renderer : public MolAtomRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::CPK3Renderer_wrap;

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

  public:
    CPK3Renderer();
    virtual ~CPK3Renderer();

    virtual const char *getTypeName() const;

    virtual void propChanged(qlib::LPropEvent &ev);

    //////////////////////////////////////////////////////
    // Old rendering interface (for renderFile()/GL compatible prof)

    virtual bool isRendBond() const;
    
    virtual void beginRend(DisplayContext *pdl);
    // virtual void endRend(DisplayContext *pdl);
    
    virtual void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded);
    //virtual void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB);

    //////////////////////////////////////////////////////
    // new rendering interface (VBO version/dummy)

    /// Use Ver2 interface (returns true)
    virtual bool isUseVer2Iface() const;

    virtual bool isCacheAvail() const {
      return m_pVBO!=NULL;
    }

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

    //////////////////////////////////////////////////////
    // implementation

    double getVdWRadius(MolAtomPtr pAtom) const;

    /// cached vertex array/VBO
    gfx::DrawElemVNCI32 *m_pVBO;
    
    /// Template of sphere
    gfx::DrawElemVNCI32 *m_pTmpl;

    int m_nSphs;
    std::vector<int> m_aidvec;
    std::vector<float> m_radvec;
  };

}

#endif

