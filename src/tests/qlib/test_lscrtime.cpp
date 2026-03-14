#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LScrTime.hpp"

using qlib::LScrTime;
using qlib::LString;

TEST(LScrTime, DefaultIsZero)
{
    LScrTime t;
    EXPECT_NEAR(t.getMilliSecReal(), 0.0, 1e-10);
    EXPECT_NEAR(t.getSecReal(), 0.0, 1e-10);
    EXPECT_TRUE(t.toString().equals("0"));
}

TEST(LScrTime, SetGetMilliSec)
{
    LScrTime t;
    t.setMilliSecReal(5000.0);
    EXPECT_NEAR(t.getMilliSecReal(), 5000.0, 1e-6);
    EXPECT_NEAR(t.getSecReal(), 5.0, 1e-9);
}

TEST(LScrTime, SetGetSec)
{
    LScrTime t;
    t.setSecReal(123.456);
    EXPECT_NEAR(t.getSecReal(), 123.456, 1e-6);
    EXPECT_NEAR(t.getMilliSecReal(), 123456.0, 1e-3);
}

TEST(LScrTime, ToStringSeconds)
{
    LScrTime t;
    t.setSecReal(123.0);
    // 123 seconds = 2 minutes 3 seconds -> "2:3"
    EXPECT_TRUE(t.toString().equals("2:3"));
}

TEST(LScrTime, ToStringZero)
{
    LScrTime t;
    EXPECT_TRUE(t.toString().equals("0"));
}

TEST(LScrTime, ToStringMilliseconds)
{
    LScrTime t;
    t.setMilliSecReal(123.0);
    EXPECT_TRUE(t.toString().equals("0.123"));
}

TEST(LScrTime, ToStringHoursMinutesSec)
{
    LScrTime t;
    // 3661 seconds = 1 hour, 1 minute, 1 second
    t.setSecReal(3661.0);
    EXPECT_TRUE(t.toString().equals("1:1:1"));
}

TEST(LScrTime, FromStringSeconds)
{
    LScrTime t;
    t.setStrValue("2:3");
    // 2 min 3 sec = 123 sec
    EXPECT_NEAR(t.getSecReal(), 123.0, 1e-6);
}

TEST(LScrTime, FromStringMilliseconds)
{
    LScrTime t;
    t.setStrValue("0.123");
    EXPECT_NEAR(t.getMilliSecReal(), 123.0, 1e-6);
}

TEST(LScrTime, FromStringHMS)
{
    LScrTime t;
    t.setStrValue("34:17:36.789");
    // 34*3600 + 17*60 + 36 = 123456 seconds, + 789 ms
    EXPECT_NEAR(t.getMilliSecReal(), 123456789.0, 1.0);
}

TEST(LScrTime, ComponentExtract)
{
    LScrTime t;
    t.setStrValue("34:17:36.789");

    EXPECT_EQ(t.getHour(), 34);
    EXPECT_EQ(t.getMinute(true), 17);
    EXPECT_EQ(t.getSecond(true), 36);
    EXPECT_EQ(t.getMilliSec(true), 789);
}

TEST(LScrTime, ComponentExtractTotal)
{
    LScrTime t;
    t.setStrValue("34:17:36.789");
    // total minutes = 34*60 + 17 = 2057
    EXPECT_EQ(t.getMinute(false), 2057);
    // total seconds = 123456
    EXPECT_EQ(t.getSecond(false), 123456);
    // total milliseconds = 123456789
    EXPECT_EQ(t.getMilliSec(false), 123456789);
}

TEST(LScrTime, ComponentExtractZero)
{
    LScrTime t;
    EXPECT_EQ(t.getHour(), 0);
    EXPECT_EQ(t.getMinute(true), 0);
    EXPECT_EQ(t.getSecond(true), 0);
    EXPECT_EQ(t.getMilliSec(true), 0);
}

TEST(LScrTime, Equals)
{
    LScrTime t1, t2;
    t1.setSecReal(123.456);
    t2.setMilliSecReal(123456.0);
    EXPECT_TRUE(t1.equals(t2));

    LScrTime t3;
    t3.setMilliSecReal(1001.0);
    EXPECT_FALSE(t1.equals(t3));
}

TEST(LScrTime, EqualsBothZero)
{
    LScrTime t1, t2;
    EXPECT_TRUE(t1.equals(t2));
}

TEST(LScrTime, FromStringInvalidThrows)
{
    LScrTime t;
    EXPECT_THROW(t.setStrValue("1:2:3:4"), qlib::TimeFormatException);
    EXPECT_THROW(t.setStrValue("1.2.3"), qlib::TimeFormatException);
}

TEST(LScrTime, RoundTrip)
{
    LScrTime t1;
    t1.setStrValue("1:1:1.500");
    LString s = t1.toString();
    LScrTime t2;
    t2.setStrValue(s);
    EXPECT_TRUE(t1.equals(t2));
}
