// -*-Mode: C++;-*-
//
// RendXformAnim: affine transformation animation for renderer
//

#ifndef ANIM_REND_XFORMANIM_HPP_INCLUDED
#define ANIM_REND_XFORMANIM_HPP_INCLUDED

#include "anim.hpp"

#include "RendPropAnim.hpp"
#include <qlib/LScrVector4D.hpp>
#include <qlib/LScrMatrix4D.hpp>
#include <qlib/LQuat.hpp>

namespace anim {

  using qlib::LReal;
  using qlib::LScrVector4D;
  using qlib::Vector4D;
  using qsys::RendererPtr;
  using qsys::CameraPtr;
  using qsys::AnimMgr;

  class ANIM_API RendXformAnim : public RendPropAnim
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef RendPropAnim super_t;

    /////////////////////
    // persistent props

    /// start dpos (in camera coord sys)
    Vector4D m_startDPos;

    /// end dpos (in camera coord sys)
    Vector4D m_endDPos;


    /////////////////////
    // workarea

    /// Center of target renderer
    Vector4D m_rendCent;

    /// dpos in world coord sys
    Vector4D m_stDPosWld;
    Vector4D m_enDPosWld;

  public:
    RendXformAnim();
    RendXformAnim(const RendXformAnim &arg);
    virtual ~RendXformAnim();

    virtual void onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid);

    virtual void onStart(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimer(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onEnd(qlib::time_value elapsed, AnimMgr *pMgr);

    virtual LString getPropName() const;
    virtual void setPropName(LString val);

    /////////////////////
    // persistent props

    Vector4D getStartDPos() const { return m_startDPos; }
    void setStartDPos(const Vector4D &val) { m_startDPos = val; }

    Vector4D getEndDPos() const { return m_endDPos; }
    void setEndDPos(const Vector4D &val) { m_endDPos = val; }

  };
}

#endif

