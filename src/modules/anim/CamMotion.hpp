// -*-Mode: C++;-*-
//
// CamMotion: camera-motion animation object
//

#ifndef ANIM_CAMERA_MOTION_HPP_INCLUDED
#define ANIM_CAMERA_MOTION_HPP_INCLUDED

#include "anim.hpp"

#include <qlib/LScrVector4D.hpp>
#include <qsys/qsys.hpp>
#include <qsys/anim/AnimObj.hpp>

class CamMotion_wrap;

namespace anim {

  using qlib::LReal;
  using qlib::LScrVector4D;
  using qlib::Vector4D;
  using qsys::CameraPtr;
  using qsys::AnimMgr;

  class ANIM_API CamMotion : public qsys::AnimObj
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef qsys::AnimObj super_t;

    friend class ::CamMotion_wrap;

  private:
    LString m_destCamName;

    bool m_bIgnoreCenter;
    bool m_bIgnoreRotate;
    bool m_bIgnoreZoom;
    bool m_bIgnoreSlab;

    /// Keep positivity of quaternion in slerp
    bool m_bKeepQuatPositive;

    // temporary work area
    CameraPtr m_pStaCam;
    CameraPtr m_pEndCam;

 public:
    CamMotion();
    CamMotion(const CamMotion &arg);
    virtual ~CamMotion();

    virtual void onStart(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimer(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimerPost(qlib::time_value elapsed, AnimMgr *pMgr);

    LString getDestCamName() const { return m_destCamName; }
    void setDestCamName(LString val) { m_destCamName = val; }

  };
}

#endif

