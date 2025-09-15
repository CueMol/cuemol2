//
// ShaderSetupHelper.hpp
//

#pragma once

#include "sysdep.hpp"

#include <qsys/View.hpp>
// #include <qsys/Scene.hpp>
#include "OglDisplayContext.hpp"

namespace sysdep {

class OglDisplayContext;

// template <class _ClientType>
// class ContextGetter
// {
// private:
//     _ClientType *m_pCli;

// public:
//     ContextGetter(_ClientType *pCli) : m_pCli(pCli) {}

//     qsys::ScenePtr getTargetScene() const
//     {
//         return m_pCli->getScene();
//     }

//     OglDisplayContext *getContext()
//     {
//         OglDisplayContext *pOglDC = NULL;
//         qsys::ScenePtr pScene = getTargetScene();
//         qsys::Scene::ViewIter vi = pScene->beginView();
//         qsys::Scene::ViewIter vie = pScene->endView();
//         for (; vi != vie; ++vi) {
//             qsys::ViewPtr pView = vi->second;
//             gfx::DisplayContext *pDC = pView->getDisplayContext();
//             // pDC->setCurrent();
//             pOglDC = dynamic_cast<sysdep::OglDisplayContext *>(pDC);
//             if (pOglDC != NULL) break;
//         }
//         return pOglDC;
//     }
//};

//////////

class SYSDEP_API ShaderSetupHelper
{
private:
    OglDisplayContext *m_pCtxt;

public:
    ShaderSetupHelper(gfx::DisplayContext *pCtxt)
        : m_pCtxt(dynamic_cast<OglDisplayContext *>(pCtxt))
    {
    }

    ~ShaderSetupHelper() {}

    inline bool checkEnvVS() const
    {
        if (!qsys::View::hasVBO() || !qsys::View::hasVS()) {
            return false;
        }
        return true;
    }

    inline bool checkEnvGS() const
    {
        if (!qsys::View::hasVBO() || !qsys::View::hasGS()) {
            return false;
        }
        return true;
    }

    inline OglDisplayContext *getContext()
    {
        // TODO: impl
        return m_pCtxt;
    }

    OglProgramObject *createProgObj(const LString &name, const LString &vert_path,
                                    const LString &frag_path);

    OglProgramObject *createProgObj(const LString &name, const LString &vert_path,
                                    const LString &frag_path, const LString &geom_path,
                                    GLint in_type, GLint out_type, GLint out_count);
};

// //
// // _ClientType must have getScene() method.
// //
// template <class _ClientType>
// class ShaderSetupHelper : public ShaderSetupHelperBase
// {
// private:
//     _ClientType *m_pCli;

// public:
//     ShaderSetupHelper(_ClientType *pCli) : m_pCli(pCli) {}

//     qsys::ScenePtr getTargetScene() const
//     {
//         return m_pCli->getScene();
//     }
// };

}  // namespace sysdep
