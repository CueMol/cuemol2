#include <gtest/gtest.h>
#include <common.h>

#include <qlib/LineStream.hpp>
#include <qlib/StringStream.hpp>

#include <chrono>
#include <string>

using qlib::LString;
using qlib::LineStream;
using qlib::StrInStream;

namespace {

std::string toStd(const LString &s)
{
    return std::string(s.c_str(), s.length());
}

}  // namespace

// A line longer than the internal 2 KB read block (and much longer than
// that) comes back whole, and the following line is intact. Together
// with the timing guard below this pins that readLine() scans only the
// newly appended bytes per block instead of rescanning the buffer.
TEST(LineStream, LongLineWithoutDelimiterIsReturnedWhole)
{
    const std::string longLine(1024 * 1024, 'a');
    const std::string payload = longLine + "\nb\n";
    StrInStream src(payload.data(), static_cast<int>(payload.size()));
    LineStream lin(src);

    ASSERT_TRUE(lin.ready());
    EXPECT_EQ(toStd(lin.readLine()), longLine + "\n");
    EXPECT_EQ(lin.getLineNo(), 1);
    ASSERT_TRUE(lin.ready());
    EXPECT_EQ(toStd(lin.readLine()), "b\n");
    EXPECT_EQ(lin.getLineNo(), 2);
    EXPECT_FALSE(lin.ready());
}

// Delimiters sitting exactly on the internal block boundary (the block
// is 2047 bytes) are still found, including an empty line that starts
// the next block.
TEST(LineStream, DelimiterAtBlockBoundary)
{
    const std::string payload = std::string(2046, 'x') + "\n" + "\n" + "y\n";
    StrInStream src(payload.data(), static_cast<int>(payload.size()));
    LineStream lin(src);

    EXPECT_EQ(toStd(lin.readLine()), std::string(2046, 'x') + "\n");
    EXPECT_EQ(toStd(lin.readLine()), "\n");
    EXPECT_EQ(toStd(lin.readLine()), "y\n");
    EXPECT_FALSE(lin.ready());
    EXPECT_EQ(lin.getLineNo(), 3);
}

// The trailing fragment without a delimiter is returned as the last
// line at EOF.
TEST(LineStream, TrailingFragmentWithoutDelimiterIsLastLine)
{
    const std::string payload = "first\nsecond";
    StrInStream src(payload.data(), static_cast<int>(payload.size()));
    LineStream lin(src);

    EXPECT_EQ(toStd(lin.readLine()), "first\n");
    EXPECT_EQ(toStd(lin.readLine()), "second");
    EXPECT_FALSE(lin.ready());
}

TEST(LineStream, CustomDelimiterStillHonoured)
{
    const std::string payload = "a;b;c";
    StrInStream src(payload.data(), static_cast<int>(payload.size()));
    LineStream lin(src);
    lin.setDelim(";");

    EXPECT_EQ(toStd(lin.readLine()), "a;");
    EXPECT_EQ(toStd(lin.readLine()), "b;");
    EXPECT_EQ(toStd(lin.readLine()), "c");
    EXPECT_FALSE(lin.ready());
}

// Coarse regression guard for the scan cost: an 8 MiB single line is a
// few milliseconds when readLine() is linear in the line length, and
// tens of seconds when every 2 KB block rescans the whole buffer. The
// bound is deliberately loose (10x+ margin) so it cannot flake on a
// slow CI box.
TEST(LineStream, EightMiBSingleLineReadsInBoundedTime)
{
    const std::string payload(8 * 1024 * 1024, 'a');
    StrInStream src(payload.data(), static_cast<int>(payload.size()));
    LineStream lin(src);

    const auto t0 = std::chrono::steady_clock::now();
    const LString line = lin.readLine();
    const auto elapsed = std::chrono::steady_clock::now() - t0;

    EXPECT_EQ(line.length(), payload.size());
    EXPECT_FALSE(lin.ready());
    EXPECT_LT(std::chrono::duration_cast<std::chrono::milliseconds>(elapsed).count(), 3000);
}
