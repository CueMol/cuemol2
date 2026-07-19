// -*-Mode: C++;-*-
//
// NetCDF 3 (classic) big-endian input stream for AMBER trajectories.
//
// Parses the NetCDF 3 header (dimensions, global attributes, variables) and
// reads record data one frame at a time, forward-only (no seek). Supports the
// CDF-1 (32-bit offset), CDF-2 (64-bit offset) and CDF-5 (64-bit header)
// variants. Only the subset needed for the AMBER convention is implemented
// (coordinates plus an optional periodic cell).
//
// The NetCDF 3 header layout and record model are adapted from chemfiles
// (BSD-3-clause, src/files/Netcdf3File.cpp), following the NetCDF classic
// format specification. NetCDF 3 external data is stored big-endian.
//

#ifndef MDTOOLS_NETCDF3_IN_STREAM_HPP_INCLUDED
#define MDTOOLS_NETCDF3_IN_STREAM_HPP_INCLUDED

#include "mdtools.hpp"

#include <qlib/BinStream.hpp>
#include <qlib/LString.hpp>

#include <map>
#include <vector>

namespace mdtools {

/// NetCDF 3 data-type and structure-tag identifiers (subset).
enum {
    NC3_BYTE = 1,
    NC3_CHAR = 2,
    NC3_SHORT = 3,
    NC3_INT = 4,
    NC3_FLOAT = 5,
    NC3_DOUBLE = 6,
    NC3_DIMENSION = 10,
    NC3_VARIABLE = 11,
    NC3_ATTRIBUTE = 12,
};

/// A NetCDF 3 dimension (name and size; a size of 0 marks the record dimension).
struct NcDim
{
    qlib::LString name;
    qint64 size;
    bool isRecord() const { return size == 0; }
};

/// A minimal NetCDF 3 attribute value (a string, or a single numeric scalar).
struct NcValue
{
    enum
    {
        STRING,
        NUM
    } kind;
    qlib::LString str;
    double num;

    NcValue() : kind(NUM), num(0.0) {}
};

/// A NetCDF 3 variable (header metadata only; data is read on demand).
struct NcVar
{
    qlib::LString name;
    std::vector<int> dimIds;
    qint32 type;
    qint64 vsize;      // bytes of one record entry (record var) / full array
    qint64 count;      // element count of one record entry / full array
    qint64 begin;      // absolute file offset of the first byte
    qint64 relOffset;  // begin - recordDataStart (record vars only)
    bool isRecord;
    double scale;  // scale_factor attribute (1.0 if absent)
    std::map<qlib::LString, NcValue> attrs;

    NcVar() : type(0), vsize(0), count(0), begin(0), relOffset(0), isRecord(false), scale(1.0) {}
};

///
/// NetCDF 3 big-endian input filter over a qlib::InStream (read-only,
/// forward-streaming). See the file header for provenance.
///
/// The byte-swap mode is selected from the host byte order at construction, so
/// the primitive readers return correct host-native values on both little- and
/// big-endian hosts.
///
class MDTOOLS_API Netcdf3InStream : public qlib::BinInStream
{
    typedef qlib::BinInStream super_t;

public:
    explicit Netcdf3InStream(qlib::InStream &ins);

    ~Netcdf3InStream() override;

    /// Parse the header (magic/version/dims/global-attrs/vars). Throws
    /// qlib::FileFormatException on a non-CDF or unsupported layout.
    void parseHeader();

    // ---- Queries (valid after parseHeader) ----

    /// Value of the "Conventions" global attribute ("" if absent).
    qlib::LString getConvention() const { return m_convention; }

    /// The "atom" dimension size (0 if absent).
    int getNatoms() const { return m_natoms; }

    /// true when both cell_lengths and cell_angles variables are present.
    bool hasCell() const { return m_pCellLen != nullptr && m_pCellAng != nullptr; }

    /// Number of frames (record count); -1 when unknown (streaming).
    int getNumFrames() const;

    /// true when the file has a record (frame) dimension.
    bool hasRecordDim() const { return m_hasRecordDim; }

    /// Forward-read the next frame. coords is resized to natoms*3 (interleaved
    /// xyz, Angstrom); cell[6] = {a, b, c, alpha, beta, gamma} is filled only
    /// when hasCell(). Returns false on a clean record-boundary end of stream;
    /// throws qlib::EOFException on a truncated record.
    bool readFrame(std::vector<qfloat32> &coords, qfloat32 cell[6]);

private:
    // Header sub-parsers.
    void readDimList();
    std::map<qlib::LString, NcValue> readAttrList();
    NcValue readAttrValue();
    void readVarList();
    qlib::LString readPascalString();
    void skipPadding(qint64 size);

    // Position-tracked big-endian primitives.
    qint32 readI32()
    {
        qint32 v = tread<qint32>();
        m_pos += 4;
        return v;
    }
    qint64 readI64()
    {
        qint64 v = tread<qint64>();
        m_pos += 8;
        return v;
    }
    quint64 readU64()
    {
        quint64 v = tread<quint64>();
        m_pos += 8;
        return v;
    }
    qfloat32 readF32()
    {
        qfloat32 v = tread<qfloat32>();
        m_pos += 4;
        return v;
    }
    qfloat64 readF64()
    {
        qfloat64 v = tread<qfloat64>();
        m_pos += 8;
        return v;
    }
    /// Header-width non-negative integer (i32 for CDF-1/2, i64 for CDF-5).
    qint64 readHdrInt() { return m_b64header ? readI64() : static_cast<qint64>(readI32()); }

    void readCharN(char *dst, qint64 n);
    void skipBytes(qint64 n);
    void seekForward(qint64 absTarget);

    /// EOF-tolerant bulk read used to detect a clean record-boundary end of
    /// stream. Returns false when zero bytes remain; throws on a partial read.
    bool bulkReadTolerant(char *dst, qint64 n);

    // Decode a big-endian scalar from the in-memory record buffer.
    qfloat32 decF32(const char *p) const;
    qfloat64 decF64(const char *p) const;
    void extractArray(const NcVar &v, const std::vector<char> &rec,
                      std::vector<qfloat32> &out) const;
    void extractVec3(const NcVar &v, const std::vector<char> &rec, qfloat32 *out3) const;

    const NcVar *findVar(const char *name) const;

    // ---- State ----

    bool m_bSwap;      // host is little-endian (big-endian data must be swapped)
    qint64 m_pos;      // absolute bytes consumed
    bool m_b64header;  // CDF-5: dims/counts/sizes/pascal-lengths are 64-bit
    bool m_b64offset;  // CDF-2/5: variable offset field is 64-bit
    qint64 m_numRecs;
    bool m_bStreaming;  // numrecs was the STREAMING sentinel
    qint64 m_recordSize;
    qint64 m_recordDataStart;
    int m_frame;       // next record index for readFrame
    bool m_atRecStart;  // seeked to the record data start yet?

    int m_natoms;
    bool m_hasRecordDim;
    qlib::LString m_convention;

    std::vector<NcDim> m_dims;
    std::map<qlib::LString, NcValue> m_gatts;
    std::vector<NcVar> m_vars;
    const NcVar *m_pCoord;
    const NcVar *m_pCellLen;
    const NcVar *m_pCellAng;

    std::vector<char> m_recbuf;  // reused per-frame record buffer
};

}  // namespace mdtools

#endif
