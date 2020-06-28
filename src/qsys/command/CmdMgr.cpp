#include <common.h>

#include "CmdMgr.hpp"

#include <qsys/Scene.hpp>

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
    if (!m_cmdtab.containsKey(cmd_name)) return CommandPtr();
    CommandPtr ptmpl = m_cmdtab.get(cmd_name);
    return CommandPtr(static_cast<Command *>(ptmpl->copy()));
}

CommandPtr CmdMgr::runGUICmd(const LString &cmd_name, void *pwnd_info) const
{
    CommandPtr pCmd = getCmd(cmd_name);
    if (pCmd.isnull()) {
        MB_THROW(qlib::NullPointerException, "command not found");
        return CommandPtr();
    }

    pCmd->resetAllProps();
    pCmd->runGUI(pwnd_info);

    return pCmd;
}

CommandPtr CmdMgr::runGUICmdWithTxn(const LString &cmd_name, void *pwnd_info,
                                    const ScenePtr &pTargScene,
                                    const LString &txn_msg) const
{
    CommandPtr pResult;
    pTargScene->startUndoTxn(txn_msg);
    try {
        pResult = runGUICmd(cmd_name, pwnd_info);
    } catch (...) {
        pTargScene->rollbackUndoTxn();
        throw;
    }
    pTargScene->commitUndoTxn();
    return pResult;
}

CommandPtr CmdMgr::runCmd(const LString &cmd_name) const
{
    CommandPtr pCmd = getCmd(cmd_name);
    if (pCmd.isnull()) {
        MB_THROW(qlib::NullPointerException, "command not found");
        return CommandPtr();
    }

    pCmd->resetAllProps();
    pCmd->run();

    return pCmd;
}

qlib::LVarDict CmdMgr::runCmd(const LString &cmd_name, const qlib::LVarDict &args) const
{
    CommandPtr pCmd = getCmd(cmd_name);
    if (pCmd.isnull()) {
        MB_THROW(qlib::NullPointerException, "command not found");
        return qlib::LVarDict();
    }

    pCmd->resetAllProps();

    for (const auto &elem : args) {
        printf("key: %s\n", elem.first.c_str());
        const auto &val = elem.second;
        pCmd->setProperty(elem.first, elem.second);
    }

    pCmd->run();

    qlib::LVarDict result;
    std::set<LString> names;
    pCmd->getPropNames(names);
    for (const auto &nm : names) {
        if (!pCmd->hasWritableProperty(nm)) {
            qlib::LVariant var;
            if (!pCmd->getProperty(nm, var)) {
                // ERROR
                MB_THROW(qlib::RuntimeException, "unexpected condition");
            }
            result.set(nm, var);
        }
    }

    return result;
}

}  // namespace qsys
