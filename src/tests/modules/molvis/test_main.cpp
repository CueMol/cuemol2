#include <gtest/gtest.h>
#include <common.h>
#include <qlib/qlib.hpp>
#include <qsys/qsys.hpp>

namespace molstr {
extern bool init();
extern void fini();
}

namespace molvis {
extern bool init();
extern void fini();
}

class MolvisEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init(CUEMOL2_SYSCONFIG_PATH);
        molstr::init();
        molvis::init();
    }
    void TearDown() override {
        molvis::fini();
        molstr::fini();
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new MolvisEnvironment());
    return RUN_ALL_TESTS();
}
