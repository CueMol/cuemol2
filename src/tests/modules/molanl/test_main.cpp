#include <gtest/gtest.h>
#include <common.h>
#include <qlib/qlib.hpp>
#include <qsys/qsys.hpp>

namespace molstr {
extern bool init();
extern void fini();
}

namespace molanl {
extern bool init();
extern void fini();
}

class MolanlEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init(CUEMOL2_SYSCONFIG_PATH);
        molstr::init();
        molanl::init();
    }
    void TearDown() override {
        molanl::fini();
        molstr::fini();
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new MolanlEnvironment());
    return RUN_ALL_TESTS();
}
