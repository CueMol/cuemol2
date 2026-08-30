#include <gtest/gtest.h>
#include <common.h>
#include "qsys/command/Command.hpp"
#include <qlib/ObjectManager.hpp>

namespace {

class NopCommand : public qsys::Command
{
public:
    void run() override {}
    void runGUI(void *) override {}
    const char *getName() const override { return "nop"; }
    qlib::LCloneableObject *clone() const override { return new NopCommand(*this); }
};

}  // namespace

// CmdMgr::getCmd() hands out copies of the registered template. The implicit
// copy shared the UID, and destroying the copy unregistered the template.
TEST(CommandCopy, CopyOwnsItsOwnUID)
{
    NopCommand tmpl;
    const qlib::uid_t uid = tmpl.getUID();
    ASSERT_NE(uid, qlib::invalid_uid);
    ASSERT_EQ(qlib::ObjectManager::sGetObj<qsys::Command>(uid), &tmpl);

    {
        NopCommand copy(tmpl);
        EXPECT_NE(copy.getUID(), uid);
        EXPECT_EQ(qlib::ObjectManager::sGetObj<qsys::Command>(copy.getUID()), &copy);
    }

    // the template is still registered after the copy is gone
    EXPECT_EQ(qlib::ObjectManager::sGetObj<qsys::Command>(uid), &tmpl);
}
