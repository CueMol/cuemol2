#include <gtest/gtest.h>
#include <common.h>

#include <qlib/LimitedInStream.hpp>
#include <qlib/StringStream.hpp>

#include <string>

using qlib::LimitedInStream;
using qlib::StrInStream;

namespace {

// Read the stream byte-by-byte until EOF (-1). Returns the bytes read
// as a std::string so that test bodies can compare contents directly.
std::string drainByByte(qlib::InStream &ins)
{
    std::string out;
    while (true) {
        int c = ins.read();
        if (c < 0) break;
        out.push_back(static_cast<char>(c));
    }
    return out;
}

}  // namespace

// Cap larger than the source: full payload comes through and the stream
// reaches EOF naturally without the limiter interfering.
TEST(LimitedInStream, CapLargerThanSource)
{
    StrInStream src("abcdef");
    LimitedInStream lim(src, 100);
    EXPECT_EQ(drainByByte(lim), "abcdef");
    EXPECT_FALSE(lim.ready());
    EXPECT_EQ(lim.read(), -1);
}

// Cap equal to the source length: the full payload is delivered and the
// next read returns -1 (EOF). ready() turns false at the cap.
TEST(LimitedInStream, CapEqualsSource)
{
    StrInStream src("abcdef");
    LimitedInStream lim(src, 6);
    EXPECT_EQ(drainByByte(lim), "abcdef");
    EXPECT_FALSE(lim.ready());
    EXPECT_EQ(lim.read(), -1);
}

// Cap smaller than the source: only the first N bytes are delivered;
// any further read returns -1 even though the underlying source still
// has bytes available.
TEST(LimitedInStream, CapSmallerThanSource)
{
    StrInStream src("abcdefghij");
    LimitedInStream lim(src, 4);
    EXPECT_EQ(drainByByte(lim), "abcd");
    EXPECT_FALSE(lim.ready());
    EXPECT_EQ(lim.read(), -1);
}

// Block-mode read: a single read(buf, off, len) that requests more than
// the cap returns only what's left under the cap. A subsequent read
// returns 0/-1 (no more data).
TEST(LimitedInStream, BlockReadStopsAtCap)
{
    StrInStream src("0123456789ABCDEF");
    LimitedInStream lim(src, 5);

    char buf[16] = {0};
    int n = lim.read(buf, 0, 16);
    EXPECT_EQ(n, 5);
    EXPECT_EQ(std::string(buf, 5), "01234");

    char buf2[8] = {0};
    int n2 = lim.read(buf2, 0, 8);
    EXPECT_LE(n2, 0);  // EOF: implementations may return 0 or -1.
    EXPECT_FALSE(lim.ready());
}

// Cap of zero is a degenerate but well-defined case: no bytes are
// delivered, ready() is false immediately.
TEST(LimitedInStream, CapZero)
{
    StrInStream src("hello");
    LimitedInStream lim(src, 0);
    EXPECT_FALSE(lim.ready());
    EXPECT_EQ(lim.read(), -1);
}
