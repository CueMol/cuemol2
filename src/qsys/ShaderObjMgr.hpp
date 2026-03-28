///
///  Shader object manager
///

#pragma once

#include <qlib/SingletonBase.hpp>

#include "SceneEvent.hpp"
#include "qsys.hpp"

namespace gfx {
class ShaderObject;
}

namespace qsys {

using gfx::ShaderObject;
using qlib::LString;

class ShaderObjMgr : public qlib::SingletonBase<ShaderObjMgr>,
                     public qsys::SceneEventListener
{
private:
    typedef std::map<LString, ShaderObject *> data_t;

    data_t m_data;

public:
    ShaderObjMgr() {}
    ~ShaderObjMgr();

    bool registerShaderObject(const LString &name, qlib::uid_t nSceneID,
                              ShaderObject *ppo);

    ShaderObject *getShaderObject(const LString &name, qlib::uid_t nSceneID);

    virtual void sceneChanged(qsys::SceneEvent &ev);
};

}  // namespace qsys

SINGLETON_BASE_DECL(qsys::ShaderObjMgr);
