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

    MolCoordPtr m_pTgtMol;
    SelectionPtr m_pTgtSel;

    Vector4D m_dirnorm;
    Vector4D m_startpos;

    MolSurfObjPtr m_pRes;

  public:

    /// ctor
    HoleSurfBuilder();

    /// dtor
    virtual ~HoleSurfBuilder();

    void setTargetMol(MolCoordPtr pMol) {
      m_pTgtMol = pMol;
    }
    MolCoordPtr getTargetMol() const {
      return m_pTgtMol;
    }

    void setTargetSel(SelectionPtr pSel) {
      m_pTgtSel = pSel;
    }
    SelectionPtr getTargetSel() const {
      return m_pTgtSel;
    }

    void setDirNorm(const Vector4D &v) {
      m_dirnorm = v;
    }
    const Vector4D &getDirNorm() const {
      return m_dirnorm;
    }

    void setStartPos(const Vector4D &v) {
      m_startpos = v;
    }
    const Vector4D &getStartPos() const {
      return m_startpos;
    }

    void doit();

    MolSurfObjPtr getResult() const {
      return m_pRes;
    }

  };

}

#endif

