//
//
//

#include <qlib/SingletonBase.hpp>

#include "SceneEvent.hpp"
#include "qsys.hpp"

namespace gfx {
class ProgramObject;
}  // namespace gfx

namespace qsys {

using qlib::LString;
using gfx::ProgramObject;

///
///  Program object manager
///
class ProgObjMgr : public qlib::SingletonBase<ProgObjMgr>,
                   public qsys::SceneEventListener
{
private:
    typedef std::map<LString, ProgramObject *> data_t;

    data_t m_data;

public:
    ProgObjMgr() {}
    ~ProgObjMgr();

    // ProgramObject *createProgramObject(const LString &name, qlib::uid_t nSceneID);
    bool registerProgramObject(const LString &name, qlib::uid_t nSceneID,
                               ProgramObject *ppo);

    ProgramObject *getProgramObject(const LString &name, qlib::uid_t nSceneID);

    virtual void sceneChanged(qsys::SceneEvent &ev);
};

}  // namespace qsys

SINGLETON_BASE_DECL(qsys::ProgObjMgr);
