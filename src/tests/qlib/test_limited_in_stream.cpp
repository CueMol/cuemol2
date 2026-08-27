#include <gtest/gtest.h>
#include <common.h>

#include <qlib/LimitedInStream.hpp>
#include <qlib/LineStream.hpp>
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

// -----------------------------------------------------------------------
// Budget accounting: limit() / consumed() / isLimitHit(). Content sniff
// relies on isLimitHit() to tell "reader stopped because the cap cut it
// off" apart from "reader stopped because the source ended".
// -----------------------------------------------------------------------

TEST(LimitedInStream, NotHitBeforeAnyRead)
{
    StrInStream src("abcdef");
    LimitedInStream lim(src, 4);
    EXPECT_EQ(lim.limit(), 4);
    EXPECT_EQ(lim.consumed(), 0);
    EXPECT_FALSE(lim.isLimitHit());
}

TEST(LimitedInStream, ConsumedTracksBytesAndStaysUnhitInsideBudget)
{
    StrInStream src("abcdef");
    LimitedInStream lim(src, 10);
    EXPECT_EQ(lim.read(), 'a');
    EXPECT_EQ(lim.read(), 'b');
    EXPECT_EQ(lim.read(), 'c');
    EXPECT_EQ(lim.consumed(), 3);
    EXPECT_FALSE(lim.isLimitHit());
}

// Draining exactly the budget counts as a hit even though the source
// ended at the same byte: the limiter cannot know whether more data
// would have followed, so callers see one (harmless) extra retry.
TEST(LimitedInStream, CapEqualsSourceCountsAsHit)
{
    StrInStream src("abcdef");
    LimitedInStream lim(src, 6);
    EXPECT_EQ(drainByByte(lim), "abcdef");
    EXPECT_EQ(lim.consumed(), 6);
    EXPECT_TRUE(lim.isLimitHit());
}

// A block read whose request exceeds the remaining budget is shortened;
// that shortening is what marks the limit as hit.
TEST(LimitedInStream, BlockReadClampedSetsHit)
{
    StrInStream src("0123456789ABCDEF");
    LimitedInStream lim(src, 5);
    char buf[16] = {0};
    EXPECT_FALSE(lim.isLimitHit());
    EXPECT_EQ(lim.read(buf, 0, 16), 5);
    EXPECT_TRUE(lim.isLimitHit());
    EXPECT_EQ(lim.consumed(), 5);
}

// The source running dry inside the budget is not a limit hit: the
// request was passed through unshortened and the source returned less.
TEST(LimitedInStream, ShortSourceReadDoesNotSetHit)
{
    StrInStream src("abcdef");
    LimitedInStream lim(src, 100);
    char buf[16] = {0};
    EXPECT_EQ(lim.read(buf, 0, 16), 6);
    EXPECT_LE(lim.read(buf, 0, 16), 0);  // source EOF
    EXPECT_FALSE(lim.ready());
    EXPECT_FALSE(lim.isLimitHit());
    EXPECT_EQ(lim.consumed(), 6);
}

// Byte-wise reads: the budget running out (not the source) is a hit,
// and a further read after exhaustion keeps it a hit.
TEST(LimitedInStream, ByteReadPastBudgetIsHit)
{
    StrInStream src("abcdefghij");
    LimitedInStream lim(src, 4);
    EXPECT_EQ(drainByByte(lim), "abcd");
    EXPECT_TRUE(lim.isLimitHit());
    EXPECT_EQ(lim.read(), -1);
    EXPECT_TRUE(lim.isLimitHit());
    EXPECT_EQ(lim.consumed(), 4);
}

TEST(LimitedInStream, CapZeroIsHitImmediately)
{
    StrInStream src("hello");
    LimitedInStream lim(src, 0);
    EXPECT_TRUE(lim.isLimitHit());
    EXPECT_EQ(lim.consumed(), 0);
}

TEST(LimitedInStream, SkipCountsTowardBudget)
{
    StrInStream src("0123456789ABCDEF");
    LimitedInStream lim(src, 5);
    EXPECT_EQ(lim.skip(3), 3);
    EXPECT_EQ(lim.consumed(), 3);
    EXPECT_FALSE(lim.isLimitHit());
    // Request beyond the remaining budget is shortened to 2 -> hit.
    EXPECT_EQ(lim.skip(10), 2);
    EXPECT_EQ(lim.consumed(), 5);
    EXPECT_TRUE(lim.isLimitHit());
}

// The pattern every text sniffer uses: LineStream over the capped
// stream, `while (lin.ready()) lin.readLine();`. When the loop exits
// because the cap ran out, isLimitHit() is true ...
TEST(LimitedInStream, LineStreamLoopOverCapReportsHit)
{
    std::string text;
    for (int i = 0; i < 200; ++i) text += "line padding padding padding padding padding padding padding\n";
    ASSERT_GT(text.size(), 3000u);
    StrInStream src(text.data(), static_cast<int>(text.size()));
    LimitedInStream lim(src, 3000);
    qlib::LineStream lin(lim);
    int nlines = 0;
    while (lin.ready()) {
        lin.readLine();
        ++nlines;
    }
    EXPECT_GT(nlines, 0);
    EXPECT_TRUE(lim.isLimitHit());
    EXPECT_EQ(lim.consumed(), 3000);
}

// ... and when it exits because the source reached EOF with budget to
// spare, isLimitHit() is false.
TEST(LimitedInStream, LineStreamLoopOverEofDoesNotReportHit)
{
    std::string text;
    for (int i = 0; i < 10; ++i) text += "short line\n";
    StrInStream src(text.data(), static_cast<int>(text.size()));
    LimitedInStream lim(src, 3000);
    qlib::LineStream lin(lim);
    int nlines = 0;
    while (lin.ready()) {
        lin.readLine();
        ++nlines;
    }
    EXPECT_EQ(nlines, 10);
    EXPECT_FALSE(lim.isLimitHit());
    EXPECT_EQ(lim.consumed(), static_cast<qlib::qint64>(text.size()));
}
