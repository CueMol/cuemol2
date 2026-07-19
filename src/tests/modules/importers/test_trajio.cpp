// Unit tests for the MD-trajectory I/O layer (Phase 2a):
//   - FortBinInStream: Fortran unformatted record framing
//   - TrajBlock: per-frame coordinate/cell container

#include <gtest/gtest.h>
#include <common.h>

#include "mdtools/FortBinStream.hpp"
#include "mdtools/XdrInStream.hpp"
#include "mdtools/TrajBlock.hpp"
#include "mdtools/Trajectory.hpp"
#include "mdtools/DCDTrajReader.hpp"
#include "mdtools/TrrTrajReader.hpp"
#include "mdtools/XtcTrajReader.hpp"
#include "mdtools/Netcdf3InStream.hpp"
#include "mdtools/AmberNetCDFReader.hpp"
#include "mdtools/GROFileReader.hpp"

#include "qsys/SceneManager.hpp"
#include "qsys/Scene.hpp"

#include "molstr/MolAtom.hpp"

#include <qlib/StringStream.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/LExceptions.hpp>

#include <algorithm>
#include <climits>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

using mdtools::FortBinInStream;
using mdtools::FortBinFormatException;
using mdtools::XdrInStream;
using mdtools::TrajBlock;
using mdtools::Trajectory;
using mdtools::TrajectoryPtr;
using mdtools::DCDTrajReader;
using mdtools::TrrTrajReader;
using mdtools::XtcTrajReader;
using mdtools::AmberNetCDFReader;
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

// ---- big-endian (XDR) byte writers for XdrInStream tests ----

void appendBE32(std::string &buf, quint32 v)
{
    buf.push_back(static_cast<char>((v >> 24) & 0xff));
    buf.push_back(static_cast<char>((v >> 16) & 0xff));
    buf.push_back(static_cast<char>((v >> 8) & 0xff));
    buf.push_back(static_cast<char>(v & 0xff));
}

void appendBEf32(std::string &buf, float f)
{
    quint32 u;
    std::memcpy(&u, &f, 4);
    appendBE32(buf, u);
}

void appendBE64(std::string &buf, quint64 v)
{
    for (int i = 7; i >= 0; --i) buf.push_back(static_cast<char>((v >> (i * 8)) & 0xff));
}

void appendBEf64(std::string &buf, double d)
{
    quint64 u;
    std::memcpy(&u, &d, 8);
    appendBE64(buf, u);
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

// ---- XdrInStream ----

TEST(XdrInStreamTest, ReadsBigEndianScalars)
{
    std::string buf;
    appendBE32(buf, static_cast<quint32>(-123));  // i32
    appendBE32(buf, 456u);                         // u32
    appendBEf32(buf, 1.5f);                        // f32

    StrInStream ins(buf.data(), static_cast<int>(buf.size()));
    XdrInStream xdr(ins);
    EXPECT_EQ(xdr.readI32(), -123);
    EXPECT_EQ(xdr.readU32(), 456u);
    EXPECT_FLOAT_EQ(xdr.readF32(), 1.5f);
}

TEST(XdrInStreamTest, ReadGmxStringWithPadding)
{
    // GROMACS string: [i32 len-with-null][u32 count][count bytes][pad to *4].
    std::string buf;
    appendBE32(buf, 4u);  // declared length incl. null terminator
    appendBE32(buf, 3u);  // XDR opaque count
    buf.append("abc", 3);
    buf.push_back('\0');  // 1 padding byte -> total 4

    StrInStream ins(buf.data(), static_cast<int>(buf.size()));
    XdrInStream xdr(ins);
    EXPECT_TRUE(xdr.readGmxString().equals("abc"));
}

TEST(XdrInStreamTest, ReadGmxBoxOrthorhombic)
{
    // 3x3 box (nm), diagonal 2/3/4; expect a,b,c in Angstrom and 90-deg angles.
    std::string buf;
    const float box[9] = {2, 0, 0, 0, 3, 0, 0, 0, 4};
    for (int i = 0; i < 9; ++i) appendBEf32(buf, box[i]);

    StrInStream ins(buf.data(), static_cast<int>(buf.size()));
    XdrInStream xdr(ins);
    qfloat32 cell[6];
    xdr.readGmxBox(false, cell);
    EXPECT_NEAR(cell[0], 20.0f, 1e-3);
    EXPECT_NEAR(cell[1], 30.0f, 1e-3);
    EXPECT_NEAR(cell[2], 40.0f, 1e-3);
    EXPECT_NEAR(cell[3], 90.0f, 1e-3);
    EXPECT_NEAR(cell[4], 90.0f, 1e-3);
    EXPECT_NEAR(cell[5], 90.0f, 1e-3);
}

TEST(XdrInStreamTest, ReadI32optDetectsCleanEof)
{
    std::string buf;
    appendBE32(buf, 77u);

    StrInStream ins(buf.data(), static_cast<int>(buf.size()));
    XdrInStream xdr(ins);
    qint32 v = 0;
    EXPECT_TRUE(xdr.readI32opt(v));
    EXPECT_EQ(v, 77);
    EXPECT_FALSE(xdr.readI32opt(v));  // clean end of stream
}

TEST(XdrInStreamTest, ReadI32optTruncatedThrows)
{
    std::string buf("\x00\x01", 2);  // only 2 bytes of a 4-byte int

    StrInStream ins(buf.data(), static_cast<int>(buf.size()));
    XdrInStream xdr(ins);
    qint32 v = 0;
    EXPECT_THROW(xdr.readI32opt(v), qlib::EOFException);
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

TEST(TrajBlockTest, AppendFrameGrowsBlockAndKeepsPointers)
{
    TrajBlock tb;
    tb.initFrames(2);  // 2 atoms, no frames yet
    EXPECT_EQ(tb.getSize(), 0);
    EXPECT_EQ(tb.getCrdSize(), 6);

    qfloat32 *f0 = tb.appendFrame();
    for (int i = 0; i < 6; ++i) f0[i] = static_cast<qfloat32>(i);
    qfloat32 *f1 = tb.appendFrame();
    for (int i = 0; i < 6; ++i) f1[i] = static_cast<qfloat32>(i + 100);

    EXPECT_EQ(tb.getSize(), 2);
    // Per-frame coordinate arrays are stable across appends (heap-allocated).
    EXPECT_FLOAT_EQ(f0[5], 5.0f);
    EXPECT_FLOAT_EQ(tb.getCrdArray(0)[5], 5.0f);
    EXPECT_FLOAT_EQ(tb.getCrdArray(1)[0], 100.0f);

    qfloat32 *c1 = tb.getCellArray(1);
    c1[0] = 9.0f;
    EXPECT_FLOAT_EQ(tb.getCellArray(1)[0], 9.0f);
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

// Build a Trajectory whose topology has n atoms (one residue). Atom positions
// in the topology are placeholders; the trajectory frames overwrite them.
TrajectoryPtr makeTrajectoryNAtoms(int n)
{
    std::string gro = "gen\n";
    gro += qlib::LString::format("%5d\n", n).c_str();
    // Each atom in its own residue so molstr keys (resid/name) stay unique.
    for (int i = 0; i < n; ++i) {
        gro += qlib::LString::format("%5d%-5s%5s%5d%8.3f%8.3f%8.3f\n", i + 1, "GEN", "C", i + 1, 0.0,
                                     0.0, 0.0)
                   .c_str();
    }
    gro += "   5.00000   5.00000   5.00000\n";

    TrajectoryPtr pTraj(MB_NEW Trajectory());
    GROFileReader rdr;
    rdr.attach(pTraj);
    StrInStream gins(gro.data(), static_cast<int>(gro.size()));
    rdr.read(gins);
    rdr.detach();
    pTraj->setup();
    return pTraj;
}

// Load one DCD (as bytes) into a new TrajBlock and append it to pTraj, matching
// the scripted / .qsc block-centric flow: createDefaultObj -> TrajBlock, read,
// Trajectory::append. The target Trajectory is resolved from its UID.
void appendDCD(const TrajectoryPtr &pTraj, const std::string &dcd)
{
    DCDTrajReader reader;
    reader.setTargTrajUID(pTraj->getUID());
    mdtools::TrajBlockPtr pBlk(reader.createDefaultObj());
    reader.attach(pBlk);
    StrInStream dins(dcd.data(), static_cast<int>(dcd.size()));
    reader.read(dins);
    reader.detach();
    pTraj->append(pBlk);
}

// Deterministic per (frame, atom, axis) coordinate in nm (scaled x10 to
// Angstrom on load).
float trrCoordNm(int frame, int atom, int axis)
{
    return 0.1f * (static_cast<float>(frame) * 10.0f + static_cast<float>(atom) +
                   0.1f * static_cast<float>(axis + 1));
}

// Write a GROMACS string ([i32 len-with-null][u32 count][bytes][pad to *4]).
void appendGmxString(std::string &buf, const char *s)
{
    const int n = static_cast<int>(std::strlen(s));
    appendBE32(buf, static_cast<quint32>(n + 1));
    appendBE32(buf, static_cast<quint32>(n));
    buf.append(s, n);
    const int pad = (4 - (n % 4)) % 4;
    for (int i = 0; i < pad; ++i) buf.push_back('\0');
}

// Build a minimal TRR byte stream (box + positions only) with the given
// atom/frame count, single or double precision, using trrCoordNm().
std::string buildTRR(int natom, int nframes, bool bDouble)
{
    const int rsz = bDouble ? 8 : 4;
    std::string buf;
    for (int f = 0; f < nframes; ++f) {
        appendBE32(buf, 1993u);              // TRR magic
        appendGmxString(buf, "GMX_trn_file");  // version
        appendBE32(buf, 0u);                 // ir_size
        appendBE32(buf, 0u);                 // e_size
        appendBE32(buf, static_cast<quint32>(9 * rsz));            // box_size
        appendBE32(buf, 0u);                 // vir_size
        appendBE32(buf, 0u);                 // pres_size
        appendBE32(buf, 0u);                 // top_size
        appendBE32(buf, 0u);                 // sym_size
        appendBE32(buf, static_cast<quint32>(natom * 3 * rsz));    // x_size
        appendBE32(buf, 0u);                 // v_size
        appendBE32(buf, 0u);                 // f_size
        appendBE32(buf, static_cast<quint32>(natom));  // natoms
        appendBE32(buf, static_cast<quint32>(f));      // step
        appendBE32(buf, 0u);                           // nre

        if (bDouble) {
            appendBEf64(buf, 0.0);  // time
            appendBEf64(buf, 0.0);  // lambda
        } else {
            appendBEf32(buf, 0.0f);
            appendBEf32(buf, 0.0f);
        }

        // Box: diagonal 2/3/4 nm (orthorhombic).
        const double box[9] = {2, 0, 0, 0, 3, 0, 0, 0, 4};
        for (int i = 0; i < 9; ++i) {
            if (bDouble)
                appendBEf64(buf, box[i]);
            else
                appendBEf32(buf, static_cast<float>(box[i]));
        }

        // Positions (nm).
        for (int a = 0; a < natom; ++a) {
            for (int axis = 0; axis < 3; ++axis) {
                if (bDouble)
                    appendBEf64(buf, trrCoordNm(f, a, axis));
                else
                    appendBEf32(buf, trrCoordNm(f, a, axis));
            }
        }
    }
    return buf;
}

// Load one TRR (as bytes) into a new TrajBlock and append it to pTraj.
void appendTRR(const TrajectoryPtr &pTraj, const std::string &trr)
{
    TrrTrajReader reader;
    reader.setTargTrajUID(pTraj->getUID());
    mdtools::TrajBlockPtr pBlk(reader.createDefaultObj());
    reader.attach(pBlk);
    StrInStream tins(trr.data(), static_cast<int>(trr.size()));
    reader.read(tins);
    reader.detach();
    pTraj->append(pBlk);
}

// ---- XTC builders ----

// Common XTC frame header: magic, natoms, step, time, box, natoms (again).
void appendXtcHeader(std::string &buf, int natom, int step)
{
    appendBE32(buf, 1995u);                        // XTC magic
    appendBE32(buf, static_cast<quint32>(natom));  // natoms
    appendBE32(buf, static_cast<quint32>(step));   // step
    appendBEf32(buf, 0.0f);                        // time
    const float box[9] = {2, 0, 0, 0, 3, 0, 0, 0, 4};  // nm
    for (int i = 0; i < 9; ++i) appendBEf32(buf, box[i]);
    appendBE32(buf, static_cast<quint32>(natom));  // natoms (again)
}

// Build an uncompressed XTC (natom <= 9) using trrCoordNm() for positions.
std::string buildXTCUncompressed(int natom, int nframes)
{
    std::string buf;
    for (int f = 0; f < nframes; ++f) {
        appendXtcHeader(buf, natom, f);
        for (int a = 0; a < natom; ++a)
            for (int axis = 0; axis < 3; ++axis) appendBEf32(buf, trrCoordNm(f, a, axis));
    }
    return buf;
}

// --- XTC coordinate compressor, ported from chemfiles (BSD-3) write path, used
//     only to produce compressed test fixtures for the reader round-trip. ---

const int XC_MAGICINTS[] = {
    0,        0,        0,       0,       0,       0,       0,       0,       0,       8,
    10,       12,       16,      20,      25,      32,      40,      50,      64,      80,
    101,      128,      161,     203,     256,     322,     406,     512,     645,     812,
    1024,     1290,     1625,    2048,    2580,    3250,    4096,    5060,    6501,    8192,
    10321,    13003,    16384,   20642,   26007,   32768,   41285,   52015,   65536,   82570,
    104031,   131072,   165140,  208063,  262144,  330280,  416127,  524287,  660561,  832255,
    1048576,  1321122,  1664510, 2097152, 2642245, 3329021, 4194304, 5284491, 6658042, 8388607,
    10568983, 13316085, 16777216};
const int XC_FIRSTIDX = 9;
const int XC_LASTIDX = static_cast<int>(sizeof(XC_MAGICINTS) / sizeof(*XC_MAGICINTS));

struct EncState
{
    size_t count;
    size_t lastbits;
    quint8 lastbyte;
};

quint32 xc_sizeofint(quint32 size)
{
    quint32 num = 1, nbits = 0;
    while (size >= num && nbits < 32) {
        nbits++;
        num <<= 1;
    }
    return nbits;
}

quint32 xc_sizeofints(quint32 n, const quint32 sizes[])
{
    quint32 nbytes = 1;
    quint8 bytes[32];
    bytes[0] = 1;
    quint32 nbits = 0;
    for (quint32 i = 0; i < n; ++i) {
        quint32 tmp = 0, bytecnt;
        for (bytecnt = 0; bytecnt < nbytes; bytecnt++) {
            tmp = bytes[bytecnt] * sizes[i] + tmp;
            bytes[bytecnt] = tmp & 0xff;
            tmp >>= 8;
        }
        while (tmp != 0) {
            bytes[bytecnt++] = tmp & 0xff;
            tmp >>= 8;
        }
        nbytes = bytecnt;
    }
    quint32 num = 1;
    nbytes--;
    while (bytes[nbytes] >= num) {
        nbits++;
        num *= 2;
    }
    return nbits + nbytes * 8;
}

void xc_encodebits(std::vector<char> &buf, EncState &st, quint32 nbits, quint32 num)
{
    size_t lastbits = st.lastbits;
    quint32 lastbyte = st.lastbyte;
    while (nbits >= 8) {
        lastbyte = (lastbyte << 8) | (num >> (nbits - 8));
        buf[st.count++] = static_cast<char>(lastbyte >> lastbits);
        nbits -= 8;
    }
    if (nbits > 0) {
        lastbyte = (lastbyte << nbits) | num;
        lastbits += nbits;
        if (lastbits >= 8) {
            lastbits -= 8;
            buf[st.count++] = static_cast<char>(lastbyte >> lastbits);
        }
    }
    st.lastbits = lastbits;
    st.lastbyte = lastbyte & 0xff;
    if (lastbits > 0) buf[st.count] = static_cast<char>(lastbyte << (8 - lastbits));
}

void xc_encodeints(std::vector<char> &buf, EncState &st, quint32 nbits, const quint32 sizes[],
                   const quint32 nums[])
{
    quint32 tmp = nums[0], nbytes = 0;
    quint8 bytes[32];
    do {
        bytes[nbytes++] = tmp & 0xff;
        tmp >>= 8;
    } while (tmp != 0);
    for (size_t i = 1; i < 3; i++) {
        tmp = nums[i];
        quint32 bytecnt;
        for (bytecnt = 0; bytecnt < nbytes; bytecnt++) {
            tmp = bytes[bytecnt] * sizes[i] + tmp;
            bytes[bytecnt] = tmp & 0xff;
            tmp >>= 8;
        }
        while (tmp != 0) {
            bytes[bytecnt++] = tmp & 0xff;
            tmp >>= 8;
        }
        nbytes = bytecnt;
    }
    if (nbits >= nbytes * 8) {
        for (size_t i = 0; i < nbytes; i++) xc_encodebits(buf, st, 8, bytes[i]);
        xc_encodebits(buf, st, nbits - nbytes * 8, 0);
    } else {
        size_t i;
        for (i = 0; i < nbytes - 1u; i++) xc_encodebits(buf, st, 8, bytes[i]);
        xc_encodebits(buf, st, nbits - (nbytes - 1) * 8, bytes[i]);
    }
}

// Compress data (natoms*3 floats, nm) into the XTC frame body bytes:
// precision, minint[3], maxint[3], smallidx, then the opaque compressed block.
std::string compressXtcFrame(const std::vector<float> &data, float precision)
{
    const size_t natoms = data.size() / 3;
    std::vector<qint32> ibuf(3 * natoms);
    std::vector<char> comp(3 * natoms * sizeof(qint32) + 32, 0);

    int minint[3] = {INT_MAX, INT_MAX, INT_MAX};
    int maxint[3] = {INT_MIN, INT_MIN, INT_MIN};
    int mindiff = INT_MAX;
    int oldlint[3] = {0, 0, 0};
    for (size_t a = 0; a < natoms; ++a) {
        int lint[3];
        for (int i = 0; i < 3; ++i) {
            float f = data[a * 3 + i];
            float lf = (f >= 0.0f) ? f * precision + 0.5f : f * precision - 0.5f;
            lint[i] = static_cast<int>(lf);
            if (lint[i] < minint[i]) minint[i] = lint[i];
            if (lint[i] > maxint[i]) maxint[i] = lint[i];
            ibuf[a * 3 + i] = lint[i];
        }
        int diff = std::abs(oldlint[0] - lint[0]) + std::abs(oldlint[1] - lint[1]) +
                   std::abs(oldlint[2] - lint[2]);
        if (diff < mindiff && a > 0) mindiff = diff;
        oldlint[0] = lint[0];
        oldlint[1] = lint[1];
        oldlint[2] = lint[2];
    }

    int smallidx = XC_FIRSTIDX;
    while (smallidx < XC_LASTIDX - 1 && XC_MAGICINTS[smallidx] < mindiff) smallidx++;
    // Header records the initial smallidx (the per-atom loop below mutates it).
    const int smallidxHdr = smallidx;

    quint32 sizeint[3], bitsizeint[3] = {0, 0, 0}, bitsize;
    sizeint[0] = static_cast<quint32>(maxint[0] - minint[0]) + 1;
    sizeint[1] = static_cast<quint32>(maxint[1] - minint[1]) + 1;
    sizeint[2] = static_cast<quint32>(maxint[2] - minint[2]) + 1;
    if ((sizeint[0] | sizeint[1] | sizeint[2]) > 0xffffff) {
        bitsizeint[0] = xc_sizeofint(sizeint[0]);
        bitsizeint[1] = xc_sizeofint(sizeint[1]);
        bitsizeint[2] = xc_sizeofint(sizeint[2]);
        bitsize = 0;
    } else {
        bitsize = xc_sizeofints(3, sizeint);
    }

    const int maxidx = std::min(XC_LASTIDX, smallidx + 8);
    const int minidx = maxidx - 8;
    int smaller = XC_MAGICINTS[std::max(XC_FIRSTIDX, smallidx - 1)] / 2;
    int smallnum = XC_MAGICINTS[smallidx] / 2;
    quint32 sizesmall[3];
    sizesmall[0] = sizesmall[1] = sizesmall[2] = static_cast<quint32>(XC_MAGICINTS[smallidx]);
    const int larger = XC_MAGICINTS[maxidx] / 2;

    int prevrun = -1;
    quint32 tmpcoord[8 * 3];
    int prevcoord[3] = {0, 0, 0};
    int is_smaller;
    EncState st = {0, 0, 0};
    for (size_t i = 0; i < natoms; ++i) {
        bool is_small = false;
        qint32 *thiscoord = ibuf.data() + i * 3;
        if (smallidx < maxidx && i >= 1 && std::abs(thiscoord[0] - prevcoord[0]) < larger &&
            std::abs(thiscoord[1] - prevcoord[1]) < larger &&
            std::abs(thiscoord[2] - prevcoord[2]) < larger) {
            is_smaller = 1;
        } else if (smallidx > minidx) {
            is_smaller = -1;
        } else {
            is_smaller = 0;
        }
        if (i + 1 < natoms) {
            qint32 *nextcoord = ibuf.data() + (i + 1) * 3;
            if (std::abs(thiscoord[0] - nextcoord[0]) < smallnum &&
                std::abs(thiscoord[1] - nextcoord[1]) < smallnum &&
                std::abs(thiscoord[2] - nextcoord[2]) < smallnum) {
                std::swap(thiscoord[0], nextcoord[0]);
                std::swap(thiscoord[1], nextcoord[1]);
                std::swap(thiscoord[2], nextcoord[2]);
                is_small = true;
            }
        }
        tmpcoord[0] = static_cast<quint32>(thiscoord[0] - minint[0]);
        tmpcoord[1] = static_cast<quint32>(thiscoord[1] - minint[1]);
        tmpcoord[2] = static_cast<quint32>(thiscoord[2] - minint[2]);
        if (bitsize == 0) {
            xc_encodebits(comp, st, bitsizeint[0], tmpcoord[0]);
            xc_encodebits(comp, st, bitsizeint[1], tmpcoord[1]);
            xc_encodebits(comp, st, bitsizeint[2], tmpcoord[2]);
        } else {
            xc_encodeints(comp, st, bitsize, sizeint, tmpcoord);
        }
        prevcoord[0] = thiscoord[0];
        prevcoord[1] = thiscoord[1];
        prevcoord[2] = thiscoord[2];
        thiscoord = ibuf.data() + (i + 1) * 3;

        if (!is_small && is_smaller == -1) is_smaller = 0;
        int run = 0;
        while (is_small && run < 8 * 3) {
            if (is_smaller == -1) {
                int tmpsum = 0;
                for (int j = 0; j < 3; ++j) {
                    int t = thiscoord[j] - prevcoord[j];
                    tmpsum += t * t;
                }
                if (tmpsum >= smaller * smaller) is_smaller = 0;
            }
            tmpcoord[run++] = static_cast<quint32>(thiscoord[0] - prevcoord[0] + smallnum);
            tmpcoord[run++] = static_cast<quint32>(thiscoord[1] - prevcoord[1] + smallnum);
            tmpcoord[run++] = static_cast<quint32>(thiscoord[2] - prevcoord[2] + smallnum);
            prevcoord[0] = thiscoord[0];
            prevcoord[1] = thiscoord[1];
            prevcoord[2] = thiscoord[2];
            ++i;
            is_small = false;
            if (i + 1 < natoms) {
                thiscoord = ibuf.data() + (i + 1) * 3;
                if (std::abs(thiscoord[0] - prevcoord[0]) < smallnum &&
                    std::abs(thiscoord[1] - prevcoord[1]) < smallnum &&
                    std::abs(thiscoord[2] - prevcoord[2]) < smallnum) {
                    is_small = true;
                }
            }
        }
        if (run != prevrun || is_smaller != 0) {
            prevrun = run;
            xc_encodebits(comp, st, 1, 1);
            xc_encodebits(comp, st, 5, static_cast<quint32>(run + is_smaller + 1));
        } else {
            xc_encodebits(comp, st, 1, 0);
        }
        for (int k = 0; k < run; k += 3) xc_encodeints(comp, st, smallidx, sizesmall, &tmpcoord[k]);
        if (is_smaller != 0) {
            if (is_smaller < 0) {
                --smallidx;
                smallnum = smaller;
                smaller = XC_MAGICINTS[smallidx - 1] / 2;
            } else {
                ++smallidx;
                smaller = smallnum;
                smallnum = XC_MAGICINTS[smallidx] / 2;
            }
            sizesmall[0] = sizesmall[1] = sizesmall[2] =
                static_cast<quint32>(XC_MAGICINTS[smallidx]);
        }
    }
    if (st.lastbits != 0) ++st.count;

    std::string out;
    appendBEf32(out, precision);
    for (int i = 0; i < 3; ++i) appendBE32(out, static_cast<quint32>(minint[i]));
    for (int i = 0; i < 3; ++i) appendBE32(out, static_cast<quint32>(maxint[i]));
    appendBE32(out, static_cast<quint32>(smallidxHdr));
    // opaque block: count + bytes + padding to a multiple of 4
    const quint32 count = static_cast<quint32>(st.count);
    appendBE32(out, count);
    out.append(comp.data(), count);
    const int pad = (4 - (count % 4)) % 4;
    for (int i = 0; i < pad; ++i) out.push_back('\0');
    return out;
}

// Build a compressed XTC (natom >= 10) using trrCoordNm() for positions.
std::string buildXTCCompressed(int natom, int nframes, float precision)
{
    std::string buf;
    for (int f = 0; f < nframes; ++f) {
        appendXtcHeader(buf, natom, f);
        std::vector<float> data(static_cast<size_t>(natom) * 3);
        for (int a = 0; a < natom; ++a)
            for (int axis = 0; axis < 3; ++axis) data[a * 3 + axis] = trrCoordNm(f, a, axis);
        buf += compressXtcFrame(data, precision);
    }
    return buf;
}

// Load one XTC (as bytes) into a new TrajBlock and append it to pTraj.
void appendXTC(const TrajectoryPtr &pTraj, const std::string &xtc)
{
    XtcTrajReader reader;
    reader.setTargTrajUID(pTraj->getUID());
    mdtools::TrajBlockPtr pBlk(reader.createDefaultObj());
    reader.attach(pBlk);
    StrInStream xins(xtc.data(), static_cast<int>(xtc.size()));
    reader.read(xins);
    reader.detach();
    pTraj->append(pBlk);
}

// ---- AMBER NetCDF builders ----

// Overwrite big-endian bytes in an already-built buffer (offset backpatch).
void patchBE32(std::string &buf, size_t pos, quint32 v)
{
    buf[pos + 0] = static_cast<char>((v >> 24) & 0xff);
    buf[pos + 1] = static_cast<char>((v >> 16) & 0xff);
    buf[pos + 2] = static_cast<char>((v >> 8) & 0xff);
    buf[pos + 3] = static_cast<char>(v & 0xff);
}

void patchBE64(std::string &buf, size_t pos, quint64 v)
{
    for (int i = 0; i < 8; ++i) buf[pos + i] = static_cast<char>((v >> ((7 - i) * 8)) & 0xff);
}

// Write a NetCDF "Pascal" string: [i32 length][bytes][pad to a multiple of 4].
void appendNcName(std::string &buf, const char *s)
{
    const int n = static_cast<int>(std::strlen(s));
    appendBE32(buf, static_cast<quint32>(n));
    buf.append(s, n);
    const int pad = (4 - (n % 4)) % 4;
    for (int i = 0; i < pad; ++i) buf.push_back('\0');
}

// Write a NC_CHAR attribute: name + type(2) + count + bytes + pad.
void appendNcCharAttr(std::string &buf, const char *name, const char *value)
{
    appendNcName(buf, name);
    appendBE32(buf, 2u);  // NC_CHAR
    const int n = static_cast<int>(std::strlen(value));
    appendBE32(buf, static_cast<quint32>(n));  // count
    buf.append(value, n);
    const int pad = (4 - (n % 4)) % 4;
    for (int i = 0; i < pad; ++i) buf.push_back('\0');
}

// Deterministic AMBER coordinate (Angstrom) for (frame, atom, axis).
float ncCoord(int frame, int atom, int axis)
{
    return 100.0f * static_cast<float>(frame) + static_cast<float>(atom) +
           0.1f * static_cast<float>(axis + 1);
}

// Fixed unit cell: a,b,c (Angstrom), alpha,beta,gamma (degrees).
const double kNcCell[6] = {10.0, 11.0, 12.0, 90.0, 90.0, 90.0};

// Build a minimal AMBER NetCDF3 trajectory with coordinates + cell_lengths +
// cell_angles as record variables. version is 1 (CDF-1, 32-bit offset) or 2
// (CDF-2, 64-bit offset). Uses ncCoord()/kNcCell for deterministic data.
std::string buildAmberNC(int natom, int nframes, int version)
{
    std::string b;
    b.append("CDF", 3);
    b.push_back(static_cast<char>(version));
    appendBE32(b, static_cast<quint32>(nframes));  // numrecs

    // Dimensions: spatial=0, atom=1, frame=2(record), cell_spatial=3, cell_angular=4.
    appendBE32(b, 10u);  // NC_DIMENSION
    appendBE32(b, 5u);
    appendNcName(b, "spatial");
    appendBE32(b, 3u);
    appendNcName(b, "atom");
    appendBE32(b, static_cast<quint32>(natom));
    appendNcName(b, "frame");
    appendBE32(b, 0u);  // record dimension
    appendNcName(b, "cell_spatial");
    appendBE32(b, 3u);
    appendNcName(b, "cell_angular");
    appendBE32(b, 3u);

    // Global attributes.
    appendBE32(b, 12u);  // NC_ATTRIBUTE
    appendBE32(b, 2u);
    appendNcCharAttr(b, "Conventions", "AMBER");
    appendNcCharAttr(b, "ConventionVersion", "1.0");

    // Variables (all record variables, in file/record order).
    appendBE32(b, 11u);  // NC_VARIABLE
    appendBE32(b, 3u);

    const bool b64off = (version >= 2);
    size_t posCoord = 0, posClen = 0, posCang = 0;

    // coordinates [frame, atom, spatial], NC_FLOAT.
    appendNcName(b, "coordinates");
    appendBE32(b, 3u);
    appendBE32(b, 2u);
    appendBE32(b, 1u);
    appendBE32(b, 0u);
    appendBE32(b, 12u);  // NC_ATTRIBUTE
    appendBE32(b, 1u);
    appendNcCharAttr(b, "units", "angstrom");
    appendBE32(b, 5u);                                     // NC_FLOAT
    appendBE32(b, static_cast<quint32>(4 * natom * 3));    // vsize
    posCoord = b.size();
    if (b64off)
        appendBE64(b, 0u);
    else
        appendBE32(b, 0u);  // begin placeholder

    // cell_lengths [frame, cell_spatial], NC_FLOAT.
    appendNcName(b, "cell_lengths");
    appendBE32(b, 2u);
    appendBE32(b, 2u);
    appendBE32(b, 3u);
    appendBE32(b, 12u);
    appendBE32(b, 1u);
    appendNcCharAttr(b, "units", "angstrom");
    appendBE32(b, 5u);
    appendBE32(b, 12u);
    posClen = b.size();
    if (b64off)
        appendBE64(b, 0u);
    else
        appendBE32(b, 0u);

    // cell_angles [frame, cell_angular], NC_FLOAT.
    appendNcName(b, "cell_angles");
    appendBE32(b, 2u);
    appendBE32(b, 2u);
    appendBE32(b, 4u);
    appendBE32(b, 12u);
    appendBE32(b, 1u);
    appendNcCharAttr(b, "units", "degree");
    appendBE32(b, 5u);
    appendBE32(b, 12u);
    posCang = b.size();
    if (b64off)
        appendBE64(b, 0u);
    else
        appendBE32(b, 0u);

    // Header complete: patch the variable begins now the header size is known.
    const quint64 hdr = static_cast<quint64>(b.size());
    const quint64 coordBegin = hdr;
    const quint64 clenBegin = hdr + static_cast<quint64>(12 * natom);
    const quint64 cangBegin = clenBegin + 12u;
    if (b64off) {
        patchBE64(b, posCoord, coordBegin);
        patchBE64(b, posClen, clenBegin);
        patchBE64(b, posCang, cangBegin);
    } else {
        patchBE32(b, posCoord, static_cast<quint32>(coordBegin));
        patchBE32(b, posClen, static_cast<quint32>(clenBegin));
        patchBE32(b, posCang, static_cast<quint32>(cangBegin));
    }

    // Record data: per frame, coordinates then cell_lengths then cell_angles.
    for (int f = 0; f < nframes; ++f) {
        for (int a = 0; a < natom; ++a)
            for (int axis = 0; axis < 3; ++axis) appendBEf32(b, ncCoord(f, a, axis));
        for (int i = 0; i < 3; ++i) appendBEf32(b, static_cast<float>(kNcCell[i]));
        for (int i = 0; i < 3; ++i) appendBEf32(b, static_cast<float>(kNcCell[3 + i]));
    }
    return b;
}

// Load one AMBER NetCDF (as bytes) into a new TrajBlock and append it to pTraj.
void appendAmberNC(const TrajectoryPtr &pTraj, const std::string &nc)
{
    AmberNetCDFReader reader;
    reader.setTargTrajUID(pTraj->getUID());
    mdtools::TrajBlockPtr pBlk(reader.createDefaultObj());
    reader.attach(pBlk);
    StrInStream nins(nc.data(), static_cast<int>(nc.size()));
    reader.read(nins);
    reader.detach();
    pTraj->append(pBlk);
}

}  // namespace

TEST(TrajectoryTest, DcdPlaybackMapsFramesToAtoms)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();
    ASSERT_EQ(pTraj->getAtomSize(), 3);

    const int nframes = 4;
    appendDCD(pTraj, buildDCD(3, nframes));

    EXPECT_EQ(pTraj->getFrameSize(), nframes);
    EXPECT_EQ(pTraj->getBlockCount(), 1);  // one DCD -> one block

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

TEST(TrajectoryTest, MultipleDcdBlocksSpanFrames)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();

    // Two DCD files -> two blocks (like two <trajfile> entries in a .qsc).
    appendDCD(pTraj, buildDCD(3, 3));  // frames 0..2
    appendDCD(pTraj, buildDCD(3, 2));  // frames 3..4 (in-block frames 0..1)

    EXPECT_EQ(pTraj->getBlockCount(), 2);
    EXPECT_EQ(pTraj->getFrameSize(), 5);

    // Global frame 2 -> block 0, in-block frame 2.
    pTraj->setFrame(2);
    int aid = pTraj->getAtomIDByArrayInd(2u);
    EXPECT_NEAR(pTraj->getAtom(aid)->getPos().x(), dcdCoord(2, 2, 0), 1e-4);

    // Global frames 3,4 -> block 1, in-block frames 0,1.
    pTraj->setFrame(3);
    EXPECT_NEAR(pTraj->getAtom(aid)->getPos().x(), dcdCoord(0, 2, 0), 1e-4);
    pTraj->setFrame(4);
    EXPECT_NEAR(pTraj->getAtom(aid)->getPos().x(), dcdCoord(1, 2, 0), 1e-4);
}

TEST(TrajectoryTest, RemoveBlockOutOfRangeThrows)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();
    appendDCD(pTraj, buildDCD(3, 2));
    EXPECT_EQ(pTraj->getBlockCount(), 1);
    EXPECT_THROW(pTraj->removeBlock(-1), qlib::RuntimeException);
    EXPECT_THROW(pTraj->removeBlock(1), qlib::RuntimeException);
    // Valid removal leaves an empty (0-block) trajectory.
    pTraj->removeBlock(0);
    EXPECT_EQ(pTraj->getBlockCount(), 0);
    EXPECT_EQ(pTraj->getFrameSize(), 0);
}

// Interactive "Add block" (append inside an undo txn on a scene object) is
// undoable: undo removes the appended block, redo re-appends it, and the frame
// count / block count / start indices round-trip. The initial block is appended
// before scene membership, so (like the object-level load) it is NOT recorded.
TEST(TrajectoryTest, BlockAppendUndoRedo)
{
    qsys::ScenePtr pScene = qsys::SceneManager::getInstance()->createScene();
    TrajectoryPtr pTraj = makeWaterTrajectory();

    // "Loaded" initial block: not in a scene yet -> append is not recorded.
    appendDCD(pTraj, buildDCD(3, 2));  // frames 0..1
    pScene->addObject(pTraj);
    EXPECT_EQ(pTraj->getBlockCount(), 1);
    EXPECT_EQ(pTraj->getFrameSize(), 2);

    // Interactive Add of a second block inside a txn -> recorded.
    pScene->startUndoTxn("Add trajectory block");
    appendDCD(pTraj, buildDCD(3, 3));  // frames 2..4
    pScene->commitUndoTxn();
    EXPECT_EQ(pTraj->getBlockCount(), 2);
    EXPECT_EQ(pTraj->getFrameSize(), 5);
    EXPECT_EQ(pTraj->getBlock(1)->getStartIndex(), 2);

    // Undo removes the added block.
    ASSERT_TRUE(pScene->isUndoable());
    pScene->undo(1);
    EXPECT_EQ(pTraj->getBlockCount(), 1);
    EXPECT_EQ(pTraj->getFrameSize(), 2);

    // Redo re-appends it (same contiguous layout).
    pScene->redo(1);
    EXPECT_EQ(pTraj->getBlockCount(), 2);
    EXPECT_EQ(pTraj->getFrameSize(), 5);
    EXPECT_EQ(pTraj->getBlock(1)->getStartIndex(), 2);

    qsys::SceneManager::getInstance()->destroyScene(pScene->getUID());
}

TEST(TrajectoryTest, DcdNatomMismatchThrows)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();  // 3 atoms

    DCDTrajReader reader;
    reader.setTargTrajUID(pTraj->getUID());
    mdtools::TrajBlockPtr pBlk(reader.createDefaultObj());
    reader.attach(pBlk);
    std::string dcd = buildDCD(5, 2);  // 5 atoms != 3
    StrInStream dins(dcd.data(), static_cast<int>(dcd.size()));
    EXPECT_THROW(reader.read(dins), qlib::FileFormatException);
}

// ---- Trajectory + TrrTrajReader (GRO topology + synthetic TRR) ----

TEST(TrajectoryTest, TrrPlaybackSinglePrecision)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();
    ASSERT_EQ(pTraj->getAtomSize(), 3);

    const int nframes = 4;
    appendTRR(pTraj, buildTRR(3, nframes, /*bDouble=*/false));

    EXPECT_EQ(pTraj->getFrameSize(), nframes);
    EXPECT_EQ(pTraj->getBlockCount(), 1);

    for (int f = 0; f < nframes; ++f) {
        pTraj->setFrame(f);
        for (int i = 0; i < 3; ++i) {
            int aid = pTraj->getAtomIDByArrayInd(static_cast<quint32>(i));
            Vector4D pos = pTraj->getAtom(aid)->getPos();
            // nm -> Angstrom (x10)
            EXPECT_NEAR(pos.x(), trrCoordNm(f, i, 0) * 10.0, 1e-3);
            EXPECT_NEAR(pos.y(), trrCoordNm(f, i, 1) * 10.0, 1e-3);
            EXPECT_NEAR(pos.z(), trrCoordNm(f, i, 2) * 10.0, 1e-3);
        }
    }
}

TEST(TrajectoryTest, TrrPlaybackDoublePrecision)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();

    const int nframes = 3;
    appendTRR(pTraj, buildTRR(3, nframes, /*bDouble=*/true));

    EXPECT_EQ(pTraj->getFrameSize(), nframes);
    pTraj->setFrame(2);
    int aid = pTraj->getAtomIDByArrayInd(1u);
    Vector4D pos = pTraj->getAtom(aid)->getPos();
    EXPECT_NEAR(pos.x(), trrCoordNm(2, 1, 0) * 10.0, 1e-4);
    EXPECT_NEAR(pos.y(), trrCoordNm(2, 1, 1) * 10.0, 1e-4);
    EXPECT_NEAR(pos.z(), trrCoordNm(2, 1, 2) * 10.0, 1e-4);
}

TEST(TrajectoryTest, TrrNatomMismatchThrows)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();  // 3 atoms

    TrrTrajReader reader;
    reader.setTargTrajUID(pTraj->getUID());
    mdtools::TrajBlockPtr pBlk(reader.createDefaultObj());
    reader.attach(pBlk);
    std::string trr = buildTRR(5, 2, false);  // 5 atoms != 3
    StrInStream tins(trr.data(), static_cast<int>(trr.size()));
    EXPECT_THROW(reader.read(tins), qlib::FileFormatException);
}

// Direct codec round-trip (no Trajectory/topology): compress then decompress
// through XdrInStream, isolating the ported XTC decompressor.
TEST(XdrInStreamTest, CompressedCoordsRoundTrip)
{
    const int natom = 12;
    const float precision = 1000.0f;
    std::vector<float> data(static_cast<size_t>(natom) * 3);
    for (int a = 0; a < natom; ++a)
        for (int axis = 0; axis < 3; ++axis) data[a * 3 + axis] = trrCoordNm(0, a, axis);

    std::string body = compressXtcFrame(data, precision);
    StrInStream ins(body.data(), static_cast<int>(body.size()));
    XdrInStream xdr(ins);

    std::vector<qfloat32> out(static_cast<size_t>(natom) * 3);
    float prec = xdr.readCompressedCoords(out, false);
    EXPECT_NEAR(prec, precision, 1e-3);
    for (int i = 0; i < natom * 3; ++i)
        EXPECT_NEAR(out[i], data[i], 1.5e-3) << "coord index " << i;
}

// ---- Trajectory + XtcTrajReader (GRO topology + synthetic XTC) ----

// Uncompressed path (<=9 atoms): validates header/frame-loop/box/scatter/EOF
// without any compression.
TEST(TrajectoryTest, XtcUncompressedPlayback)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();
    ASSERT_EQ(pTraj->getAtomSize(), 3);

    const int nframes = 4;
    appendXTC(pTraj, buildXTCUncompressed(3, nframes));

    EXPECT_EQ(pTraj->getFrameSize(), nframes);
    EXPECT_EQ(pTraj->getBlockCount(), 1);

    for (int f = 0; f < nframes; ++f) {
        pTraj->setFrame(f);
        for (int i = 0; i < 3; ++i) {
            int aid = pTraj->getAtomIDByArrayInd(static_cast<quint32>(i));
            Vector4D pos = pTraj->getAtom(aid)->getPos();
            EXPECT_NEAR(pos.x(), trrCoordNm(f, i, 0) * 10.0, 1e-3);
            EXPECT_NEAR(pos.y(), trrCoordNm(f, i, 1) * 10.0, 1e-3);
            EXPECT_NEAR(pos.z(), trrCoordNm(f, i, 2) * 10.0, 1e-3);
        }
    }
}

// Compressed path (>=10 atoms): round-trips coordinates through the ported
// compressor and the reader's decompressor. Precision 1000 (1/nm) quantizes to
// 0.001 nm = 0.01 Angstrom.
TEST(TrajectoryTest, XtcCompressedRoundTrip)
{
    const int natom = 12;
    const int nframes = 3;
    const float precision = 1000.0f;
    TrajectoryPtr pTraj = makeTrajectoryNAtoms(natom);
    ASSERT_EQ(pTraj->getAtomSize(), natom);

    appendXTC(pTraj, buildXTCCompressed(natom, nframes, precision));

    EXPECT_EQ(pTraj->getFrameSize(), nframes);

    for (int f = 0; f < nframes; ++f) {
        pTraj->setFrame(f);
        for (int i = 0; i < natom; ++i) {
            int aid = pTraj->getAtomIDByArrayInd(static_cast<quint32>(i));
            Vector4D pos = pTraj->getAtom(aid)->getPos();
            EXPECT_NEAR(pos.x(), trrCoordNm(f, i, 0) * 10.0, 0.02);
            EXPECT_NEAR(pos.y(), trrCoordNm(f, i, 1) * 10.0, 0.02);
            EXPECT_NEAR(pos.z(), trrCoordNm(f, i, 2) * 10.0, 0.02);
        }
    }
}

TEST(TrajectoryTest, XtcNatomMismatchThrows)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();  // 3 atoms

    XtcTrajReader reader;
    reader.setTargTrajUID(pTraj->getUID());
    mdtools::TrajBlockPtr pBlk(reader.createDefaultObj());
    reader.attach(pBlk);
    std::string xtc = buildXTCUncompressed(5, 2);  // 5 atoms != 3
    StrInStream xins(xtc.data(), static_cast<int>(xtc.size()));
    EXPECT_THROW(reader.read(xins), qlib::FileFormatException);
}

// ---- Netcdf3InStream (AMBER NetCDF header + record decode) ----

TEST(Netcdf3InStreamTest, ParsesHeader)
{
    std::string nc = buildAmberNC(4, 3, 2);
    StrInStream ins(nc.data(), static_cast<int>(nc.size()));
    mdtools::Netcdf3InStream ncs(ins);
    ncs.parseHeader();
    EXPECT_TRUE(ncs.getConvention().equals("AMBER"));
    EXPECT_EQ(ncs.getNatoms(), 4);
    EXPECT_EQ(ncs.getNumFrames(), 3);
    EXPECT_TRUE(ncs.hasCell());
    EXPECT_TRUE(ncs.hasRecordDim());
}

TEST(Netcdf3InStreamTest, ReadsFramesCoordsAndCell)
{
    const int natom = 4, nframes = 3;
    std::string nc = buildAmberNC(natom, nframes, 2);
    StrInStream ins(nc.data(), static_cast<int>(nc.size()));
    mdtools::Netcdf3InStream ncs(ins);
    ncs.parseHeader();

    std::vector<qfloat32> crd;
    qfloat32 cell[6];
    for (int f = 0; f < nframes; ++f) {
        ASSERT_TRUE(ncs.readFrame(crd, cell));
        ASSERT_EQ(static_cast<int>(crd.size()), natom * 3);
        for (int a = 0; a < natom; ++a)
            for (int axis = 0; axis < 3; ++axis)
                EXPECT_NEAR(crd[a * 3 + axis], ncCoord(f, a, axis), 1e-4);
        for (int i = 0; i < 6; ++i) EXPECT_NEAR(cell[i], static_cast<float>(kNcCell[i]), 1e-4);
    }
    EXPECT_FALSE(ncs.readFrame(crd, cell));  // clean end of stream
}

TEST(Netcdf3InStreamTest, Cdf1MatchesCdf2)
{
    // The only on-file difference between CDF-1 and CDF-2 is the variable offset
    // field width; both must decode to identical coordinates and cell.
    const int natom = 3, nframes = 2;
    std::string nc1 = buildAmberNC(natom, nframes, 1);
    std::string nc2 = buildAmberNC(natom, nframes, 2);
    StrInStream i1(nc1.data(), static_cast<int>(nc1.size()));
    StrInStream i2(nc2.data(), static_cast<int>(nc2.size()));
    mdtools::Netcdf3InStream s1(i1), s2(i2);
    s1.parseHeader();
    s2.parseHeader();
    EXPECT_EQ(s1.getNumFrames(), s2.getNumFrames());

    std::vector<qfloat32> c1, c2;
    qfloat32 cell1[6], cell2[6];
    for (int f = 0; f < nframes; ++f) {
        ASSERT_TRUE(s1.readFrame(c1, cell1));
        ASSERT_TRUE(s2.readFrame(c2, cell2));
        ASSERT_EQ(c1.size(), c2.size());
        for (size_t i = 0; i < c1.size(); ++i) EXPECT_FLOAT_EQ(c1[i], c2[i]);
        for (int i = 0; i < 6; ++i) EXPECT_FLOAT_EQ(cell1[i], cell2[i]);
    }
}

// ---- Trajectory + AmberNetCDFReader (GRO topology + synthetic NetCDF) ----

TEST(TrajectoryTest, AmberNetCDFPlayback)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();
    ASSERT_EQ(pTraj->getAtomSize(), 3);

    const int nframes = 4;
    appendAmberNC(pTraj, buildAmberNC(3, nframes, 2));

    EXPECT_EQ(pTraj->getFrameSize(), nframes);
    EXPECT_EQ(pTraj->getBlockCount(), 1);

    for (int f = 0; f < nframes; ++f) {
        pTraj->setFrame(f);
        for (int i = 0; i < 3; ++i) {
            int aid = pTraj->getAtomIDByArrayInd(static_cast<quint32>(i));
            Vector4D pos = pTraj->getAtom(aid)->getPos();
            // AMBER coordinates are Angstrom (no scaling).
            EXPECT_NEAR(pos.x(), ncCoord(f, i, 0), 1e-4);
            EXPECT_NEAR(pos.y(), ncCoord(f, i, 1), 1e-4);
            EXPECT_NEAR(pos.z(), ncCoord(f, i, 2), 1e-4);
        }
    }
}

TEST(TrajectoryTest, AmberNetCDFNatomMismatchThrows)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();  // 3 atoms

    AmberNetCDFReader reader;
    reader.setTargTrajUID(pTraj->getUID());
    mdtools::TrajBlockPtr pBlk(reader.createDefaultObj());
    reader.attach(pBlk);
    std::string nc = buildAmberNC(5, 2, 2);  // 5 atoms != 3
    StrInStream nins(nc.data(), static_cast<int>(nc.size()));
    EXPECT_THROW(reader.read(nins), qlib::FileFormatException);
}

TEST(TrajectoryTest, AmberNetCDFNeverySkip)
{
    TrajectoryPtr pTraj = makeWaterTrajectory();

    AmberNetCDFReader reader;
    reader.setTargTrajUID(pTraj->getUID());
    reader.setSkipNo(2);  // keep every 2nd frame
    mdtools::TrajBlockPtr pBlk(reader.createDefaultObj());
    reader.attach(pBlk);
    std::string nc = buildAmberNC(3, 6, 2);  // 6 frames -> 3 kept
    StrInStream nins(nc.data(), static_cast<int>(nc.size()));
    reader.read(nins);
    reader.detach();
    pTraj->append(pBlk);

    EXPECT_EQ(pTraj->getFrameSize(), 3);
}

TEST(TrajectoryTest, AmberNetCDFInitialFrameIsTrajFrameZero)
{
    // GRO topology carries its own (initial-structure) coordinates. Once a
    // trajectory block is appended, the initial display (before any setFrame)
    // must show the trajectory's frame 0, not the GRO coordinates.
    TrajectoryPtr pTraj = makeWaterTrajectory();
    appendAmberNC(pTraj, buildAmberNC(3, 4, 2));

    // No setFrame() call: read the eagerly-primed initial positions directly.
    for (int i = 0; i < 3; ++i) {
        int aid = pTraj->getAtomIDByArrayInd(static_cast<quint32>(i));
        Vector4D pos = pTraj->getAtom(aid)->getPos();
        EXPECT_NEAR(pos.x(), ncCoord(0, i, 0), 1e-4);
        EXPECT_NEAR(pos.y(), ncCoord(0, i, 1), 1e-4);
        EXPECT_NEAR(pos.z(), ncCoord(0, i, 2), 1e-4);
    }
}
