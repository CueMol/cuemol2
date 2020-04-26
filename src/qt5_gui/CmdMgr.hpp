#pragma once

#include <qlib/LScrObjects.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>
#include <qlib/MapTable.hpp>

#include "Command.hpp"
#include "qt5_gui.hpp"

namespace qt5_gui {

using qlib::LString;

class QT5GUI_API CmdMgr : public qlib::LSingletonScrObject,
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

    CommandPtr getCmd(const LString &cmd_name) const {
        return m_cmdtab.get(cmd_name);
    }

    static bool init()
    {
        return super_t::init();
    }

    static void fini()
    {
        super_t::fini();
    }
};

}  // namespace qt5_gui

SINGLETON_BASE_DECL(qt5_gui::CmdMgr);
