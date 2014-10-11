// -*-Mode: C++;-*-
//
// RealPropAnim: realnum-value property animation
//

#ifndef ANIM_REAL_PROP_ANIM_HPP_INCLUDED
#define ANIM_REAL_PROP_ANIM_HPP_INCLUDED

#include "anim.hpp"

#include "RendPropAnim.hpp"

namespace anim {

  using qlib::LReal;
  using qsys::RendererPtr;
  using qsys::AnimMgr;

  class ANIM_API RealPropAnim : public RendPropAnim
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef RendPropAnim super_t;

    // persistent props
    LReal m_startValue;
    LReal m_endValue;

    // workarea

  public:
    RealPropAnim();
    RealPropAnim(const RealPropAnim &arg);
    virtual ~RealPropAnim();

    virtual void onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid);

    virtual void onStart(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimer(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onEnd(qlib::time_value elapsed, AnimMgr *pMgr);

    LReal getStartValue() const { return m_startValue; }
    void setStartValue(LReal val) { m_startValue = val; }

    LReal getEndValue() const { return m_endValue; }
    void setEndValue(LReal val) { m_endValue = val; }

  };
}

#endif

