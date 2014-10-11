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

public:
  enum {
    MODE_STICK = 0,
    MODE_POINT = 1,
  };

  SelectionRenderer();
  virtual ~SelectionRenderer();

  virtual const char *getTypeName() const;

  virtual void setSelection(SelectionPtr pSel) {}
    
  // Get selection object
  virtual SelectionPtr getSelection() const;

  // virtual void attachObj(qlib::uid_t obj_uid);
  // virtual qlib::uid_t detachObj();

  virtual bool isTransp() const;

  //////////////////////////////////////////////////////

  virtual bool isRendBond() const;

  virtual void preRender(DisplayContext *pdc);
  virtual void postRender(DisplayContext *pdc);

  virtual void beginRend(DisplayContext *pdl);
  virtual void endRend(DisplayContext *pdl);

  virtual void rendAtom(DisplayContext *pdl, MolAtomPtr pAtom, bool fbonded);
  virtual void rendBond(DisplayContext *pdl, MolAtomPtr pAtom1, MolAtomPtr pAtom2, MolBond *pMB);

  // virtual void render(DisplayContext *pdl, MolSelectPtr pSel);

  virtual bool isHitTestSupported() const { return false; }
  virtual void renderHit(DisplayContext *phl) {}

  //////////////////////////////////////////////////////

  void propChanged(qlib::LPropEvent &ev);

  /// object changed event (--> call invalidate if required)
  virtual void objectChanged(qsys::ObjectEvent &ev);

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

