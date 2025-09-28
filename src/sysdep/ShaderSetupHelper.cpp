//
// ShaderSetuphelper.cpp
// Helper functions for setting up shaders
//

#include <common.h>

#include "OglProgramObject.hpp"
#include "ogl_core/OcDisplayContext.hpp"
#include "ShaderSetupHelper.hpp"

namespace sysdep {

ShaderSetupHelper::ShaderSetupHelper(gfx::DisplayContext *pCtxt)
    : m_pCtxt(dynamic_cast<DisplayContextType *>(pCtxt))
{
}

ShaderSetupHelper::~ShaderSetupHelper() {}

OglProgramObject *ShaderSetupHelper::createProgObj(const LString &name,
                                                   const LString &vert_path,
                                                   const LString &frag_path)
{
    auto *pOglDC = getContext();

    if (pOglDC == NULL) return NULL;

    // setup shaders
    OglProgramObject *pPO = pOglDC->getProgramObject(name);
    if (pPO == NULL) {
        pPO = pOglDC->createProgramObject(name);
        if (pPO == NULL) {
            LOG_DPRINTLN("ShaderSetupHelper> ERROR: cannot create progobj <%s>.",
                         name.c_str());
            return NULL;
        }

        try {
            pPO->loadShader("vert", vert_path, GL_VERTEX_SHADER);
            pPO->loadShader("frag", frag_path, GL_FRAGMENT_SHADER);
            pPO->link();
        } catch (...) {
            LOG_DPRINTLN("FATAL ERROR: loadShader(%s) failed!!", name.c_str());
            return NULL;
        }
    }

    return pPO;
}

OglProgramObject *ShaderSetupHelper::createProgObj(
    const LString &name, const LString &vert_path, const LString &frag_path,
    const LString &geom_path, GLint in_type, GLint out_type, GLint out_count)
{
    auto *pOglDC = getContext();

    if (pOglDC == NULL) return NULL;

    // setup shaders
    OglProgramObject *pPO = pOglDC->getProgramObject(name);
    if (pPO == NULL) {
        pPO = pOglDC->createProgramObject(name);
        if (pPO == NULL) {
            LOG_DPRINTLN("ShaderSetupHelper> ERROR: cannot create progobj <%s>.",
                         name.c_str());
            return NULL;
        }

        try {
            pPO->loadShader("vert", vert_path, GL_VERTEX_SHADER);
            pPO->loadShader("frag", frag_path, GL_FRAGMENT_SHADER);
            pPO->loadShader("geom", geom_path, GL_GEOMETRY_SHADER);
            pPO->setProgParam(GL_GEOMETRY_INPUT_TYPE_EXT, in_type);
            pPO->setProgParam(GL_GEOMETRY_OUTPUT_TYPE_EXT, out_type);
            pPO->setProgParam(GL_GEOMETRY_VERTICES_OUT_EXT, out_count);
            pPO->link();
        } catch (...) {
            LOG_DPRINTLN("FATAL ERROR: loadShader(%s) failed!!", name.c_str());
            return NULL;
        }
    }

    return pPO;
}

}  // namespace sysdep
