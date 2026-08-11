#include <gtest/gtest.h>
#include <common.h>
#include "qsys/MultiGradient.hpp"
#include <gfx/SolidColor.hpp>

using qsys::MultiGradient;
using qsys::MultiGradientPtr;

namespace {

gfx::ColorPtr makeColor(double r, double g, double b)
{
    return gfx::SolidColor::createRGB(r, g, b, 1.0);
}

}  // namespace

TEST(MultiGradientTest, DefaultEmpty)
{
    MultiGradient mg;
    EXPECT_EQ(mg.getSize(), 0);
}

TEST(MultiGradientTest, InsertReturnsIndex)
{
    MultiGradient mg;
    int idx = mg.insert(0.0, makeColor(1, 0, 0));
    EXPECT_EQ(idx, 0);
    idx = mg.insert(1.0, makeColor(0, 1, 0));
    EXPECT_EQ(idx, 1);
    // nodes are sorted by value, so 0.5 inserts between them
    idx = mg.insert(0.5, makeColor(0, 0, 1));
    EXPECT_EQ(idx, 1);
    EXPECT_EQ(mg.getSize(), 3);
}

TEST(MultiGradientTest, InsertDuplicateReturnsMinusOne)
{
    MultiGradient mg;
    mg.insert(0.5, makeColor(1, 0, 0));
    int idx = mg.insert(0.5, makeColor(0, 1, 0));
    EXPECT_EQ(idx, -1);
    EXPECT_EQ(mg.getSize(), 1);
}

TEST(MultiGradientTest, GetValueAt)
{
    MultiGradient mg;
    mg.insert(0.2, makeColor(1, 0, 0));
    mg.insert(0.8, makeColor(0, 1, 0));
    EXPECT_DOUBLE_EQ(mg.getValueAt(0), 0.2);
    EXPECT_DOUBLE_EQ(mg.getValueAt(1), 0.8);
}

TEST(MultiGradientTest, GetColorAt)
{
    MultiGradient mg;
    auto red = makeColor(1, 0, 0);
    mg.insert(0.0, red);
    gfx::ColorPtr got = mg.getColorAt(0);
    EXPECT_EQ(got->r(), red->r());
    EXPECT_EQ(got->g(), red->g());
    EXPECT_EQ(got->b(), red->b());
}

TEST(MultiGradientTest, RemoveAt)
{
    MultiGradient mg;
    mg.insert(0.0, makeColor(1, 0, 0));
    mg.insert(1.0, makeColor(0, 1, 0));
    EXPECT_TRUE(mg.removeAt(0));
    EXPECT_EQ(mg.getSize(), 1);
    EXPECT_DOUBLE_EQ(mg.getValueAt(0), 1.0);
}

TEST(MultiGradientTest, RemoveAtOutOfRange)
{
    MultiGradient mg;
    mg.insert(0.0, makeColor(1, 0, 0));
    EXPECT_FALSE(mg.removeAt(5));
    EXPECT_EQ(mg.getSize(), 1);
}

TEST(MultiGradientTest, Clear)
{
    MultiGradient mg;
    mg.insert(0.0, makeColor(1, 0, 0));
    mg.insert(1.0, makeColor(0, 1, 0));
    mg.clear();
    EXPECT_EQ(mg.getSize(), 0);
}

TEST(MultiGradientTest, GetColorEmptyReturnsBlack)
{
    MultiGradient mg;
    gfx::ColorPtr col = mg.getColor(0.5);
    ASSERT_FALSE(col.isnull());
    // empty gradient → black (0,0,0)
    EXPECT_EQ(col->r(), 0);
    EXPECT_EQ(col->g(), 0);
    EXPECT_EQ(col->b(), 0);
}

TEST(MultiGradientTest, GetColorSingleNodeAlwaysReturnsIt)
{
    MultiGradient mg;
    mg.insert(0.5, makeColor(1, 0, 0));
    // below, at, and above the single node all return that node's color
    gfx::ColorPtr c1 = mg.getColor(0.0);
    gfx::ColorPtr c2 = mg.getColor(0.5);
    gfx::ColorPtr c3 = mg.getColor(1.0);
    EXPECT_EQ(c1->r(), 255);
    EXPECT_EQ(c2->r(), 255);
    EXPECT_EQ(c3->r(), 255);
}

TEST(MultiGradientTest, GetColorBelowLowerBound)
{
    MultiGradient mg;
    mg.insert(0.3, makeColor(1, 0, 0));
    mg.insert(0.7, makeColor(0, 1, 0));
    // rho < first node → returns first node color
    gfx::ColorPtr col = mg.getColor(0.0);
    EXPECT_EQ(col->r(), 255);
    EXPECT_EQ(col->g(), 0);
}

TEST(MultiGradientTest, GetColorAboveUpperBound)
{
    MultiGradient mg;
    mg.insert(0.3, makeColor(1, 0, 0));
    mg.insert(0.7, makeColor(0, 1, 0));
    // rho >= last node → returns last node color
    gfx::ColorPtr col = mg.getColor(1.0);
    EXPECT_EQ(col->r(), 0);
    EXPECT_EQ(col->g(), 255);
}

TEST(MultiGradientTest, CreateDefaultS)
{
    MultiGradientPtr pMg = MultiGradient::createDefaultS();
    ASSERT_FALSE(pMg.isnull());
    EXPECT_EQ(pMg->getSize(), 1);
    EXPECT_DOUBLE_EQ(pMg->getValueAt(0), 0.0);
}

// ---- getNodesJSON / setNodesJSON ----

TEST(MultiGradientJSONTest, GetNodesJSONEmpty)
{
    MultiGradient mg;
    EXPECT_EQ(mg.getNodesJSON(), qlib::LString("[]"));
}

TEST(MultiGradientJSONTest, RoundTrip)
{
    MultiGradient src;
    src.insert(0.0, makeColor(1, 0, 0));
    src.insert(0.5, makeColor(0, 1, 0));
    src.insert(1.25, makeColor(0, 0, 1));

    qlib::LString json = src.getNodesJSON();

    MultiGradient dst;
    dst.setNodesJSON(json);

    ASSERT_EQ(dst.getSize(), 3);
    // sorted order and values preserved
    EXPECT_DOUBLE_EQ(dst.getValueAt(0), 0.0);
    EXPECT_DOUBLE_EQ(dst.getValueAt(1), 0.5);
    EXPECT_DOUBLE_EQ(dst.getValueAt(2), 1.25);
    // colors preserved
    EXPECT_EQ(dst.getColorAt(0)->r(), 255);
    EXPECT_EQ(dst.getColorAt(0)->g(), 0);
    EXPECT_EQ(dst.getColorAt(1)->g(), 255);
    EXPECT_EQ(dst.getColorAt(2)->b(), 255);
}

TEST(MultiGradientJSONTest, SetNodesJSONSortsAndSkipsDuplicates)
{
    MultiGradient mg;
    mg.setNodesJSON(
        "[{\"value\":1.0,\"color\":\"#0000FF\"},"
        "{\"value\":0.0,\"color\":\"#FF0000\"},"
        "{\"value\":1.0,\"color\":\"#00FF00\"}]");

    // duplicate value 1.0 is skipped; nodes are sorted by value
    ASSERT_EQ(mg.getSize(), 2);
    EXPECT_DOUBLE_EQ(mg.getValueAt(0), 0.0);
    EXPECT_DOUBLE_EQ(mg.getValueAt(1), 1.0);
    EXPECT_EQ(mg.getColorAt(0)->r(), 255);
    EXPECT_EQ(mg.getColorAt(1)->b(), 255);
}

TEST(MultiGradientJSONTest, SetNodesJSONEmptyArrayClears)
{
    MultiGradient mg;
    mg.insert(0.0, makeColor(1, 0, 0));
    mg.insert(1.0, makeColor(0, 1, 0));
    mg.setNodesJSON("[]");
    EXPECT_EQ(mg.getSize(), 0);
}

TEST(MultiGradientJSONTest, SetNodesJSONInvalidJSONThrows)
{
    MultiGradient mg;
    mg.insert(0.0, makeColor(1, 0, 0));
    EXPECT_THROW(mg.setNodesJSON("not a json"), qlib::RuntimeException);
    // original data is untouched on error
    EXPECT_EQ(mg.getSize(), 1);
}

TEST(MultiGradientJSONTest, SetNodesJSONInvalidColorThrows)
{
    MultiGradient mg;
    EXPECT_THROW(
        mg.setNodesJSON("[{\"value\":0.0,\"color\":\"#zzz***\"}]"),
        qlib::RuntimeException);
    EXPECT_EQ(mg.getSize(), 0);
}

TEST(MultiGradientJSONTest, SetNodesJSONMissingFieldThrows)
{
    MultiGradient mg;
    EXPECT_THROW(mg.setNodesJSON("[{\"value\":0.0}]"), qlib::RuntimeException);
    EXPECT_THROW(mg.setNodesJSON("[{\"color\":\"#FF0000\"}]"),
                 qlib::RuntimeException);
}

TEST(MultiGradientJSONTest, NamedColorRoundTrip)
{
    MultiGradient mg;
    mg.setNodesJSON("[{\"value\":0.5,\"color\":\"red\"}]");
    ASSERT_EQ(mg.getSize(), 1);

    // named color is kept as a symbolic name in the color field
    qlib::LString json = mg.getNodesJSON();
    EXPECT_TRUE(json.indexOf("\"color\":\"red\"") >= 0);

    MultiGradient mg2;
    mg2.setNodesJSON(json);
    ASSERT_EQ(mg2.getSize(), 1);
    EXPECT_DOUBLE_EQ(mg2.getValueAt(0), 0.5);
}
