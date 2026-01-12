// -*-Mode: C++;-*-
//
// OpenGL program object manager
//

#pragma once

#include "sysdep.hpp"

#include <qlib/SingletonBase.hpp>
#include <qsys/SceneEvent.hpp>
namespace gfx {
class DisplayContext;
}

namespace sysdep {

using gfx::DisplayContext;
using qlib::LString;
class OglProgramObject;

///
///  Program object manager
///
class SYSDEP_API OglProgObjMgr : public qlib::SingletonBase<OglProgObjMgr>,
                                 public qsys::SceneEventListener
{
private:
    typedef std::map<LString, OglProgramObject *> data_t;

    data_t m_data;

public:
    OglProgObjMgr() {}
    ~OglProgObjMgr();

    OglProgramObject *createProgramObject(const LString &name, DisplayContext *pdc);
    OglProgramObject *getProgramObject(const LString &name, DisplayContext *pdc);

    virtual void sceneChanged(qsys::SceneEvent &ev);
};

}  // namespace sysdep

SINGLETON_BASE_DECL(sysdep::OglProgObjMgr);
