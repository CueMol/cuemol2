#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include "qsys/qsys.hpp"

class SurfaceEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init("");
    }
    void TearDown() override {
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new SurfaceEnvironment());
    return RUN_ALL_TESTS();
}
