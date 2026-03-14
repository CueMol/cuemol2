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

namespace importers {
extern bool init();
extern void fini();
}

class ImportersEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init(CUEMOL2_SYSCONFIG_PATH);
        molstr::init();
        molvis::init();
        xtal::init();
        symm::init();
        surface::init();
        importers::init();
    }
    void TearDown() override {
        importers::fini();
        surface::fini();
        symm::fini();
        xtal::fini();
        molvis::fini();
        molstr::fini();
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new ImportersEnvironment());
    return RUN_ALL_TESTS();
}
