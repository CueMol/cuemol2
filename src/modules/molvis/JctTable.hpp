// -*-Mode: C++;-*-
//
//  Junction shape table for Ribbon
//

#ifndef MOLVIS_JUNCTION_TABLE_HPP_INCLUDED
#define MOLVIS_JUNCTION_TABLE_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/mcutils.hpp>

class JctTable_wrap;

namespace molvis {

using qlib::Vector4D;
class TubeSection;

///
//   Table class for junction rendering
//   between coil, helix, and sheet of Ribbon.
//
class JctTable : public qlib::LSimpleCopyScrObject
{
  MC_SCRIPTABLE;
  MC_CLONEABLE;

  friend class ::JctTable_wrap;

private:

  //
  //  properties
  //

  /** type of junction */
  //MCINFO: int m_nType => type
  int m_nType;

  /** form factor gamma */
  //MCINFO: double m_gamma => gamma
  double m_gamma;

  //MCINFO: double m_basw => basw
  double m_basw;

  //MCINFO: double m_arrow => arrow
  double m_arrow;

  //
  //  workspace
  //

  /** size of m_pEsclTab */
  int m_nTabSz;

  /** parameter table */
  double *m_pParTab;

  struct ScaleDiff {
    double sclx;
    double scly;

    double difx;
    double dify;
  };

  /** scaling factor & diff table */
  ScaleDiff *m_pEsclTab;

  bool m_fPartition;
  
public:
  /// ID of junction type
  enum {
    JT_SMOOTH1,
    JT_ARROW1,
    JT_FLAT
  };
  
public:
  JctTable();
  ~JctTable();

  bool isValid() const {
    return (m_nTabSz>0 && m_pParTab!=NULL && m_pEsclTab!=NULL);
  }
  void invalidate();

  ///////////////////////////////////
  // Getter/Setter

  /// Get the size of par/escl table
  int getSize() const { return m_nTabSz; }

  /// Set junction type
  void setType(int n);

  /// Get junction type
  int getType() const { return m_nType; }

  double getGamma() const { return m_gamma; }
  void setGamma(double val) {
    m_gamma = val;
    invalidate();
  }
  
  double getBasw() const { return m_basw; }
  void setBasw(double val) {
    m_basw = val;
    invalidate();
  }

  double getArrow() const { return m_arrow; }
  void setArrow(double val) {
    m_arrow = val;
    invalidate();
  }

  ///////////////////////////////////

  /// Generate junction table with the current settings
  /// @param frev: true for head, false for tail
  bool setup(int ndetail, TubeSection *pts1, TubeSection *pts2, bool frev=false);

  /** get axial param & scaling coeff */
  bool get(int index, double &par, double &e1scl, double &e2scl) const {
    MB_ASSERT(index>=0 && index<m_nTabSz);
    if (index<0 && index>=m_nTabSz) return false;
    par = m_pParTab[index];
    e1scl = m_pEsclTab[index].sclx;
    e2scl = m_pEsclTab[index].scly;
    return true;
  }

  /// Get axial param & scaling coeff
  bool get(int index, double &par, Vector4D &vv) const {
    MB_ASSERT(index>=0 && index<m_nTabSz);
    if (index<0 && index>=m_nTabSz) return false;
    par = m_pParTab[index];
    vv.x() = m_pEsclTab[index].sclx;
    vv.y() = m_pEsclTab[index].scly;
    vv.z() = m_pEsclTab[index].difx;
    vv.w() = m_pEsclTab[index].dify;
    return true;
  }

  /// Get axial param only
  bool get(int index, double &par) const {
    MB_ASSERT(index>=0 && index<m_nTabSz);
    if (index<0 && index>=m_nTabSz) return false;
    par = m_pParTab[index];
    return true;
  }

  /// Partitioning is required ?
  bool isReqPart() const { return m_fPartition; }
  
private:
  bool setup_smo1(int ndetail, TubeSection *pts1, TubeSection *pts2, bool frev);
  bool setup_arrow1(int ndetail, TubeSection *pts1, TubeSection *pts2, bool frev);
  
};

typedef qlib::LScrSp<JctTable> JctTablePtr;

} // namespace molvis

#endif

