//
// ShaderSetuphelper.cpp
// Helper functions for setting up shaders
//

#include <common.h>

#include "OglProgramObject.hpp"
#include "ShaderSetupHelper.hpp"
#include "ogl_core/OcDisplayContext.hpp"

#include <qsys/ShaderObjMgr.hpp>

namespace sysdep {

ShaderSetupHelper::ShaderSetupHelper(gfx::DisplayContext *pCtxt)
    : m_pCtxt(dynamic_cast<DisplayContextType *>(pCtxt))
{
}

ShaderSetupHelper::~ShaderSetupHelper() {}

gfx::ShaderObject *ShaderSetupHelper::createProgObj(const LString &name,
                                                    const LString &vert_path,
                                                    const LString &frag_path)
{
    auto *pOglDC = getContext();
    if (pOglDC == NULL) return NULL;

    qlib::uid_t sceneID = pOglDC->getSceneID();
    qsys::ShaderObjMgr *pMgr = qsys::ShaderObjMgr::getInstance();

    // Return existing shader if already registered
    gfx::ShaderObject *pExisting = pMgr->getShaderObject(name, sceneID);
    if (pExisting != NULL) return pExisting;

    // Create and initialize a new OglProgramObject
    OglProgramObject *pPO = new OglProgramObject();
    if (!pPO->init()) {
        LOG_DPRINTLN("ShaderSetupHelper> ERROR: cannot initialize OglProgramObject <%s>.",
                     name.c_str());
        delete pPO;
        return NULL;
    }

    try {
        pPO->loadShader("vert", vert_path, GL_VERTEX_SHADER);
        pPO->loadShader("frag", frag_path, GL_FRAGMENT_SHADER);
        pPO->link();
    } catch (...) {
        LOG_DPRINTLN("FATAL ERROR: loadShader(%s) failed!!", name.c_str());
        delete pPO;
        return NULL;
    }

    pMgr->registerShaderObject(name, sceneID, pPO);
    return pPO;
}

gfx::ShaderObject *ShaderSetupHelper::createProgObj(const LString &name,
                                                    const LString &vert_path,
                                                    const LString &frag_path,
                                                    const LString &geom_path)
{
    auto *pOglDC = getContext();
    if (pOglDC == NULL) return NULL;

    qlib::uid_t sceneID = pOglDC->getSceneID();
    qsys::ShaderObjMgr *pMgr = qsys::ShaderObjMgr::getInstance();

    // Return existing shader if already registered
    gfx::ShaderObject *pExisting = pMgr->getShaderObject(name, sceneID);
    if (pExisting != NULL) return pExisting;

    // Create and initialize a new OglProgramObject
    OglProgramObject *pPO = new OglProgramObject();
    if (!pPO->init()) {
        LOG_DPRINTLN("ShaderSetupHelper> ERROR: cannot initialize OglProgramObject <%s>.",
                     name.c_str());
        delete pPO;
        return NULL;
    }

    try {
        pPO->loadShader("vert", vert_path, GL_VERTEX_SHADER);
        pPO->loadShader("frag", frag_path, GL_FRAGMENT_SHADER);
        pPO->loadShader("geom", geom_path, GL_GEOMETRY_SHADER);
        pPO->link();
    } catch (...) {
        LOG_DPRINTLN("FATAL ERROR: loadShader(%s) failed!!", name.c_str());
        delete pPO;
        return NULL;
    }

    pMgr->registerShaderObject(name, sceneID, pPO);
    return pPO;
}

}  // namespace sysdep
