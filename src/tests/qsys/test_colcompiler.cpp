#include <gtest/gtest.h>
#include <common.h>
#include <memory>
#include "gfx/AbstractColor.hpp"
#include "gfx/ColCompiler.hpp"

using gfx::AbstractColor;
using gfx::ColCompiler;

// Modifiers collected while parsing a color that then fails to compile
// must not leak into the next color compiled by the singleton. Named
// colors are used because only they carry a writable material property;
// the qsys environment provides the named-color resolver (StyleMgr).
TEST(ColCompiler, FailedCompileDoesNotLeakModifiersIntoNextColor)
{
    std::unique_ptr<AbstractColor> pBad(ColCompiler::compileS("red{material:foo;alpha"));
    EXPECT_EQ(pBad.get(), nullptr);

    std::unique_ptr<AbstractColor> pBlue(ColCompiler::compileS("blue"));
    ASSERT_NE(pBlue.get(), nullptr);
    EXPECT_STREQ(pBlue->getMaterial().c_str(), "");

    std::unique_ptr<AbstractColor> pMod(ColCompiler::compileS("blue{material:foo}"));
    ASSERT_NE(pMod.get(), nullptr);
    EXPECT_STREQ(pMod->getMaterial().c_str(), "foo");
}
