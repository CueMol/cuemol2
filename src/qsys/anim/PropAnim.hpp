// -*-Mode: C++;-*-
//
// PropAnim: superclass of property animation objects
//

#ifndef QSYS_PROP_ANIM_HPP_INCLUDED
#define QSYS_PROP_ANIM_HPP_INCLUDED

#include <qsys/qsys.hpp>
#include "AnimObj.hpp"

namespace qsys {

  class QSYS_API PropAnim : public AnimObj
  {
  public:
    virtual ~PropAnim() {}

    // propanim interface
    virtual void onPropInit(AnimMgr *pMgr, qlib::uid_t tgt_uid) =0;

    virtual void getTgtUIDs(AnimMgr *pMgr, std::vector<qlib::uid_t> &arry) =0;

    virtual LString getPropName() const =0;
  };

}

#endif

