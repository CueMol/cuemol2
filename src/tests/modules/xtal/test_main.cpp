#include <gtest/gtest.h>
#include <common.h>
#include <qlib/qlib.hpp>
#include <qsys/qsys.hpp>

namespace molstr {
extern bool init();
extern void fini();
}

namespace xtal {
extern bool init();
extern void fini();
}

namespace symm {
extern bool init();
extern void fini();
}

namespace surface {
extern bool init();
extern void fini();
}

class XtalEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init(CUEMOL2_SYSCONFIG_PATH);
        molstr::init();
        xtal::init();
        symm::init();
        surface::init();
    }
    void TearDown() override {
        surface::fini();
        symm::fini();
        xtal::fini();
        molstr::fini();
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new XtalEnvironment());
    return RUN_ALL_TESTS();
}
