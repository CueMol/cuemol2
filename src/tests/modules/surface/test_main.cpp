#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include "qsys/qsys.hpp"
#include "qsys/style/StyleMgr.hpp"
#include "qsys/RendererFactory.hpp"
#include "molstr/molstr.hpp"
#include "surface/surface.hpp"
#include "symm/symm.hpp"

#ifndef CUEMOL2_SYSCONFIG_PATH
#define CUEMOL2_SYSCONFIG_PATH ""
#endif

class SurfaceEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init(CUEMOL2_SYSCONFIG_PATH);
        qsys::StyleMgr::init();
        qsys::RendererFactory::init();
        molstr::init();
        surface::init();
        symm::init();
    }
    void TearDown() override {
        symm::fini();
        surface::fini();
        molstr::fini();
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new SurfaceEnvironment());
    return RUN_ALL_TESTS();
}
