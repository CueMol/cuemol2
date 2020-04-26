#define NO_USING_QTYPES

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

}  // namespace qt5_gui
