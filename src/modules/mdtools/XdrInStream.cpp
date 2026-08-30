// -*-Mode: C++;-*-
//
// XDR (RFC 4506) big-endian input stream with GROMACS helpers.
//
// The lossy 3D-coordinate decompression (decodeXtcCoords and its helpers) is
// adapted from chemfiles (BSD-3-clause, src/files/XDRFile.cpp). The underlying
// algorithm is originally by Frans van Hoesel (Europort project, 1995) as used
// in GROMACS.
//

#include <common.h>

#include "XdrInStream.hpp"

#include <qlib/LExceptions.hpp>

#include <climits>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <algorithm>

using namespace mdtools;
using qlib::LString;

namespace {

// Host byte order is little-endian when int32 is stored LE. XDR is big-endian,
// so a little-endian host must byte-swap.
bool hostIsLittleEndian()
{
    return qlib::BinOutStream::getIntByteOrder() == qlib::BinOutStream::INTBO_LE;
}

///////////////////////////////////////////////////////////////////////////
// 3D-coordinate decompression, adapted from chemfiles (BSD-3).

/// sizeofint: smallest number of bits to represent an integer.
quint32 sizeofint(const quint32 size)
{
    quint32 num = 1;
    quint32 num_of_bits = 0;
    while (size >= num && num_of_bits < 4 * CHAR_BIT) {
        num_of_bits++;
        num <<= 1;
    }
    return num_of_bits;
}

/// sizeofints: number of bits needed to encode a set of small ints.
quint32 sizeofints(const quint32 num_of_ints, const quint32 sizes[])
{
    quint32 num_of_bytes = 1;
    quint8 bytes[32];
    bytes[0] = 1;
    quint32 num_of_bits = 0;
    for (quint32 i = 0; i < num_of_ints; ++i) {
        quint32 tmp = 0;
        quint32 bytecnt;
        for (bytecnt = 0; bytecnt < num_of_bytes; bytecnt++) {
            tmp = bytes[bytecnt] * sizes[i] + tmp;
            bytes[bytecnt] = tmp & 0xff;
            tmp >>= CHAR_BIT;
        }
        while (tmp != 0) {
            bytes[bytecnt++] = tmp & 0xff;
            tmp >>= CHAR_BIT;
        }
        num_of_bytes = bytecnt;
    }
    quint32 num = 1;
    num_of_bytes--;
    while (bytes[num_of_bytes] >= num) {
        num_of_bits++;
        num *= 2;
    }
    return num_of_bits + num_of_bytes * CHAR_BIT;
}

struct DecodeState
{
    size_t count;
    size_t lastbits;
    quint8 lastbyte;
};

/// Next byte of the compressed block; the block length comes from the file,
/// so a truncated block must not be read past its end.
inline quint8 nextByte(const std::vector<char> &buf, DecodeState &state)
{
    if (state.count >= buf.size()) {
        MB_THROW(qlib::FileFormatException, "XTC: compressed block is truncated");
        return 0;
    }
    return static_cast<quint8>(buf[state.count++]);
}

/// decodebits: extract num_of_bits from the buffer and build an integer.
template <typename T>
T decodebits(const std::vector<char> &buf, DecodeState &state, quint32 num_of_bits)
{
    const quint32 mask = static_cast<quint32>(1 << num_of_bits) - 1;

    size_t lastbits = state.lastbits;
    quint32 lastbyte = state.lastbyte;

    quint32 num = 0;
    while (num_of_bits >= CHAR_BIT) {
        lastbyte = (lastbyte << CHAR_BIT) | nextByte(buf, state);
        num |= (lastbyte >> lastbits) << (num_of_bits - CHAR_BIT);
        num_of_bits -= CHAR_BIT;
    }
    if (num_of_bits > 0) {
        if (lastbits < num_of_bits) {
            lastbits += CHAR_BIT;
            lastbyte = (lastbyte << CHAR_BIT) | nextByte(buf, state);
        }
        lastbits -= num_of_bits;
        num |= (lastbyte >> lastbits) & (static_cast<quint32>(1 << num_of_bits) - 1);
    }
    num &= mask;
    state.lastbits = lastbits;
    state.lastbyte = lastbyte & 0xff;
    return static_cast<T>(num);
}

// Fast path for num_of_bits <= 64: accumulate the packed value and split it
// with plain 64-bit arithmetic (libxtc technique). 64-bit throughout avoids
// truncation/overflow that fixed-width intermediates would introduce for large
// coordinate ranges.
void unpack_from_int(const std::vector<char> &buf, DecodeState &state, quint32 num_of_bits,
                     const quint32 sizes[3], qint32 nums[3])
{
    std::uint64_t v = 0;
    size_t num_of_bytes = 0;
    while (num_of_bits >= CHAR_BIT) {
        std::uint64_t byte = decodebits<std::uint64_t>(buf, state, CHAR_BIT);
        v |= byte << (CHAR_BIT * num_of_bytes++);
        num_of_bits -= CHAR_BIT;
    }
    if (num_of_bits > 0) {
        std::uint64_t byte = decodebits<std::uint64_t>(buf, state, num_of_bits);
        v |= byte << (CHAR_BIT * num_of_bytes);
    }

    const std::uint64_t sz = sizes[2];
    const std::uint64_t sy = sizes[1];
    const std::uint64_t szy = sz * sy;
    const std::uint64_t x1 = v / szy;
    const std::uint64_t q1 = v - x1 * szy;
    const std::uint64_t y1 = q1 / sz;
    const std::uint64_t z1 = q1 - y1 * sz;

    nums[0] = static_cast<qint32>(x1);
    nums[1] = static_cast<qint32>(y1);
    nums[2] = static_cast<qint32>(z1);
}

/// decodeints: decode 3 small integers from the buffer.
void decodeints(const std::vector<char> &buf, DecodeState &state, quint32 num_of_bits,
                const quint32 sizes[3], qint32 nums[3])
{
    if (sizes[0] == 0 || sizes[1] == 0 || sizes[2] == 0) {
        MB_THROW(qlib::FileFormatException,
                 "XTC: size of zero encountered (file possibly corrupted)");
    }

    if (num_of_bits <= 64) {
        unpack_from_int(buf, state, num_of_bits, sizes, nums);
        return;
    }

    quint8 bytes[32];
    bytes[1] = bytes[2] = bytes[3] = 0;
    size_t num_of_bytes = 0;
    while (num_of_bits >= CHAR_BIT) {
        bytes[num_of_bytes++] = decodebits<quint8>(buf, state, CHAR_BIT);
        num_of_bits -= CHAR_BIT;
    }
    if (num_of_bits > 0) {
        bytes[num_of_bytes++] = decodebits<quint8>(buf, state, num_of_bits);
    }
    for (size_t i = 2; i > 0; --i) {
        quint32 num = 0;
        for (size_t j = 0; j < num_of_bytes; ++j) {
            const size_t k = num_of_bytes - 1 - j;
            num = (num << CHAR_BIT) | bytes[k];
            const quint32 p = num / sizes[i];
            bytes[k] = static_cast<quint8>(p);
            num = num - p * sizes[i];
        }
        nums[i] = static_cast<qint32>(num);
    }
    nums[0] = bytes[0] | (bytes[1] << CHAR_BIT) | (bytes[2] << 2 * CHAR_BIT) |
              (bytes[3] << 3 * CHAR_BIT);
}

quint32 calc_sizeint(const int minint[3], const int maxint[3], quint32 sizeint[3],
                     quint32 bitsizeint[3])
{
    sizeint[0] = static_cast<quint32>(maxint[0] - minint[0]) + 1;
    sizeint[1] = static_cast<quint32>(maxint[1] - minint[1]) + 1;
    sizeint[2] = static_cast<quint32>(maxint[2] - minint[2]) + 1;

    bitsizeint[0] = bitsizeint[1] = bitsizeint[2] = 0;
    if ((sizeint[0] | sizeint[1] | sizeint[2]) > 0xffffff) {
        bitsizeint[0] = sizeofint(sizeint[0]);
        bitsizeint[1] = sizeofint(sizeint[1]);
        bitsizeint[2] = sizeofint(sizeint[2]);
        return 0;  // flag the use of large sizes
    }
    return sizeofints(3, sizeint);
}

const int MAGICINTS[] = {
    0,        0,        0,       0,       0,       0,       0,       0,       0,       8,
    10,       12,       16,      20,      25,      32,      40,      50,      64,      80,
    101,      128,      161,     203,     256,     322,     406,     512,     645,     812,
    1024,     1290,     1625,    2048,    2580,    3250,    4096,    5060,    6501,    8192,
    10321,    13003,    16384,   20642,   26007,   32768,   41285,   52015,   65536,   82570,
    104031,   131072,   165140,  208063,  262144,  330280,  416127,  524287,  660561,  832255,
    1048576,  1321122,  1664510, 2097152, 2642245, 3329021, 4194304, 5284491, 6658042, 8388607,
    10568983, 13316085, 16777216};

const quint32 FIRSTIDX = 9;  // MAGICINTS[FIRSTIDX-1] == 0
const quint32 LASTIDX = static_cast<quint32>(sizeof(MAGICINTS) / sizeof(*MAGICINTS));

}  // anonymous namespace

///////////////////////////////////////////////////////////////////////////

XdrInStream::XdrInStream(qlib::InStream &ins) : super_t(ins)
{
    m_bSwap = hostIsLittleEndian();
    setSwapMode(m_bSwap ? MODE_SWAP : MODE_NOOP);
}

XdrInStream::~XdrInStream() {}

bool XdrInStream::readI32opt(qint32 &out)
{
    char buf[4];
    int total = 0;
    while (total < 4) {
        int n = read(buf, total, 4 - total);
        if (n <= 0) break;
        total += n;
    }
    if (total == 0) return false;  // clean end of stream
    if (total < 4) {
        MB_THROW(qlib::EOFException, "XDR: truncated int32 at frame boundary");
        return false;
    }
    qint32 v;
    std::memcpy(&v, buf, 4);
    if (m_bSwap) qlib::LByteSwapper<qint32>::swap(v);
    out = v;
    return true;
}

void XdrInStream::skipBytes(qint64 nbytes)
{
    while (nbytes > 0) {
        int chunk = static_cast<int>(std::min<qint64>(nbytes, INT_MAX));
        int s = skip(chunk);
        if (s <= 0) {
            MB_THROW(qlib::EOFException, "XDR: truncated stream while skipping");
            return;
        }
        nbytes -= s;
    }
}

void XdrInStream::readOpaque(std::vector<char> &data, bool bLongFormat)
{
    // Variable-length opaque: [count][count bytes][padding to a multiple of 4].
    // The GROMACS "long" format (v2023) uses a 64-bit count.
    quint64 count;
    if (bLongFormat) {
        qint32 hi = readI32();
        qint32 lo = readI32();
        count = (static_cast<quint64>(static_cast<quint32>(hi)) << 32) |
                static_cast<quint64>(static_cast<quint32>(lo));
    } else {
        count = static_cast<quint64>(readU32());
    }
    if (count > static_cast<quint64>(INT_MAX)) {
        MB_THROW(qlib::FileFormatException, "XTC: compressed block too large");
        return;
    }
    const quint64 nfill = (4 - (count % 4)) % 4;
    data.resize(static_cast<size_t>(count + nfill));
    readFully(data.data(), 0, static_cast<int>(count + nfill));
    data.resize(static_cast<size_t>(count));
}

qlib::LString XdrInStream::readGmxString()
{
    // int32 length-with-null, then XDR opaque bytes without the terminator.
    readU32();  // declared length (incl. null terminator), unused here
    std::vector<char> buf;
    readOpaque(buf, false);
    return LString(buf.data(), static_cast<int>(buf.size()));
}

void XdrInStream::readF32Array(qfloat32 *out, int ncoord)
{
    for (int i = 0; i < ncoord; ++i) out[i] = readF32();
}

void XdrInStream::readGmxBox(bool bDouble, qfloat32 cell[6])
{
    // Read the 3x3 box (row-major lattice vectors), scale nm -> Angstrom.
    double m[9];
    if (bDouble) {
        for (int i = 0; i < 9; ++i) m[i] = readF64() * 10.0;
    } else {
        for (int i = 0; i < 9; ++i) m[i] = static_cast<double>(readF32()) * 10.0;
    }

    const double ax = m[0], ay = m[1], az = m[2];
    const double bx = m[3], by = m[4], bz = m[5];
    const double cx = m[6], cy = m[7], cz = m[8];

    const double A = std::sqrt(ax * ax + ay * ay + az * az);
    const double B = std::sqrt(bx * bx + by * by + bz * bz);
    const double C = std::sqrt(cx * cx + cy * cy + cz * cz);

    const double kDegPerRad = 57.29577951308232;
    double alpha = 90.0, beta = 90.0, gamma = 90.0;
    if (B > 0.0 && C > 0.0) alpha = std::acos((bx * cx + by * cy + bz * cz) / (B * C)) * kDegPerRad;
    if (A > 0.0 && C > 0.0) beta = std::acos((ax * cx + ay * cy + az * cz) / (A * C)) * kDegPerRad;
    if (A > 0.0 && B > 0.0) gamma = std::acos((ax * bx + ay * by + az * bz) / (A * B)) * kDegPerRad;

    cell[0] = static_cast<qfloat32>(A);
    cell[1] = static_cast<qfloat32>(B);
    cell[2] = static_cast<qfloat32>(C);
    cell[3] = static_cast<qfloat32>(alpha);
    cell[4] = static_cast<qfloat32>(beta);
    cell[5] = static_cast<qfloat32>(gamma);
}

float XdrInStream::readCompressedCoords(std::vector<qfloat32> &data, bool bLongFormat)
{
    const float precision = readF32();
    const int minint[3] = {readI32(), readI32(), readI32()};
    const int maxint[3] = {readI32(), readI32(), readI32()};
    // smallidx indexes MAGICINTS and moves up/down while decoding; the
    // encoder never writes one below FIRSTIDX (MAGICINTS[FIRSTIDX-1] == 0)
    const int kFirstIdx = static_cast<int>(FIRSTIDX);
    const int kLastIdx = static_cast<int>(LASTIDX);
    int smallidx = readI32();
    if (smallidx < kFirstIdx || smallidx >= kLastIdx) {
        MB_THROW(qlib::FileFormatException, "XTC: internal overflow (smallidx)");
        return precision;
    }

    quint32 sizeint[3];
    quint32 bitsizeint[3];
    const quint32 bitsize = calc_sizeint(minint, maxint, sizeint, bitsizeint);

    int smaller = MAGICINTS[std::max(kFirstIdx, smallidx - 1)] / 2;
    int smallnum = MAGICINTS[smallidx] / 2;
    quint32 sizesmall[3];
    sizesmall[0] = sizesmall[1] = sizesmall[2] = static_cast<quint32>(MAGICINTS[smallidx]);

    readOpaque(m_compressed, bLongFormat);
    m_intbuf.resize(data.size());

    const size_t natoms = data.size() / 3;
    DecodeState state = {0, 0, 0};
    int run = 0;
    int prevcoord[3];
    const float inv_precision = 1.0f / precision;
    size_t write_idx = 0;
    for (size_t read_idx = 0; read_idx < natoms; ++read_idx) {
        qint32 *thiscoord = m_intbuf.data() + read_idx * 3;
        qfloat32 *thiscoord_fl = data.data() + write_idx * 3;

        if (bitsize == 0) {
            thiscoord[0] = decodebits<int>(m_compressed, state, bitsizeint[0]);
            thiscoord[1] = decodebits<int>(m_compressed, state, bitsizeint[1]);
            thiscoord[2] = decodebits<int>(m_compressed, state, bitsizeint[2]);
        } else {
            decodeints(m_compressed, state, bitsize, sizeint, thiscoord);
        }

        thiscoord[0] += minint[0];
        thiscoord[1] += minint[1];
        thiscoord[2] += minint[2];

        prevcoord[0] = thiscoord[0];
        prevcoord[1] = thiscoord[1];
        prevcoord[2] = thiscoord[2];

        const bool flag = decodebits<int>(m_compressed, state, 1) != 0;
        int is_smaller = 0;
        if (flag) {
            run = decodebits<int>(m_compressed, state, 5);
            is_smaller = run % 3;
            run -= is_smaller;
            is_smaller--;
        }
        if (run > 0 && (write_idx + 1) * 3 + static_cast<size_t>(run) > data.size()) {
            MB_THROW(qlib::FileFormatException, "XTC: buffer overrun during decompression");
            return precision;
        }
        if (run > 0) {
            thiscoord = m_intbuf.data() + (read_idx + 1) * 3;
            for (int k = 0; k < run; k += 3) {
                decodeints(m_compressed, state, static_cast<quint32>(smallidx), sizesmall,
                           thiscoord);
                ++read_idx;
                thiscoord[0] += prevcoord[0] - smallnum;
                thiscoord[1] += prevcoord[1] - smallnum;
                thiscoord[2] += prevcoord[2] - smallnum;
                if (k == 0) {
                    // interchange first with second atom for better
                    // compression of water molecules
                    std::swap(thiscoord[0], prevcoord[0]);
                    std::swap(thiscoord[1], prevcoord[1]);
                    std::swap(thiscoord[2], prevcoord[2]);
                    thiscoord_fl[0] = static_cast<float>(prevcoord[0]) * inv_precision;
                    thiscoord_fl[1] = static_cast<float>(prevcoord[1]) * inv_precision;
                    thiscoord_fl[2] = static_cast<float>(prevcoord[2]) * inv_precision;
                    ++write_idx;
                    thiscoord_fl = data.data() + write_idx * 3;
                } else {
                    prevcoord[0] = thiscoord[0];
                    prevcoord[1] = thiscoord[1];
                    prevcoord[2] = thiscoord[2];
                }
                thiscoord_fl[0] = static_cast<float>(thiscoord[0]) * inv_precision;
                thiscoord_fl[1] = static_cast<float>(thiscoord[1]) * inv_precision;
                thiscoord_fl[2] = static_cast<float>(thiscoord[2]) * inv_precision;
                ++write_idx;
                thiscoord_fl = data.data() + write_idx * 3;
            }
        } else {
            thiscoord_fl[0] = static_cast<float>(thiscoord[0]) * inv_precision;
            thiscoord_fl[1] = static_cast<float>(thiscoord[1]) * inv_precision;
            thiscoord_fl[2] = static_cast<float>(thiscoord[2]) * inv_precision;
            ++write_idx;
            thiscoord_fl = data.data() + write_idx * 3;
        }
        if (is_smaller < 0) {
            --smallidx;
            smallnum = smaller;
            if (smallidx > kFirstIdx) {
                smaller = MAGICINTS[smallidx - 1] / 2;
            } else {
                smaller = 0;
            }
        } else if (is_smaller > 0) {
            ++smallidx;
            if (smallidx >= kLastIdx) {
                MB_THROW(qlib::FileFormatException, "XTC: internal overflow (smallidx)");
                return precision;
            }
            smaller = smallnum;
            smallnum = MAGICINTS[smallidx] / 2;
        }
        // MAGICINTS[smallidx] == 0 below FIRSTIDX: caught by the size check
        sizesmall[0] = sizesmall[1] = sizesmall[2] = static_cast<quint32>(MAGICINTS[smallidx]);
        if (sizesmall[0] == 0) {
            MB_THROW(qlib::FileFormatException, "XTC: invalid size during decompression");
            return precision;
        }
    }

    return precision;
}
