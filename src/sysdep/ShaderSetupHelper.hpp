//
// ShaderSetupHelper.hpp
//

#pragma once

#include "sysdep.hpp"

#include <qsys/View.hpp>

namespace sysdep {

class OcDisplayContext;

using DisplayContextType = OcDisplayContext;

class SYSDEP_API ShaderSetupHelper
{
private:
    DisplayContextType *m_pCtxt;

public:
    ShaderSetupHelper(gfx::DisplayContext *pCtxt);

    ~ShaderSetupHelper();

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

    inline DisplayContextType *getContext()
    {
        // TODO: impl
        return m_pCtxt;
    }

    OglProgramObject *createProgObj(const LString &name, const LString &vert_path,
                                    const LString &frag_path);

    OglProgramObject *createProgObj(const LString &name, const LString &vert_path,
                                    const LString &frag_path, const LString &geom_path);
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
