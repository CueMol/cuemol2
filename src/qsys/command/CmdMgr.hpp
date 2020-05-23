#pragma once

#include <qlib/LScrObjects.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>
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
    CmdMgr();
    virtual ~CmdMgr();

    /// Register a command object
    void regist(const CommandPtr &pcmd);

    /// Unregister a command by name
    bool unregist(const LString &cmd_name);

    /// Get command object by command name
    CommandPtr getCmd(const LString &cmd_name) const
    {
        return m_cmdtab.get(cmd_name);
    }

    /// Run non-GUI command
    // TO DO: dict argments?
    void runCmd(const LString &cmd_name) const;

    /// Run GUI command
    // TO DO: dict argments?
    void runGUICmd(const LString &cmd_name, void *pwnd_info) const;

    static bool init()
    {
        return super_t::init();
    }

    static void fini()
    {
        super_t::fini();
    }
};

}  // namespace qsys

SINGLETON_BASE_DECL(qsys::CmdMgr);
