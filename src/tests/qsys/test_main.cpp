#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include "qsys/qsys.hpp"
#include "qsys/style/StyleMgr.hpp"
#include "qsys/RendererFactory.hpp"
#include "qsys/RendGroup.hpp"
#include "qsys/StreamManager.hpp"
#include "qsys/SceneXMLReader.hpp"
#include "qsys/SceneXMLWriter.hpp"

// Initialize qlib and qsys scripting infrastructure for all tests.
// qsys::init("") registers all classes but skips config loading (returns false).
// The additional inits below set up singletons that qsys::init("") skips due
// to the early return when config path is empty.
class QsysEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        qsys::init("");

        // StyleMgr is required by Scene constructor
        qsys::StyleMgr::init();

        // RendererFactory is required for renderer creation
        qsys::RendererFactory::init();
        qsys::RendererFactory::getInstance()->regist<qsys::RendGroup>();

        // Register scene stream handlers
        qsys::StreamManager::getInstance()->registReader<qsys::SceneXMLReader>();
        qsys::StreamManager::getInstance()->registReader<qsys::SceneXMLWriter>();
    }
    void TearDown() override {
        qsys::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new QsysEnvironment());
    return RUN_ALL_TESTS();
}
