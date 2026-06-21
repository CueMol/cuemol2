#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include "qsys/qsys.hpp"

// The umbreon export test drives a DisplayContext -> RendIntData, whose color
// resolution touches qsys::StyleMgr, so qsys must be initialized with the
// sysconfig path (an empty path makes qsys::init() return early). The build
// smoke test does not need it but is unaffected.
class RaytraceEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init(CUEMOL2_SYSCONFIG_PATH);
    }
    void TearDown() override {
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new RaytraceEnvironment());
    return RUN_ALL_TESTS();
}
