// -*-Mode: C++;-*-
//
//  simple selection renderer class
//
//  $Id: SelectionRenderer.hpp,v 1.11 2011/03/29 11:03:44 rishitani Exp $

#ifndef SELECTION_RENDERER_H__
#define SELECTION_RENDERER_H__

#include "molstr.hpp"
#include "MolAtomRenderer.hpp"
#include <gfx/PixelBuffer.hpp>
#include <gfx/LineIdxGpuPrim.hpp>

#include <vector>
#include <unordered_map>

class SelectionRenderer_wrap;

namespace molstr {

class MolCoord;
using gfx::DisplayContext;

class MOLSTR_API SelectionRenderer : public MolAtomRenderer
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  friend class ::SelectionRenderer_wrap;

  typedef MolAtomRenderer super_t;
  
private:
  //////////////////////////////////////////////////////
  // properties

  // line width
  double m_linew;

  // color
  gfx::ColorPtr m_color;

  // displacement of drawing, X
  double m_dispx;

  // displacement of drawing, Y
  double m_dispy;

  int m_nMode;

  //////////////////////////////////////////////////////
  // workspace

  // empty selection obj for XXX
  SelectionPtr m_pSel;

  // gfx::PixelBuffer m_boximg;

  //////////////////////////////////////////////////////
  // coordinate texture path (direct update)

  bool m_bUseShader;
  bool m_bCheckShaderOK;

  /// Line primitive with texture-fetched endpoints (used when available)
  gfx::LineIdxGpuPrim m_lineIdxGpuPrim;

  /// Coordinate texture (owned). Null when the backend does not support it.
  gfx::FloatDataTexture *m_pCoordTex;

  /// CPU-side staging buffer for the coordinate texture (w*h*3 floats)
  std::vector<qfloat32> m_coordbuf;

  /// AIDs in the same order as the coordinate texture texels
  std::vector<int> m_aidcache;

  /// AID -> texel index (bonds/asters reference atoms by AID)
  std::unordered_map<int, int> m_aid2idx;

  int m_nTexW, m_nTexH;

  /// True when the coordinate texture path is in use
  bool m_bUseCoordTex;

  /// Set by objectChanged(); consumed by display() (deferred upload, once/frame)
  bool m_bCoordDirty;

  /// Build the immutable VBO (indices/offsets/colour) and the coordinate
  /// texture. Falls back (clears m_bUseCoordTex) when the backend cannot
  /// provide a float data texture.
  void renderCoordTexImpl(DisplayContext *pdc);

  /// Re-gather atom positions into the coordinate texture. Called from
  /// display() when m_bCoordDirty.
  bool updateCoordTex();

public:
  enum {
    MODE_STICK = 0,
    MODE_POINT = 1,
  };

  SelectionRenderer();
  ~SelectionRenderer() override;

  const char *getTypeName() const override;

  void setSelection(SelectionPtr pSel) override {}
    
  // Get selection object
  SelectionPtr getSelection() const override;

  // virtual void attachObj(qlib::uid_t obj_uid);
  // virtual qlib::uid_t detachObj();

  bool isTransp() const override;

  //////////////////////////////////////////////////////

  bool isRendBond() const override;

  void display(DisplayContext *pdc) override;

  void invalidateDisplayCache() override;

  void preRender(DisplayContext *pdc) override;
  void postRender(DisplayContext *pdc) override;

  void beginRend(DisplayContext *pdl) override;
  void endRend(DisplayContext *pdl) override;

  void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded) override;
  void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB) override;

  // virtual void render(DisplayContext *pdl, MolSelectPtr pSel);

  bool isHitTestSupported() const override { return false; }
  void renderHit(DisplayContext *phl) override {}

  //////////////////////////////////////////////////////

  void propChanged(qlib::LPropEvent &ev) override;

  /// object changed event (--> call invalidate if required)
  void objectChanged(qsys::ObjectEvent &ev) override;

  // virtual LString interpHit(const gfx::RawHitData &hdat) { return LString(); }

  // void targetChanged(MbObjEvent &ev);

  // const char *getClassName() const;
  // Renderer *create();
  // bool isCompat(MbObject *pclient);

  // virtual bool isUserCreateable() const;
  // virtual bool isUserDeleteable() const;

  ////////////////////////////////////////////
  // property handling
  // virtual bool setPropVec(const char *propname, const Vector3D &value);
  // virtual bool getPropVec(const char *propname, Vector3D &value);
  // virtual bool setPropReal(const char *propname, double value);
  // virtual bool getPropReal(const char *propname, double &value);

  // virtual void uiChangeProp();

};

}

#endif

