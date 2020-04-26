#include <common.h>

#include "CmdMgr.hpp"

SINGLETON_BASE_IMPL(qt5_gui::CmdMgr);

namespace qt5_gui {

CmdMgr::CmdMgr() {}

CmdMgr::~CmdMgr() {}

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

void CmdMgr::runGUICmd(const LString &cmd_name, QWidget *pwnd_info) const
{
    GUICommandPtr pCmd = getCmd(cmd_name);
    if (pCmd.isnull()) {
        MB_THROW(qlib::NullPointerException, "command not found");
        return;
    }

    pCmd->resetAllProps();
    pCmd->runGUI(pwnd_info);
}

}  // namespace qt5_gui
