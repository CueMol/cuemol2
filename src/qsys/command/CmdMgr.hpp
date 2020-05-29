#pragma once

#include <qlib/LScrObjects.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/LVarDict.hpp>
#include <qsys/qsys.hpp>

#include "Command.hpp"

namespace qsys {

using qlib::LString;

class QSYS_API CmdMgr : public qlib::LSingletonScrObject,
                        public qlib::SingletonBase<CmdMgr>
{
    using super_t = qlib::SingletonBase<CmdMgr>;
    MC_SCRIPTABLE;

private:
    using cmdtab_t = qlib::MapTable<CommandPtr>;

    cmdtab_t m_cmdtab;

public:
    CmdMgr() = default;
    virtual ~CmdMgr() = default;

    /// Register a command object
    void regist(const CommandPtr &pcmd);

    /// Unregister a command by name
    bool unregist(const LString &cmd_name);

    /// Get command object by command name
    CommandPtr getCmd(const LString &cmd_name) const;

    /// Run non-GUI command
    CommandPtr runCmd(const LString &cmd_name) const;

    /// Run non-GUI command with dict args 
    qlib::LVarDict runCmd(const LString &cmd_name, const qlib::LVarDict &args) const;

    /// Run GUI command
    // TO DO: dict argments?
    CommandPtr runGUICmd(const LString &cmd_name, void *pwnd_info) const;

    static bool init()
    {
        return super_t::init();
    }

    static void fini()
    {
        super_t::fini();
    }

    // helper method
    template <typename _Class>
    inline void regist()
    {
        regist(CommandPtr(MB_NEW _Class()));
    }
};

}  // namespace qsys

SINGLETON_BASE_DECL(qsys::CmdMgr);
