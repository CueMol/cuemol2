// -*-Mode: C++;-*-
//
// ShaderObject manager
//

#include <common.h>

#include "ShaderObjMgr.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/ShaderObject.hpp>

#include "SceneEvent.hpp"
#include "SceneManager.hpp"

SINGLETON_BASE_IMPL(qsys::ShaderObjMgr);

namespace qsys {

using gfx::DisplayContext;

ShaderObjMgr::~ShaderObjMgr()
{
    for (data_t::value_type &elem : m_data) {
        MB_DPRINTLN("ProgMgr> dtor() Warning: %s not removed", elem.first.c_str());
        if (elem.second != NULL) {
            delete elem.second;
        }
    }
}

bool ShaderObjMgr::registerShaderObject(const LString &name, qlib::uid_t nSceneID,
                                        ShaderObject *ppo)
{
    qsys::ScenePtr pScene = qsys::SceneManager::getSceneS(nSceneID);
    if (pScene.isnull()) {
        // ERROR
        return false;
    }
    pScene->addListener(this);

    ppo->setName(name);
    LString key = LString::format("%s@%d", name.c_str(), nSceneID);
    m_data.insert(data_t::value_type(key, ppo));
    return true;
}

ShaderObject *ShaderObjMgr::getShaderObject(const LString &name, qlib::uid_t nSceneID)
{
    auto key = LString::format("%s@%d", name.c_str(), nSceneID);

    data_t::const_iterator i = m_data.find(key);
    if (i == m_data.end()) return NULL;

    return i->second;
}

void ShaderObjMgr::sceneChanged(SceneEvent &ev)
{
    if (ev.getType() != SceneEvent::SCE_SCENE_REMOVING) return;

    qlib::uid_t nid = ev.getTarget();
    LString key = LString::format("@%d", nid);

    std::list<LString> delkeys;

    for (data_t::value_type &elem : m_data) {
        if (elem.first.endsWith(key)) {
            delkeys.push_back(elem.first);
        }
    }

    for (const LString &key : delkeys) {
        data_t::iterator iter = m_data.find(key);
        if (iter != m_data.end()) {
            MB_DPRINTLN("Destroy progobj: %s", key.c_str());
            if (iter->second != NULL) delete iter->second;
            m_data.erase(iter);
        }
    }
}
}  // namespace qsys
