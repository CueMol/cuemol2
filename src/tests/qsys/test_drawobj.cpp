#include <gtest/gtest.h>
#include <common.h>
#include "qsys/DrawObj.hpp"

namespace {

class ConcreteDrawObj : public qsys::DrawObj {
public:
    void display(gfx::DisplayContext *, qsys::ViewPtr) override {}
    void display2D(gfx::DisplayContext *, qsys::ViewPtr) override {}
};

}  // namespace

TEST(DrawObjTest, DefaultDisabled)
{
    ConcreteDrawObj obj;
    EXPECT_FALSE(obj.isEnabled());
}

TEST(DrawObjTest, SetEnabled)
{
    ConcreteDrawObj obj;
    obj.setEnabled(true);
    EXPECT_TRUE(obj.isEnabled());
}

TEST(DrawObjTest, SetDisabled)
{
    ConcreteDrawObj obj;
    obj.setEnabled(true);
    obj.setEnabled(false);
    EXPECT_FALSE(obj.isEnabled());
}
