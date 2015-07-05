// -*-Mode: C++;-*-
//
//  HoleSurfBuilder
//

#ifndef HOLE_SURF_BUILDER_HPP_INCLUDE_
#define HOLE_SURF_BUILDER_HPP_INCLUDE_

#include "surface.hpp"
#include <qlib/LScrObjects.hpp>
#include <qlib/Vector4D.hpp>
#include <modules/molstr/molstr.hpp>
#include <modules/molstr/Selection.hpp>

using qlib::LString;

namespace molstr {
  class AtomPosMap;
}

namespace surface {

  using qlib::Vector4D;
  using molstr::MolCoordPtr;
  using molstr::SelectionPtr;

  ///
  //  HoleSurfBuilder
  //
  class SURFACE_API HoleSurfBuilder : public qlib::LNoCopyScrObject
  {
    MC_SCRIPTABLE;

  private:
    MolSurfObjPtr m_pRes;

  public:

    /// ctor
    HoleSurfBuilder();

    /// dtor
    virtual ~HoleSurfBuilder();

  private:
    /// Target molecule
    MolCoordPtr m_pTgtMol;

  public:
    void setTargetMol(MolCoordPtr pMol) {
      m_pTgtMol = pMol;
    }
    MolCoordPtr getTargetMol() const {
      return m_pTgtMol;
    }

  private:
    // Selection of calculation target (in m_pTgtMol)
    SelectionPtr m_pTgtSel;

  public:
    void setTargetSel(SelectionPtr pSel) {
      m_pTgtSel = pSel;
    }
    SelectionPtr getTargetSel() const {
      return m_pTgtSel;
    }

  private:
    Vector4D m_dirnorm;

  public:
    void setDirNorm(const Vector4D &v) {
      m_dirnorm = v;
    }
    const Vector4D &getDirNorm() const {
      return m_dirnorm;
    }

  private:
    Vector4D m_startpos;
    
  public:
    void setStartPos(const Vector4D &v) {
      m_startpos = v;
    }
    const Vector4D &getStartPos() const {
      return m_startpos;
    }

  private:
    /// point density for pore-surface generation
    double m_den;

  public:
    double getSurfDen() const { return m_den; }
    void setSurfDen(double v) { m_den = v; }
    
  private:
    /// probe radius for pore-surface generation
    double m_prober;

  public:
    double getSurfProbeR() const { return m_prober; }
    void setSurfProbeR(double v) { m_prober = v; }
    
    void doit();

    MolSurfObjPtr getResult() const {
      return m_pRes;
    }

  private:
    molstr::AtomPosMap *m_pAmap;

    void performMCOpt(double start_temp, const Vector4D &start_pos,
                      Vector4D &res_pos, double &res_rad);

    void findPath(double start_temp,
                  std::vector<Vector4D> &res_cen_ary,
                  double &res_score,
                  int &isl_max);

  };

}

#endif

