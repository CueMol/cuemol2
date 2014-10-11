// -*-Mode: C++;-*-
//
// NoopAnimObj: do nothing anim object
//

#ifndef ANIM_NOOP_ANIM_OBJ_HPP_INCLUDED
#define ANIM_NOOP_ANIM_OBJ_HPP_INCLUDED

#include "anim.hpp"
#include <qlib/LScrVector4D.hpp>
#include <qlib/LQuat.hpp>
#include <qsys/qsys.hpp>
#include <qsys/anim/AnimObj.hpp>

namespace anim {

  using qsys::AnimMgr;

  class ANIM_API NoopAnimObj : public qsys::AnimObj
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef qsys::AnimObj super_t;

  public:
    NoopAnimObj();
    NoopAnimObj(const NoopAnimObj &arg);
    virtual ~NoopAnimObj();

    // virtual void onStart(qlib::time_value elapsed, AnimMgr *pMgr);
    // virtual void onTimer(qlib::time_value elapsed, AnimMgr *pMgr);
    // virtual void onTimerPost(qlib::time_value elapsed, AnimMgr *pMgr);

  };
}

#endif

