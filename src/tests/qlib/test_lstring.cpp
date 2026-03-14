#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LString.hpp"
#include <list>

using qlib::LString;
using qlib::LStringList;

TEST(LString, Constructor)
{
    LString s1;
    EXPECT_TRUE(s1.isEmpty());

    LString s2("hello");
    EXPECT_EQ(s2.length(), 5);

    std::string std_s("world");
    LString s3(std_s);
    EXPECT_TRUE(s3.equals("world"));
}

TEST(LString, LengthIsEmpty)
{
    LString s;
    EXPECT_TRUE(s.isEmpty());
    EXPECT_EQ(s.length(), 0);

    LString s2("abc");
    EXPECT_FALSE(s2.isEmpty());
    EXPECT_EQ(s2.length(), 3);
}

TEST(LString, SubstrMidLeftRight)
{
    LString s("hello world");
    EXPECT_TRUE(s.substr(6).equals("world"));
    EXPECT_TRUE(s.substr(0, 5).equals("hello"));
    EXPECT_TRUE(s.mid(6).equals("world"));
    EXPECT_TRUE(s.mid(6, 5).equals("world"));
    EXPECT_TRUE(s.left(5).equals("hello"));
    EXPECT_TRUE(s.right(5).equals("world"));
}

TEST(LString, CompareEquals)
{
    LString a("abc");
    LString b("abc");
    LString c("xyz");

    EXPECT_EQ(a.compare(b), 0);
    EXPECT_LT(a.compare(c), 0);
    EXPECT_GT(c.compare(a), 0);

    EXPECT_TRUE(a.equals(b));
    EXPECT_FALSE(a.equals(c));
    EXPECT_TRUE(a.equals("abc"));
    EXPECT_FALSE(a.equals("ABC"));
}

TEST(LString, EqualsIgnoreCase)
{
    LString a("Hello");
    EXPECT_TRUE(a.equalsIgnoreCase("hello"));
    EXPECT_TRUE(a.equalsIgnoreCase("HELLO"));
    EXPECT_FALSE(a.equalsIgnoreCase("world"));
}

TEST(LString, CaseConvert)
{
    LString s("Hello World");
    EXPECT_TRUE(s.toUpperCase().equals("HELLO WORLD"));
    EXPECT_TRUE(s.toLowerCase().equals("hello world"));
}

TEST(LString, Search)
{
    LString s("hello world");
    EXPECT_EQ(s.indexOf('o'), 4);
    EXPECT_EQ(s.lastIndexOf('o'), 7);
    EXPECT_EQ(s.indexOf(LString("world")), 6);
    EXPECT_EQ(s.lastIndexOf(LString("l")), 9);

    // indexOneOf returns the first position of any char in the set
    EXPECT_EQ(s.indexOneOf(LString("aeiou")), 1);  // 'e' at position 1

    EXPECT_TRUE(s.startsWith("hello"));
    EXPECT_FALSE(s.startsWith("world"));
    EXPECT_TRUE(s.endsWith("world"));
    EXPECT_FALSE(s.endsWith("hello"));
}

TEST(LString, NumConvert)
{
    LString si("42");
    int iv = 0;
    EXPECT_TRUE(si.toInt(&iv));
    EXPECT_EQ(iv, 42);

    LString sf("3.14");
    double dv = 0.0;
    EXPECT_TRUE(sf.toDouble(&dv));
    EXPECT_NEAR(dv, 3.14, 1e-10);

    LString bad("abc");
    EXPECT_FALSE(bad.toInt(&iv));
}

TEST(LString, Format)
{
    LString s = LString::format("x=%d, y=%.2f", 10, 3.14);
    EXPECT_TRUE(s.startsWith("x=10"));

    LString si = LString::fromInt(123);
    EXPECT_TRUE(si.equals("123"));

    LString sf = LString::fromReal(3.14, 3);
    // fromReal produces at most 3 significant digits
    EXPECT_FALSE(sf.isEmpty());
}

TEST(LString, SplitJoin)
{
    LString s("a,b,c");
    LStringList ls;
    int n = s.split(',', ls);
    EXPECT_EQ(n, 3);
    EXPECT_TRUE(ls.front().equals("a"));
    EXPECT_TRUE(ls.back().equals("c"));

    LString joined = LString::join(",", ls);
    EXPECT_TRUE(joined.equals("a,b,c"));
}

TEST(LString, TrimChomp)
{
    LString s("  hello  ");
    EXPECT_TRUE(s.trim().equals("hello"));

    LString s2("hello\n");
    EXPECT_TRUE(s2.chomp().equals("hello"));

    LString s3("hello\r\n");
    EXPECT_TRUE(s3.chomp().equals("hello"));
}

TEST(LString, Replace)
{
    LString s("hello world");
    int n = s.replace('o', 'O');
    EXPECT_EQ(n, 2);
    EXPECT_TRUE(s.equals("hellO wOrld"));
}

TEST(LString, ReplaceSubstring)
{
    LString s("foo bar foo");
    int n = s.replace(LString("foo"), LString("baz"));
    EXPECT_EQ(n, 2);
    EXPECT_TRUE(s.equals("baz bar baz"));
}

TEST(LString, OperatorAdd)
{
    LString a("hello");
    LString b(" world");
    LString c = a + b;
    EXPECT_TRUE(c.equals("hello world"));
}
