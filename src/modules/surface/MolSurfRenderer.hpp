// -*-Mode: C++;-*-
//
//  molecular surface renderer
//
// $Id: MolSurfRenderer.hpp,v 1.8 2011/04/02 07:57:34 rishitani Exp $

#ifndef MOLSURF_RENDERER_H__
#define MOLSURF_RENDERER_H__

#include "surface.hpp"

#include <qlib/mcutils.hpp>
// #include <qlib/Vector4D.hpp>

#include <qsys/DispListRenderer.hpp>
#include <gfx/SolidColor.hpp>

#include "MolSurfObj.hpp"

#include <modules/molstr/molstr.hpp>
#include <modules/molstr/ColoringScheme.hpp>

namespace qsys { class ScalarObject; }
namespace molstr {
  class MolCoord;
  class AtomPosMap;
}

namespace surface {

using qlib::Vector4D;
using gfx::ColorPtr;
using gfx::DisplayContext;
using molstr::MolCoordPtr;
using molstr::SelectionPtr;
using molstr::AtomPosMap;

class SURFACE_API MolSurfRenderer : public qsys::DispListRenderer, public molstr::ColSchmHolder
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  typedef qsys::DispListRenderer super_t;

private:

  /// cull face
  bool m_bCullFace;

  /// Coloring mode
  int m_nMode;
  
  /// Mesh-drawing mode
  int m_nDrawMode;

  /// Molecule object ID by which painting color is determined.
  /// (used in MOLFANC mode)
  qlib::uid_t m_nTgtMolID;

  /// Molecule object name by which painting color is determined.
  /// used in MOLFANC mode
  /// used if MolID cannot be resolved (when deserialized from qsc file...)
  LString m_sTgtMolName;

  /// potentialmap object name by which painting color is determined.
  /// (used in ELEPOT mode)
  LString m_sTgtElePot;

  /// Selection for atompos-map (used in MOLFANC mode)
  SelectionPtr m_pMolSel;

  /// Selection for display (used in MOLFANC mode)
  SelectionPtr m_pShowSel;

  /// Color params in potential mode
  double m_dParLow;

  double m_dParMid;

  double m_dParHigh;

  ColorPtr m_colHigh;

  ColorPtr m_colMid;

  ColorPtr m_colLow;

  /// Ramp_above mode
  bool m_bRampAbove;

  /// Line/Dot size in wireframe/dot mode
  double m_lw;

  /////////////
  // work area
  qsys::ScalarObject *m_pScaObj;

  MolCoordPtr m_pMol;
  AtomPosMap *m_pAmap;

  /// target surface object
  MolSurfObj *m_pSurf;

public:
  enum {
    SFREND_SIMPLE = 0,
    SFREND_SCAPOT = 1,
    SFREND_MOLSIMP = 2,
    SFREND_MOLFANC = 3,
  };

  enum {
    SFDRAW_FILL = 0,
    SFDRAW_LINE = 1,
    SFDRAW_POINT = 2,
  };

public:

  ///////////////////////////////////////////
  // constructors / destructor

  /** default constructor */
  MolSurfRenderer();

  /** destructor */
  virtual ~MolSurfRenderer();

  //////////////////////////////////////////////////////
  // Renderer implementation
  
  virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;
  
  virtual LString toString() const;

  ///////////////////////////////////////////

  virtual const char *getTypeName() const;

  // virtual void attachObj(qlib::uid_t obj_uid);
  // virtual qlib::uid_t detachObj();

  virtual Vector4D getCenter() const;
  virtual bool hasCenter() const;

  ///////////////////////////////////////////
  // DispListRenderer implemention

  virtual void preRender(DisplayContext *pdc);
  virtual void postRender(DisplayContext *pdc);

  virtual void render(DisplayContext *pdl);

  // virtual void targetChanged(MbObjEvent &ev);

  ///////////////////////////////////////////

  void setDefaultColor(const ColorPtr &rc) {
    ColSchmHolder::setDefaultColor(rc);
    invalidateDisplayCache();
  }
  
  bool isCullFace() const { return m_bCullFace; }
  void setCullFace(bool b) {
    m_bCullFace = b;
    invalidateDisplayCache();
  }

  int getDrawMode() const { return m_nDrawMode; }
  void setDrawMode(int n) {
    m_nDrawMode = n;
    invalidateDisplayCache();
  }

  void setLineWidth(double f) {
    m_lw = f;
    super_t::invalidateDisplayCache();
  }
  double getLineWidth() const { return m_lw; }
  

  int getColorMode() const { return m_nMode; }
  void setColorMode(int n) {
    m_nMode = n;
    invalidateDisplayCache();
  }

  /// Get reference molecule target (used in molecule mode)
  LString getTgtObjName() const;

  /// Set reference molecule target (used in molecule mode)
  void setTgtObjName(const LString &n);

  //////////
  // for "potential" mode

  /// reference elepot target (used in potential mode)
  LString getTgtElePotName() const { return m_sTgtElePot; }
  void setTgtElePotName(const LString &n) {
    m_sTgtElePot = n;
    invalidateDisplayCache();
  }

  double getLowPar() const { return m_dParLow; }
  void setLowPar(double d) {
    m_dParLow = d;
    if (m_nMode==SFREND_SCAPOT)
      invalidateDisplayCache();
  }

  double getMidPar() const { return m_dParMid; }
  void setMidPar(double d) {
    m_dParMid = d;
    if (m_nMode==SFREND_SCAPOT)
      invalidateDisplayCache();
  }

  double getHighPar() const { return m_dParHigh; }
  void setHighPar(double d) {
    m_dParHigh = d;
    if (m_nMode==SFREND_SCAPOT)
      invalidateDisplayCache();
  }

  ColorPtr getLowCol() const { return m_colLow; }
  void setLowCol(const ColorPtr &rc) {
    m_colLow = rc;
    if (m_nMode==SFREND_SCAPOT)
      invalidateDisplayCache();
  }

  ColorPtr getHighCol() const { return m_colHigh; }
  void setHighCol(const ColorPtr &rc) {
    m_colHigh = rc;
    if (m_nMode==SFREND_SCAPOT)
      invalidateDisplayCache();
  }

  ColorPtr getMidCol() const { return m_colMid; }
  void setMidCol(const ColorPtr &rc) {
    m_colMid = rc;
    if (m_nMode==SFREND_SCAPOT)
      invalidateDisplayCache();
  }

  bool isRampAbove() const { return m_bRampAbove; }
  void setRampAbove(bool val) {
    m_bRampAbove = val;
    if (m_nMode==SFREND_SCAPOT)
      invalidateDisplayCache();
  }

  ////

  SelectionPtr getMolSel() const {
    return m_pMolSel;
  }

  void setMolSel(SelectionPtr pNewSel) {
    m_pMolSel = pNewSel;
    makeAtomPosMap();
    invalidateDisplayCache();
  }

  void makeAtomPosMap();
  
  ////

  SelectionPtr getShowSel() const
  {
    return m_pShowSel;
  }

  void setShowSel(SelectionPtr pNewSel)
  {
    m_pShowSel = pNewSel;
    invalidateDisplayCache();
  }

  ////

  virtual void propChanged(qlib::LPropEvent &ev);
  
  /// object-changed event handler
  virtual void objectChanged(qsys::ObjectEvent &ev);

  /// scene-changed event handler (for onloaded event)
  virtual void sceneChanged(qsys::SceneEvent &ev);

private:

  bool getColorSca(const Vector4D &v, ColorPtr &rcol);
  bool getColorMol(const Vector4D &v, ColorPtr &rcol);
  bool isShowVert(const Vector4D &v);


  /// Resolve mol name, set m_nTgtMolID, listen the MolCoord events, and returns MolCoord object
  MolCoordPtr resolveMolIDImpl(const LString &name);
};

}

#endif

