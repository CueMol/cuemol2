// Unit tests for the MD-trajectory I/O layer (Phase 2a):
//   - FortBinInStream: Fortran unformatted record framing
//   - TrajBlock: per-frame coordinate/cell container

#include <gtest/gtest.h>
#include <common.h>

#include "mdtools/FortBinStream.hpp"
#include "mdtools/TrajBlock.hpp"

#include <qlib/StringStream.hpp>

#include <string>

using mdtools::FortBinInStream;
using mdtools::FortBinFormatException;
using mdtools::TrajBlock;
using qlib::StrInStream;

namespace {

// Append a Fortran unformatted record: [int32 len][payload][int32 len]
// in native byte order (matching what FortBinInStream reads).
void appendRecord(std::string &buf, const void *data, int len)
{
    buf.append(reinterpret_cast<const char *>(&len), sizeof(int));
    buf.append(reinterpret_cast<const char *>(data), len);
    buf.append(reinterpret_cast<const char *>(&len), sizeof(int));
}

// Same but with a deliberately wrong trailing marker.
void appendBadTailRecord(std::string &buf, const void *data, int len, int badtail)
{
    buf.append(reinterpret_cast<const char *>(&len), sizeof(int));
    buf.append(reinterpret_cast<const char *>(data), len);
    buf.append(reinterpret_cast<const char *>(&badtail), sizeof(int));
}

}  // namespace

// ---- FortBinInStream ----

TEST(FortBinStreamTest, ReadWholeRecord)
{
    const float payload[3] = {1.5f, -2.0f, 3.25f};
    std::string buf;
    appendRecord(buf, payload, sizeof(payload));

    StrInStream ins(buf.data(), static_cast<int>(buf.size()));
    FortBinInStream fbs(ins);

    EXPECT_EQ(fbs.getRecordSize(), static_cast<int>(sizeof(payload)));
    float out[3] = {0, 0, 0};
    int n = fbs.readRecord(out, sizeof(out));
    EXPECT_EQ(n, static_cast<int>(sizeof(payload)));
    EXPECT_FLOAT_EQ(out[0], 1.5f);
    EXPECT_FLOAT_EQ(out[1], -2.0f);
    EXPECT_FLOAT_EQ(out[2], 3.25f);
}

TEST(FortBinStreamTest, ReadTwoRecordsInSequence)
{
    const int a[2] = {10, 20};
    const int b[3] = {30, 40, 50};
    std::string buf;
    appendRecord(buf, a, sizeof(a));
    appendRecord(buf, b, sizeof(b));

    StrInStream ins(buf.data(), static_cast<int>(buf.size()));
    FortBinInStream fbs(ins);

    EXPECT_EQ(fbs.getRecordSize(), 8);
    int outa[2] = {0, 0};
    fbs.readRecord(outa, sizeof(outa));
    EXPECT_EQ(outa[0], 10);
    EXPECT_EQ(outa[1], 20);

    EXPECT_EQ(fbs.getRecordSize(), 12);
    int outb[3] = {0, 0, 0};
    fbs.readRecord(outb, sizeof(outb));
    EXPECT_EQ(outb[0], 30);
    EXPECT_EQ(outb[2], 50);
}

TEST(FortBinStreamTest, NullBufSkipsRecord)
{
    const int a[2] = {10, 20};
    const int b[1] = {99};
    std::string buf;
    appendRecord(buf, a, sizeof(a));
    appendRecord(buf, b, sizeof(b));

    StrInStream ins(buf.data(), static_cast<int>(buf.size()));
    FortBinInStream fbs(ins);

    EXPECT_EQ(fbs.getRecordSize(), 8);
    fbs.readRecord(NULL, 0);  // skip

    EXPECT_EQ(fbs.getRecordSize(), 4);
    int out = 0;
    fbs.readRecord(&out, sizeof(out));
    EXPECT_EQ(out, 99);
}

TEST(FortBinStreamTest, PartialReadSkipsRemainder)
{
    const int a[3] = {10, 20, 30};
    const int b[1] = {77};
    std::string buf;
    appendRecord(buf, a, sizeof(a));
    appendRecord(buf, b, sizeof(b));

    StrInStream ins(buf.data(), static_cast<int>(buf.size()));
    FortBinInStream fbs(ins);

    EXPECT_EQ(fbs.getRecordSize(), 12);
    int first = 0;
    int n = fbs.readRecord(&first, sizeof(first));  // read only 4 of 12 bytes
    EXPECT_EQ(n, 4);
    EXPECT_EQ(first, 10);

    // the record remainder must be skipped -> next record intact
    EXPECT_EQ(fbs.getRecordSize(), 4);
    int out = 0;
    fbs.readRecord(&out, sizeof(out));
    EXPECT_EQ(out, 77);
}

TEST(FortBinStreamTest, TrailingMarkerMismatchThrows)
{
    const int a[2] = {1, 2};
    std::string buf;
    appendBadTailRecord(buf, a, sizeof(a), 999);  // tail marker != 8

    StrInStream ins(buf.data(), static_cast<int>(buf.size()));
    FortBinInStream fbs(ins);

    EXPECT_EQ(fbs.getRecordSize(), 8);
    int out[2] = {0, 0};
    EXPECT_THROW(fbs.readRecord(out, sizeof(out)), FortBinFormatException);
}

// ---- TrajBlock ----

TEST(TrajBlockTest, AllocateSetsSizes)
{
    TrajBlock tb;
    tb.allocate(4, 3);  // 4 atoms, 3 frames
    EXPECT_EQ(tb.getSize(), 3);
    EXPECT_EQ(tb.getCrdSize(), 12);  // 4 atoms * 3 coords
}

TEST(TrajBlockTest, CrdArrayIsPerFrameWritable)
{
    TrajBlock tb;
    tb.allocate(2, 2);  // 6 coords/frame
    qfloat32 *f0 = tb.getCrdArray(0);
    qfloat32 *f1 = tb.getCrdArray(1);
    for (int i = 0; i < 6; ++i) {
        f0[i] = static_cast<qfloat32>(i);
        f1[i] = static_cast<qfloat32>(i + 100);
    }
    EXPECT_FLOAT_EQ(tb.getCrdArray(0)[5], 5.0f);
    EXPECT_FLOAT_EQ(tb.getCrdArray(1)[0], 100.0f);
}

TEST(TrajBlockTest, LoadedFlagsTrackAllLoaded)
{
    TrajBlock tb;
    tb.allocate(1, 3);
    EXPECT_FALSE(tb.isLoaded(0));
    EXPECT_FALSE(tb.isAllLoaded());
    tb.setLoaded(0, true);
    tb.setLoaded(1, true);
    EXPECT_FALSE(tb.isAllLoaded());
    tb.setLoaded(2, true);
    EXPECT_TRUE(tb.isAllLoaded());
}

TEST(TrajBlockTest, CellArrayIsPerFrameWritable)
{
    TrajBlock tb;
    tb.allocate(1, 2);
    qfloat32 *c = tb.getCellArray(1);
    for (int i = 0; i < TrajBlock::CELL_SIZE; ++i)
        c[i] = static_cast<qfloat32>(i + 1);
    EXPECT_FLOAT_EQ(tb.getCellArray(1)[TrajBlock::CELL_SIZE - 1],
                    static_cast<qfloat32>(TrajBlock::CELL_SIZE));
}

TEST(TrajBlockTest, StartIndexAndTrajUIDRoundTrip)
{
    TrajBlock tb;
    tb.setStartIndex(7);
    EXPECT_EQ(tb.getStartIndex(), 7);
    tb.setTrajUID(42);
    EXPECT_EQ(tb.getTrajUID(), static_cast<qlib::uid_t>(42));
}
