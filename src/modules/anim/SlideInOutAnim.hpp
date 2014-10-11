// -*-Mode: C++;-*-
//
// SlideInOutAnim: slide in/out animation of renderers
//

#ifndef ANIM_SLIDE_INOUT_ANIM_HPP_INCLUDED
#define ANIM_SLIDE_INOUT_ANIM_HPP_INCLUDED

#include "anim.hpp"

#include "RendXformAnim.hpp"

namespace anim {

  class ANIM_API SlideInOutAnim : public RendXformAnim
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef RendXformAnim super_t;

    /////////////////////
    // persistent props

    /// Hide (slide-out) the renderer(s)
    bool m_bHide;

    /// start/end direction (in degree unit)
    double m_direction;

    /// start/end distance (in view-height unit)
    double m_distance;

    /// convert distance/angle to dpos
    void convDistDir(AnimMgr *pMgr);

  public:
    SlideInOutAnim();
    SlideInOutAnim(const SlideInOutAnim &arg);
    virtual ~SlideInOutAnim();

    virtual void onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid);

    virtual void onStart(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimer(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onEnd(qlib::time_value elapsed, AnimMgr *pMgr);

    /////////////////////
    // persistent props

    bool isHide() const { return m_bHide; }
    void setHide(bool b) { m_bHide = b; }

    double getDirection() const { return m_direction; }
    void setDirection(double b) { m_direction = b; }

    double getDistance() const { return m_distance; }
    void setDistance(double b) { m_distance = b; }

    virtual LString getPropName() const;
    virtual void setPropName(LString val);

  };
}

#endif

