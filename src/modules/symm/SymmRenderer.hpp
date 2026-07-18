// -*-Mode: C++;-*-
//
//  Symmetry molecule renderer
//

#ifndef SYMM_SYMM_RENDERER_HPP_INCLUDED
#define SYMM_SYMM_RENDERER_HPP_INCLUDED

#include "symm.hpp"

#include <qsys/Renderer.hpp>

#include <qlib/Matrix4D.hpp>
#include <qlib/Vector4D.hpp>
#include <qsys/ViewEvent.hpp>

namespace symm {

class CrystalInfo;

using qlib::Matrix4D;
using qlib::Vector4D;
using gfx::DisplayContext;

class SymmRenderer : public qsys::Renderer,
                     public qsys::ViewEventListener
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  typedef qsys::Renderer super_t;

private:
  //////////////////////////////////////////////////////

  /// Maximum number of operators allowed
  int m_nMaxOps;

  /// Show hidden renderers
  bool m_bShowHiddenRends;

  //////////////////////////////////////////////////////

  typedef std::pair<LString, Matrix4D> SymmElem;
  typedef std::vector<SymmElem> data_t;

  /// Symmetry operators to be renderered
  data_t m_data;

  /// Flag indicating that m_data (operator list) should be updated.
  bool m_bUpdate;

  // /// Renderer ID list of the target
  // typedef std::vector<Renderer *> RendList;
  // RendList m_idl;

public:
  //////////////////////////////////////////////////////
  // renderer support

  SymmRenderer();
  ~SymmRenderer() override;

  bool isCompatibleObj(qsys::ObjectPtr pobj) const override;
  LString toString() const override;
  const char *getTypeName() const override;

  qlib::Vector4D getCenter() const override;

  //////////////////////////////////////////////////////
  // Renderer implementation
  
  void display(DisplayContext *pdc) override;
  
  // virtual void invalidateDisplayCache();
  

  //////////////////////////////////////////////////////
  // hit test support

  bool isHitTestSupported() const override;

  // Render hittest object
  void displayHit(DisplayContext *pdc) override;

  /// Hittest result interpretation
  LString interpHit(const gfx::RawHitData &hdat) override;

  //////////////////////////////////////////////////////
  // For auto-update of rendering center

  /// View event for auto-update center
  void viewChanged(qsys::ViewEvent &) override;

  /// Setup view event capturing
  void setSceneID(qlib::uid_t nid) override;

  /// Release view event capturing
  qlib::uid_t detachObj() override;


  //////////////////////////////////////////////////////
private:
  double m_dExtent;
  bool m_bUnitCell;
  Vector4D m_center;
  bool m_bAutoUpdate;
  
public:

  /// Remove all operators
  void clear();

  int genByCell();
  int genByExtent();

  int getMaxOp() const { return m_nMaxOps; }
  void setMaxOp(int nmax) { m_nMaxOps = nmax; }

  double getExtent() const { return m_dExtent; }
  void setExtent(double v) {
    m_dExtent = v;
    m_bUpdate = true;
  }
  
  // Vector4D getShowCenter() const { return m_center; }
  void setCenter(const Vector4D &v) {
    m_center = v;
    m_bUpdate = true;
  }

  bool isUnitCellMode() const { return m_bUnitCell; }
  void setUnitCellMode(bool v) {
    m_bUnitCell = v;
    m_bUpdate = true;
  }

  bool isAutoUpdate() const { return m_bAutoUpdate; }
  void setAutoUpdate(bool v) {
    m_bAutoUpdate = v;
    m_bUpdate = true;
  }

  //Vector4D xform(int symid, const Vector4D &pos) const;
  Matrix4D getXformMatrix(int symid) const;

  /// symm-update event handling
  void objectChanged(qsys::ObjectEvent &ev) override;

  //////////////////////////////////////////////////////

private:
  void rendSymm(DisplayContext *pdc, qsys::Renderer *prend);
  void rendHitSymm(DisplayContext *pdc, qsys::Renderer *prend);

  CrystalInfoPtr m_pci;
  // Vector4D m_fview;
  Matrix4D m_mat, m_orthmat;
  LString m_matname;
  
  // Vector4D m_fmolx;
  Vector4D m_molcen;

  bool checkPos(const Vector4D &trn);
  int searchZ(const Vector4D &trn);
  int searchY(const Vector4D &trn);
  int searchX(const Vector4D &trn);

  DisplayContext *m_pdc;
  
  bool m_bSearchTerm;

/*
  bool setupTargetList();
  void rendHitSymm(DisplayContext *pdc, Renderer *prend);
*/

};

} // namespace symm

#endif
