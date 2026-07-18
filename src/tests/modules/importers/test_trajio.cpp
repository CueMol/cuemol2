// Unit tests for the MD-trajectory I/O layer (Phase 2a):
//   - FortBinInStream: Fortran unformatted record framing
//   - TrajBlock: per-frame coordinate/cell container

#include <gtest/gtest.h>
#include <common.h>

#include "mdtools/FortBinStream.hpp"
#include "mdtools/TrajBlock.hpp"
#include "mdtools/Trajectory.hpp"
#include "mdtools/DCDTrajReader.hpp"
#include "mdtools/GROFileReader.hpp"

#include "molstr/MolAtom.hpp"

#include <qlib/StringStream.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/LExceptions.hpp>

#include <cstring>
#include <string>
#include <vector>

using mdtools::FortBinInStream;
using mdtools::FortBinFormatException;
using mdtools::TrajBlock;
using mdtools::Trajectory;
using mdtools::TrajectoryPtr;
using mdtools::DCDTrajReader;
using mdtools::GROFileReader;
using molstr::MolAtomPtr;
using qlib::StrInStream;
using qlib::Vector4D;

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

// ---- Trajectory + DCDTrajReader (GRO topology + synthetic DCD) ----

namespace {

// 3-atom water topology (coords in nm; scaled to Angstrom on load).
const char *const kWaterGRO =
    "water\n"
    "    3\n"
    "    1SOL     OW    1   0.100   0.200   0.300\n"
    "    1SOL    HW1    2   0.110   0.200   0.300\n"
    "    1SOL    HW2    3   0.100   0.210   0.300\n"
    "   2.00000   2.00000   2.00000\n";

// Deterministic per (frame, atom, axis) DCD coordinate (Angstrom).
float dcdCoord(int frame, int atom, int axis)
{
    return static_cast<float>(frame) * 10.0f + static_cast<float>(atom) +
           0.1f * static_cast<float>(axis + 1);
}

// Build a minimal DCD byte stream (no unit cell) with the given atom/frame
// count, using dcdCoord() for the coordinates.
std::string buildDCD(int natom, int nframes)
{
    std::string buf;

    // 84-byte CORD header (21 int32 fields): [0]="CORD", [1]=NFILE, [11]=FCELL.
    int hdr[21] = {0};
    std::memcpy(&hdr[0], "CORD", 4);
    hdr[1] = nframes;
    hdr[11] = 0;  // no unit cell
    appendRecord(buf, hdr, sizeof(hdr));

    // Title record (content ignored by the reader).
    const char title[4] = {'t', 'e', 's', 't'};
    appendRecord(buf, title, sizeof(title));

    // NATOM record.
    int na = natom;
    appendRecord(buf, &na, sizeof(int));

    // X/Y/Z record per frame.
    for (int f = 0; f < nframes; ++f) {
        std::vector<float> ax(natom);
        for (int axis = 0; axis < 3; ++axis) {
            for (int a = 0; a < natom; ++a) ax[a] = dcdCoord(f, a, axis);
            appendRecord(buf, ax.data(), natom * sizeof(float));
        }
    }
    return buf;
}

// Build a Trajectory with water topology (via GROFileReader attached to it).
TrajectoryPtr makeWaterTrajectory()
{
    TrajectoryPtr pTraj(MB_NEW Trajectory());
    GROFileReader gro;
    gro.attach(pTraj);
    StrInStream gins(kWaterGRO, static_cast<int>(std::strlen(kWaterGRO)));
    gro.read(gins);
    gro.detach();
    pTraj->setup();
    return pTraj;
}

}  // namespace

TEST(TrajectoryTest, DcdPlaybackMapsFramesToAtoms)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();
    ASSERT_EQ(pTraj->getAtomSize(), 3);

    const int nframes = 4;
    std::string dcd = buildDCD(3, nframes);

    DCDTrajReader dcd_reader;
    dcd_reader.attach(pTraj);
    StrInStream dins(dcd.data(), static_cast<int>(dcd.size()));
    dcd_reader.read(dins);
    dcd_reader.detach();

    EXPECT_EQ(pTraj->getFrameSize(), nframes);
    EXPECT_EQ(pTraj->getBlockCount(), 1);  // small system -> single block

    for (int f = 0; f < nframes; ++f) {
        pTraj->setFrame(f);
        for (int i = 0; i < 3; ++i) {
            int aid = pTraj->getAtomIDByArrayInd(static_cast<quint32>(i));
            Vector4D pos = pTraj->getAtom(aid)->getPos();
            EXPECT_NEAR(pos.x(), dcdCoord(f, i, 0), 1e-4);
            EXPECT_NEAR(pos.y(), dcdCoord(f, i, 1), 1e-4);
            EXPECT_NEAR(pos.z(), dcdCoord(f, i, 2), 1e-4);
        }
    }
}

TEST(TrajectoryTest, DcdSplitsIntoBoundedBlocks)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();

    const int nframes = 5;
    std::string dcd = buildDCD(3, nframes);

    DCDTrajReader dcd_reader;
    // 3 atoms -> 36 bytes/frame; cap at one frame per block to force chunking.
    dcd_reader.setMaxBlockBytes(36);
    dcd_reader.attach(pTraj);
    StrInStream dins(dcd.data(), static_cast<int>(dcd.size()));
    dcd_reader.read(dins);
    dcd_reader.detach();

    EXPECT_EQ(pTraj->getFrameSize(), nframes);
    EXPECT_EQ(pTraj->getBlockCount(), nframes);  // one frame per block

    // Coordinates must still be correct across block boundaries.
    for (int f = 0; f < nframes; ++f) {
        pTraj->setFrame(f);
        int aid = pTraj->getAtomIDByArrayInd(2u);
        Vector4D pos = pTraj->getAtom(aid)->getPos();
        EXPECT_NEAR(pos.x(), dcdCoord(f, 2, 0), 1e-4);
        EXPECT_NEAR(pos.z(), dcdCoord(f, 2, 2), 1e-4);
    }
}

TEST(TrajectoryTest, DcdNatomMismatchThrows)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();  // 3 atoms

    std::string dcd = buildDCD(5, 2);  // 5 atoms != 3

    DCDTrajReader dcd_reader;
    dcd_reader.attach(pTraj);
    StrInStream dins(dcd.data(), static_cast<int>(dcd.size()));
    EXPECT_THROW(dcd_reader.read(dins), qlib::FileFormatException);
}
