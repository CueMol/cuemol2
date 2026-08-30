#include <common.h>

#include "Command.hpp"

#include <qlib/ObjectManager.hpp>

namespace qsys {

Command::Command()
{
    m_uid = qlib::ObjectManager::sRegObj(this);
}

Command::Command(const Command &r) : qlib::LSimpleCopyScrObject(r), qlib::LUIDObject(r)
{
    // CmdMgr::getCmd() hands out copies of the registered template; the
    // implicit copy shared the UID and the copy's destructor unregistered
    // the template
    m_uid = qlib::ObjectManager::sRegObj(this);
}

Command &Command::operator=(const Command &r)
{
    if (&r != this) qlib::LSimpleCopyScrObject::operator=(r);
    return *this;  // keeps its own UID
}

Command::~Command()
{
    qlib::ObjectManager::sUnregObj(m_uid);
}

//////////

}  // namespace qsys
