#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LString.hpp"
#include "qlib/LScrRangeSet.hpp"
#include "qlib/Matrix3D.hpp"
#include "qlib/Vector4D.hpp"
#include "qlib/LUnicode.hpp"

#include <cmath>

using qlib::LString;
using qlib::LScrRangeSet;
using qlib::Matrix3D;
using qlib::Vector4D;

// remove() only dropped an element that the removed range strictly
// included or equalled; a range sharing one end left it in place.
TEST(RangeSetRemove, RangeSharingAnEndRemovesTheElement)
{
    LScrRangeSet rs = LScrRangeSet().scr_appendInt(5, 10);
    EXPECT_TRUE(rs.scr_removeInt(0, 10).isEmpty());
    EXPECT_TRUE(rs.scr_removeInt(5, 12).isEmpty());
    EXPECT_TRUE(rs.scr_removeInt(5, 10).isEmpty());
    EXPECT_TRUE(rs.scr_removeInt(0, 12).isEmpty());
    // partial overlaps still trim
    EXPECT_TRUE(rs.scr_removeInt(0, 7).toString().equals("7:9"));
    EXPECT_TRUE(rs.scr_removeInt(8, 12).toString().equals("5:7"));
}

// replace() did not advance past the replacement, so a replacement that
// contains the pattern looped forever.
TEST(LStringReplace, ReplacementContainingThePatternTerminates)
{
    LString s("banana");
    EXPECT_EQ(s.replace("a", "aa"), 3);
    EXPECT_TRUE(s.equals("baanaanaa"));

    LString t("abc");
    EXPECT_EQ(t.replace("", "x"), 0);
    EXPECT_TRUE(t.equals("abc"));

    LString u("a.b.c");
    EXPECT_EQ(u.replace(".", ""), 2);
    EXPECT_TRUE(u.equals("abc"));
}

// fromReal(v, 0) has no decimal point, yet the trailing-zero trimming
// turned "100" into "1".
TEST(LStringFromReal, ZeroDigitsKeepsIntegerZeros)
{
    EXPECT_TRUE(LString::fromReal(100.0, 0).equals("100"));
    EXPECT_TRUE(LString::fromReal(1.5, 3).equals("1.5"));
    EXPECT_TRUE(LString::fromReal(2.0, 3).equals("2"));
}

// diag_helper() computed 0/0 for a zero off-diagonal element with equal
// diagonals, so diagonalizing (even) the identity gave NaN.
TEST(Matrix3DDiag, IdentityDiagonalizesToFiniteEigenvalues)
{
    Matrix3D ident;  // identity by default
    // a tiny off-diagonal element with equal diagonals takes the isNear8()
    // branch: t = a_pq / (a_qq - a_pp) = 1e-10 / 0
    ident.aij(1, 2) = 1e-10;
    ident.aij(2, 1) = 1e-10;
    Matrix3D evecs;
    Vector4D evals;
    ASSERT_TRUE(ident.diag(evecs, evals));
    EXPECT_TRUE(std::isfinite(evals.x()));
    EXPECT_TRUE(std::isfinite(evals.y()));
    EXPECT_TRUE(std::isfinite(evals.z()));
    EXPECT_NEAR(evals.x(), 1.0, 1e-9);
    EXPECT_NEAR(evals.y(), 1.0, 1e-9);
    EXPECT_NEAR(evals.z(), 1.0, 1e-9);
}

// 0x7F still fits one byte and 0x7FF two; the boundaries produced overlong
// encodings.
TEST(LUnicode, UCS16toUTF8BoundariesAreNotOverlong)
{
    const U16Char in[3] = {0x7F, 0x7FF, 0x800};
    LString out;
    qlib::UCS16toUTF8(in, 3, out);
    ASSERT_EQ(out.length(), 1 + 2 + 3);
    EXPECT_EQ((unsigned char)out.getAt(0), 0x7Fu);
    EXPECT_EQ((unsigned char)out.getAt(1), 0xDFu);
    EXPECT_EQ((unsigned char)out.getAt(2), 0xBFu);
    EXPECT_EQ((unsigned char)out.getAt(3), 0xE0u);
}
