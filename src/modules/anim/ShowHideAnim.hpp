// -*-Mode: C++;-*-
//
// ShowHideAnim: renderer show/hide animation
//

#ifndef ANIM_SHOW_HIDE_ANIM_HPP_INCLUDED
#define ANIM_SHOW_HIDE_ANIM_HPP_INCLUDED

#include "anim.hpp"

#include "RendPropAnim.hpp"

namespace anim {

  using qlib::LReal;
  using qsys::RendererPtr;
  using qsys::AnimMgr;

  class ANIM_API ShowHideAnim : public RendPropAnim
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef RendPropAnim super_t;

    // persistent props

    /// Hide the renderer(s)
    bool m_bHide;

    /// Use the alpha fading
    bool m_bFade;

    /// target alpha
    double m_dTgtAlpha;

    // workarea

  public:
    ShowHideAnim();
    ShowHideAnim(const ShowHideAnim &arg);
    virtual ~ShowHideAnim();

    virtual void onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid);

    virtual void onStart(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimer(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onEnd(qlib::time_value elapsed, AnimMgr *pMgr);

    bool isHide() const { return m_bHide; }
    void setHide(bool b) { m_bHide = b; }

    bool isFade() const { return m_bFade; }
    void setFade(bool b) { m_bFade = b; }

    virtual LString getPropName() const;
    virtual void setPropName(LString val);

    double getTgtAlpha() const { return m_dTgtAlpha; }
    void setTgtAlpha(double d) { m_dTgtAlpha = d; }
  };
}

#endif

