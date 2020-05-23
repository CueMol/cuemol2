#include <common.h>

#include "CmdMgr.hpp"

SINGLETON_BASE_IMPL(qsys::CmdMgr);

namespace qsys {

/// Register a command object
void CmdMgr::regist(const CommandPtr &pcmd)
{
    const char *pszname = pcmd->getName();
    if (m_cmdtab.containsKey(pszname)) {
        MB_THROW(qlib::RuntimeException, "CmdMgr::regist already registered");
        return;
    }
    m_cmdtab.set(pszname, pcmd);
}

/// Unregister a command by name
bool CmdMgr::unregist(const LString &cmd_name)
{
    if (!m_cmdtab.containsKey(cmd_name)) return false;

    m_cmdtab.remove(cmd_name);
    return true;
}

CommandPtr CmdMgr::getCmd(const LString &cmd_name) const
{
    CommandPtr ptmpl = m_cmdtab.get(cmd_name);
    return CommandPtr(static_cast<Command *>(ptmpl->copy()));
}

void CmdMgr::runGUICmd(const LString &cmd_name, void *pwnd_info) const
{
    CommandPtr pCmd = getCmd(cmd_name);
    if (pCmd.isnull()) {
        MB_THROW(qlib::NullPointerException, "command not found");
        return;
    }

    pCmd->resetAllProps();
    pCmd->runGUI(pwnd_info);
}

void CmdMgr::runCmd(const LString &cmd_name) const
{
    CommandPtr pCmd = getCmd(cmd_name);
    if (pCmd.isnull()) {
        MB_THROW(qlib::NullPointerException, "command not found");
        return;
    }

    pCmd->resetAllProps();
    pCmd->run();
}

qlib::LVarDict CmdMgr::runCmd(const LString &cmd_name, const qlib::LVarDict &args) const
{
    return qlib::LVarDict();
}

}  // namespace qsys
