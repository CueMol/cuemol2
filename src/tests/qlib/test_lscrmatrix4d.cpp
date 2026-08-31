#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LScrMatrix4D.hpp"
#include "qlib/LExceptions.hpp"

using qlib::LScrMatrix4D;
using qlib::LString;
using qlib::Matrix4D;

// Build a string representation of 16 comma-separated values wrapped in parentheses
static LString makeMatrixString(const double vals[16])
{
    LString s("(");
    for (int i = 0; i < 16; ++i) {
        s += LString::format("%.7f", vals[i]);
        if (i < 15) s += ",";
    }
    s += ")";
    return s;
}

TEST(LScrMatrix4D, ToStringIdentity)
{
    LScrMatrix4D m;
    EXPECT_TRUE(m.toString().equalsIgnoreCase("(identity)"));
}

TEST(LScrMatrix4D, FromStringIdentity)
{
    LScrMatrix4D *pM = LScrMatrix4D::fromStringS("(identity)");
    ASSERT_NE(pM, nullptr);
    EXPECT_TRUE(pM->isIdent());
    delete pM;
}

TEST(LScrMatrix4D, FromStringIdentityCaseInsensitive)
{
    LScrMatrix4D *pM = LScrMatrix4D::fromStringS("(IDENTITY)");
    ASSERT_NE(pM, nullptr);
    EXPECT_TRUE(pM->isIdent());
    delete pM;
}

TEST(LScrMatrix4D, ToStringFromStringRoundTrip)
{
    // Build a non-identity matrix
    LScrMatrix4D orig;
    orig.setAt(1, 1, 2.0);
    orig.setAt(1, 2, 3.0);
    orig.setAt(2, 3, 5.0);
    orig.setAt(3, 4, 7.0);

    LString s = orig.toString();
    // Must start/end with parentheses and not be "(identity)"
    EXPECT_EQ(s.c_str()[0], '(');

    LScrMatrix4D *pM = LScrMatrix4D::fromStringS(s);
    ASSERT_NE(pM, nullptr);
    EXPECT_TRUE(pM->equals(orig));
    delete pM;
}

TEST(LScrMatrix4D, FromStringAllValues)
{
    // Write 16 known values and parse them back
    double vals[16];
    for (int i = 0; i < 16; ++i) vals[i] = static_cast<double>(i + 1) * 0.5;

    LString s = makeMatrixString(vals);
    LScrMatrix4D *pM = LScrMatrix4D::fromStringS(s);
    ASSERT_NE(pM, nullptr);
    for (int i = 1; i <= 16; ++i) {
        EXPECT_NEAR(pM->ai(i), vals[i - 1], 1e-6);
    }
    delete pM;
}

TEST(LScrMatrix4D, FromStringTooFewElements)
{
    // Only 15 elements — should throw
    LString s("(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15)");
    EXPECT_THROW(LScrMatrix4D::fromStringS(s), qlib::RuntimeException);
}

TEST(LScrMatrix4D, FromStringNonNumericElement)
{
    // One element is not a number — should throw
    LString s("(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,abc)");
    EXPECT_THROW(LScrMatrix4D::fromStringS(s), qlib::RuntimeException);
}

TEST(LScrMatrix4D, FromStringMissingParentheses)
{
    // No parentheses — should throw
    LString s("1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16");
    EXPECT_THROW(LScrMatrix4D::fromStringS(s), qlib::RuntimeException);
}

// setAt/getAt/addAt are script-visible with 1-based row/column indices;
// the check used to accept anything up to 16 and wrote past the array.
TEST(LScrMatrix4D, IndicesAboveFourAreRejected)
{
    LScrMatrix4D m;
    m.setAt(4, 4, 2.5);
    EXPECT_DOUBLE_EQ(m.getAt(4, 4), 2.5);

    EXPECT_THROW(m.setAt(5, 1, 1.0), qlib::IndexOutOfBoundsException);
    EXPECT_THROW(m.setAt(16, 16, 1.0), qlib::IndexOutOfBoundsException);
    EXPECT_THROW(m.getAt(1, 5), qlib::IndexOutOfBoundsException);
    EXPECT_THROW(m.addAt(0, 1, 1.0), qlib::IndexOutOfBoundsException);
}
