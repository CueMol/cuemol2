// -*-Mode: C++;-*-
//
// MolAnim: realnum-value property animation
//

#ifndef ANIM_MOL_ANIM_HPP_INCLUDED
#define ANIM_MOL_ANIM_HPP_INCLUDED

#include "anim.hpp"

#include <qsys/qsys.hpp>
#include <qsys/anim/PropAnim.hpp>
#include <qlib/LScrVector4D.hpp>
#include <qlib/LQuat.hpp>

namespace anim {

  using qlib::LReal;
  using qlib::LScrVector4D;
  using qlib::Vector4D;
  using qsys::RendererPtr;
  using qsys::AnimMgr;

  class ANIM_API MolAnim : public qsys::PropAnim
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  private:
    typedef qsys::PropAnim super_t;

    // persistent props
    LReal m_startValue;
    LReal m_endValue;

    /// target property name
    LString m_propName;

    /// target molobj name
    LString m_molName;
    
    // workarea
    qsys::ObjectPtr m_pObj;

  public:
    MolAnim();
    MolAnim(const MolAnim &arg);
    virtual ~MolAnim();

    virtual void getTgtUIDs(AnimMgr *pMgr, std::vector<qlib::uid_t> &arry);

    virtual void onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid);

    virtual void onStart(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onTimer(qlib::time_value elapsed, AnimMgr *pMgr);
    virtual void onEnd(qlib::time_value elapsed, AnimMgr *pMgr);

    LReal getStartValue() const { return m_startValue; }
    void setStartValue(LReal val) { m_startValue = val; }

    LReal getEndValue() const { return m_endValue; }
    void setEndValue(LReal val) { m_endValue = val; }

    LString getPropName() const {
      return m_propName;
    }
    void setPropName(LString val) {
      m_propName = val;
    }

    LString getMolName() const {
      return m_molName;
    }
    void setMolName(LString val) {
      m_molName = val;
    }

  private:
    bool fillCache(qsys::ScenePtr pScene);
  };
}

#endif

