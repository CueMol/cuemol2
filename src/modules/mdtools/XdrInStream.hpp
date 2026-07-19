// -*-Mode: C++;-*-
//
// XDR (RFC 4506) big-endian input stream with GROMACS helpers.
//
// Reads XDR-encoded scalars/opaque data used by the GROMACS XTC/TRR
// trajectory formats, plus the lossy 3D-coordinate decompression used by XTC.
//
// The 3D-coordinate decompression is adapted from chemfiles (BSD-3-clause,
// src/files/XDRFile.cpp). The underlying algorithm is originally by
// Frans van Hoesel (Europort project, 1995) as used in GROMACS.
//

#ifndef MDTOOLS_XDR_IN_STREAM_HPP_INCLUDED
#define MDTOOLS_XDR_IN_STREAM_HPP_INCLUDED

#include "mdtools.hpp"

#include <qlib/BinStream.hpp>
#include <vector>

namespace mdtools {

///
/// XDR big-endian input filter over a qlib::InStream.
///
/// XDR data is always big-endian; this stream selects the byte-swap mode from
/// the host byte order at construction, so readI32/readF32/readF64 return
/// correct host-native values on both little- and big-endian hosts.
///
class MDTOOLS_API XdrInStream : public qlib::BinInStream
{
    typedef qlib::BinInStream super_t;

public:
    explicit XdrInStream(qlib::InStream &ins);

    ~XdrInStream() override;

    /// Read a big-endian int32/uint32.
    qint32 readI32() { return tread<qint32>(); }
    quint32 readU32() { return static_cast<quint32>(tread<qint32>()); }

    /// Read a big-endian float32/float64.
    qfloat32 readF32() { return tread<qfloat32>(); }
    qfloat64 readF64() { return tread<qfloat64>(); }

    /// Read an int32 at a frame boundary. Returns false on a clean end of
    /// stream (zero bytes available); throws qlib::EOFException on a partial
    /// (truncated) read.
    bool readI32opt(qint32 &out);

    /// Read a non-compliant GROMACS string (int32 length-with-null, then XDR
    /// opaque bytes without the terminator).
    qlib::LString readGmxString();

    /// Read the GROMACS 3x3 simulation box (nm) and convert to a 6-value cell
    /// {a, b, c, alpha, beta, gamma} in Angstrom / degrees.
    void readGmxBox(bool bDouble, qfloat32 cell[6]);

    /// Read ncoord big-endian float32 values into out.
    void readF32Array(qfloat32 *out, int ncoord);

    /// Read GROMACS-compressed 3D coordinates into out (pre-sized to
    /// natoms*3). Returns the coordinate precision. Coordinates are in the
    /// file's native unit (nm); the caller scales to Angstrom.
    float readCompressedCoords(std::vector<qfloat32> &out, bool bLongFormat);

    /// Skip nbytes of the underlying stream.
    void skipBytes(qint64 nbytes);

private:
    /// Read XDR variable-length opaque data (with 4-byte padding).
    void readOpaque(std::vector<char> &data, bool bLongFormat);

    /// true when the host is little-endian and XDR big-endian data must be
    /// byte-swapped.
    bool m_bSwap;

    /// Cache allocation for the compressed byte block (XTC).
    std::vector<char> m_compressed;

    /// Cache allocation for the intermediate integer buffer (XTC).
    std::vector<qint32> m_intbuf;
};

}  // namespace mdtools

#endif
