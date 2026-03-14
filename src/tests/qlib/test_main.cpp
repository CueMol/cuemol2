#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"

// Initialize qlib for all tests in this binary.
class QlibEnvironment : public ::testing::Environment {
public:
    void SetUp() override { qlib::init(); }
    void TearDown() override { qlib::fini(); }
};

int main(int argc, char **argv)
{
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new QlibEnvironment());
    return RUN_ALL_TESTS();
}
