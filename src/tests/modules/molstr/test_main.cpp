#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include "qsys/qsys.hpp"

namespace molstr {
extern bool init();
extern void fini();
}

// Same setup as the molvis/molanl suites: molstr::init() registers the
// scriptable classes (MolCoord etc.), so objects can be constructed in tests.
class MolstrEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init(CUEMOL2_SYSCONFIG_PATH);
        molstr::init();
    }
    void TearDown() override {
        molstr::fini();
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new MolstrEnvironment());
    return RUN_ALL_TESTS();
}
