// -*-Mode: C++;-*-
//
// SimpleSpin: simple spin animation object
//

#ifndef ANIM_SIMPLE_SPIN_HPP_INCLUDED
#define ANIM_SIMPLE_SPIN_HPP_INCLUDED

#include "anim.hpp"
#include <qlib/LScrVector4D.hpp>
#include <qlib/LQuat.hpp>
#include <qsys/qsys.hpp>
#include <qsys/anim/AnimObj.hpp>

namespace anim {

  using qlib::LReal;
  using qlib::LScrVector4D;
  using qlib::Vector4D;
  using qsys::AnimMgr;

  class ANIM_API SimpleSpin : public qsys::AnimObj
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef qsys::AnimObj super_t;

    LReal m_angle;
    Vector4D m_axis;

    // workarea
    double m_anglRad2;
    qlib::LQuat m_endMulQ;

  public:
    SimpleSpin();
    SimpleSpin(const SimpleSpin &arg);
    virtual ~SimpleSpin();

    virtual void onStart(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimer(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimerPost(qlib::time_value elapsed, AnimMgr *pMgr);

    LReal getAngle() const { return m_angle; }
    void setAngle(LReal val) { m_angle = val; }

    LScrVector4D getScrAxis() const { return m_axis; }
    void setScrAxis(const LScrVector4D &val) {
      setAxis(val);
    }

    Vector4D getAxis() const { return m_axis; }
    void setAxis(const Vector4D &val);
  };
}

#endif

