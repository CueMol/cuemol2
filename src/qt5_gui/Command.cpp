#include <common.h>

#include "Command.hpp"

#include <qlib/ObjectManager.hpp>

namespace qt5_gui {

Command::Command()
{
    m_uid = qlib::ObjectManager::sRegObj(this);
}

Command::~Command()
{
    qlib::ObjectManager::sUnregObj(m_uid);
}

//////////

/// Execute the command
void NewSceneCommand::run() {}

void NewSceneCommand::runGUI(QWidget *pwnd_info) {}

/// Get command's unique name
const char *NewSceneCommand::getName() const
{
    return "new_scene";
}

}  // namespace qt5_gui
