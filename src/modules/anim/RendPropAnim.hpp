// -*-Mode: C++;-*-
//
// RendPropAnim: renderer property animation
//

#ifndef ANIM_REND_PROP_ANIM_HPP_INCLUDED
#define ANIM_REND_PROP_ANIM_HPP_INCLUDED

#include "anim.hpp"

#include <qsys/qsys.hpp>
#include <qsys/anim/PropAnim.hpp>

namespace anim {

  class ANIM_API RendPropAnim : public qsys::PropAnim
  {
    // MC_SCRIPTABLE;

  private:
    // persistent props
    LString m_propName;

    /// target renderer names
    LString m_rendNames;

    ///////////
    // workarea
    
  protected:
    typedef std::vector<qsys::RendererPtr> rendlist_t;

  private:
    /// list of target renderer ptr
    rendlist_t m_rendPtrList;

    /// list of target renderer name (obj name, rend name)
    typedef std::deque<std::pair<LString, LString> > nmlist_t;
    nmlist_t m_rendNameList;

  public:
    RendPropAnim();
    RendPropAnim(const RendPropAnim &arg);
    virtual ~RendPropAnim();

    // propanim interface
    virtual void onPropInit(qsys::AnimMgr *pMgr, qlib::uid_t tgt_uid) =0;

    virtual LString getPropName() const;
    virtual void setPropName(LString val);

    virtual void getTgtUIDs(qsys::AnimMgr *pMgr, std::vector<qlib::uid_t> &arry);

    LString getRendNames() const;
    void setRendNames(LString val);

    //qlib::uid_t getTgtUID(qsys::AnimMgr *pMgr);

  protected:

    void fillRendArray(qsys::ScenePtr pScene);

    void clearRendArray() {
      m_rendPtrList.clear();
    }

    rendlist_t::const_iterator rendBegin() { return m_rendPtrList.begin(); }
    rendlist_t::const_iterator rendEnd() { return m_rendPtrList.end(); }
    
    void setVisible(qsys::RendererPtr pRend, bool value);
  };

}

#endif

