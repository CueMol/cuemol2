#include <gtest/gtest.h>
#include <common.h>
#include <memory>
#include "qlib/LDOM2Tree.hpp"
#include "gfx/AbstractColor.hpp"
#include "gfx/ColCompiler.hpp"
#include "gfx/ColorTable.hpp"
#include "gfx/GradientColor.hpp"
#include "gfx/SolidColor.hpp"

using gfx::AbstractColor;
using gfx::ColCompiler;
using gfx::ColorPtr;
using gfx::ColorTable;
using gfx::GradientColor;
using gfx::SolidColor;
using qlib::LString;

// A freshly created GradientColor (createObj("GradientColor") from a
// script) has no component colors yet; reading its material property
// must not dereference them.
TEST(GradientColor, MaterialOfEmptyGradientIsEmpty)
{
    GradientColor col;
    EXPECT_STREQ(col.getMaterial().c_str(), "");
}

// A color node whose value does not compile must not be dereferenced
// while its modifier children are applied.
TEST(AbstractColor, FromNodeWithInvalidValueReturnsNull)
{
    qlib::LDom2Node node;
    node.setTagName("col");
    node.setValue("this is not a color");
    qlib::LDom2Node *pMod = new qlib::LDom2Node();
    pMod->setTagName("material");
    pMod->setValue("shiny");
    node.appendChild(pMod);

    AbstractColor *pCol = AbstractColor::fromNode(&node);
    EXPECT_EQ(pCol, nullptr);
    delete pCol;
}


// The CLUT index must not wrap when an export needs more than 32768
// distinct colors (a large molecule with a continuous gradient).
TEST(ColorTable, MoreThanShortMaxEntries)
{
    ColorTable ct;
    const int n = 40000;
    ColorTable::elem_t last;
    for (int i = 0; i < n; ++i) {
        const double r = double(i % 256) / 255.0;
        const double g = double((i / 256) % 256) / 255.0;
        const double b = double((i / 65536) % 256) / 255.0;
        last = ct.newColor(ColorPtr(MB_NEW SolidColor(r, g, b, 1.0)), LString());
    }
    ASSERT_EQ(ct.size(), n);
    EXPECT_GE(last.cid1, 32768);

    ColorPtr pCol;
    ASSERT_TRUE(ct.getColor(last, pCol));
    ASSERT_FALSE(pCol.isnull());
    EXPECT_NEAR(pCol->fr(), double((n - 1) % 256) / 255.0, 1e-6);
}
