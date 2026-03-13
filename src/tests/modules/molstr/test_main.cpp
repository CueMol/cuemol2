#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include "qsys/qsys.hpp"
#include "qsys/style/StyleMgr.hpp"
#include "qsys/RendererFactory.hpp"
#include "qsys/StreamManager.hpp"
#include "molstr/ElemSym.hpp"
#include "molstr/SelCompiler.hpp"

class MolstrEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init("");
        qsys::StyleMgr::init();
        qsys::RendererFactory::init();
        molstr::ElemSym::init();
        molstr::SelCompiler::init();
    }
    void TearDown() override {
        molstr::SelCompiler::fini();
        molstr::ElemSym::fini();
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new MolstrEnvironment());
    return RUN_ALL_TESTS();
}
