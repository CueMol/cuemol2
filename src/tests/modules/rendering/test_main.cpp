#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include "qsys/qsys.hpp"
#include "modules/rendering/render.hpp"

// Test environment of the always-built render module tests: qsys is
// initialized with the sysconfig path (an empty path makes qsys::init()
// return early) and the render module registers its classes, so scene app
// data of class RenderSettings can be created by name.
class RenderModuleEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init(CUEMOL2_SYSCONFIG_PATH);
        render::init();
    }
    void TearDown() override {
        render::fini();
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new RenderModuleEnvironment());
    return RUN_ALL_TESTS();
}
