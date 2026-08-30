#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LRegExpr.hpp"

using qlib::LRegExpr;
using qlib::LString;

TEST(LRegExpr, SetGetPattern)
{
    LRegExpr re;
    re.setPattern("(\\d+)");
    EXPECT_TRUE(re.getPattern().equals("(\\d+)"));
    EXPECT_TRUE(re.toString().equals("(\\d+)"));
}

TEST(LRegExpr, EmptyPattern)
{
    LRegExpr re;
    EXPECT_TRUE(re.toString().equals(""));
}

TEST(LRegExpr, BasicMatch)
{
    LRegExpr re;
    re.setPattern("(\\d+)");
    EXPECT_TRUE(re.match("123 45"));
}

TEST(LRegExpr, NoMatch)
{
    LRegExpr re;
    re.setPattern("(\\d+)");
    EXPECT_FALSE(re.match("abc def"));
}

TEST(LRegExpr, CaptureGroups)
{
    LRegExpr re;
    re.setPattern("(\\d+)");
    EXPECT_TRUE(re.match("123 45"));
    // index 0 = full match, index 1 = first group
    EXPECT_EQ(re.getSubstrCount(), 2);
    EXPECT_TRUE(re.getSubstr(0).equals("123"));
    EXPECT_TRUE(re.getSubstr(1).equals("123"));
}

TEST(LRegExpr, MultipleCaptureGroups)
{
    LRegExpr re;
    re.setPattern("(\\d+)\\s+(\\w+)");
    EXPECT_TRUE(re.match("123 abc"));
    EXPECT_EQ(re.getSubstrCount(), 3);
    EXPECT_TRUE(re.getSubstr(0).equals("123 abc"));
    EXPECT_TRUE(re.getSubstr(1).equals("123"));
    EXPECT_TRUE(re.getSubstr(2).equals("abc"));
}

TEST(LRegExpr, MatchIgnoreCase)
{
    LRegExpr re;
    re.setPattern("hello");
    EXPECT_FALSE(re.match("HELLO world"));
    EXPECT_TRUE(re.matchIgnoreCase("HELLO world"));
}

TEST(LRegExpr, InvalidPattern)
{
    // setPattern() stores lazily; compilation (and exception) happens on match()
    LRegExpr re;
    re.setPattern("(unclosed");
    EXPECT_THROW(re.match("hello"), qlib::InvalidREPatternException);
}

TEST(LRegExpr, PatternUpdate)
{
    LRegExpr re;
    re.setPattern("(\\d+)");
    EXPECT_TRUE(re.match("123"));

    re.setPattern("[a-z]+");
    EXPECT_TRUE(re.getPattern().equals("[a-z]+"));
    EXPECT_TRUE(re.match("abc"));
    EXPECT_FALSE(re.match("123"));
}

TEST(LRegExpr, ComplexPattern)
{
    // Simple email-like pattern
    LRegExpr re;
    re.setPattern("\\w+@\\w+\\.\\w+");
    EXPECT_TRUE(re.match("user@example.com"));
    EXPECT_FALSE(re.match("not-an-email"));
}

TEST(LRegExpr, NamedCapture)
{
    LRegExpr re;
    re.setPattern("(?P<year>\\d{4})-(?P<month>\\d{2})-(?P<day>\\d{2})");
    EXPECT_TRUE(re.match("2024-03-15"));
    EXPECT_TRUE(re.getNamedSubstr("year").equals("2024"));
    EXPECT_TRUE(re.getNamedSubstr("month").equals("03"));
    EXPECT_TRUE(re.getNamedSubstr("day").equals("15"));
}

// pcre reports a group that did not take part in the match with offset -1;
// substr(size_t(-1)) used to throw std::out_of_range past the LException
// handlers.
TEST(LRegExpr, UnmatchedOptionalGroupGivesEmptyString)
{
    LRegExpr re;
    re.setPattern("(a)?(b)");
    ASSERT_TRUE(re.match("b"));
    EXPECT_TRUE(re.getSubstr(0).equals("b"));
    EXPECT_TRUE(re.getSubstr(1).isEmpty());
    EXPECT_TRUE(re.getSubstr(2).equals("b"));

    ASSERT_TRUE(re.match("ab"));
    EXPECT_TRUE(re.getSubstr(1).equals("a"));
}
