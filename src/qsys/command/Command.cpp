#include <common.h>

#include "Command.hpp"

#include <qlib/ObjectManager.hpp>

namespace qsys {

Command::Command()
{
    m_uid = qlib::ObjectManager::sRegObj(this);
}

Command::~Command()
{
    qlib::ObjectManager::sUnregObj(m_uid);
}

//////////

}  // namespace qsys
