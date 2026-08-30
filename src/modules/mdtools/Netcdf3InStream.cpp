// -*-Mode: C++;-*-
//
// NetCDF 3 (classic) big-endian input stream for AMBER trajectories.
//
// The NetCDF 3 header layout and record model are adapted from chemfiles
// (BSD-3-clause, src/files/Netcdf3File.cpp), following the NetCDF classic
// format specification.
//

#include <common.h>

#include "Netcdf3InStream.hpp"

#include <qlib/LExceptions.hpp>

#include <algorithm>
#include <climits>
#include <cstring>

using namespace mdtools;
using qlib::LString;

namespace {

// Host byte order is little-endian when int32 is stored LE. NetCDF 3 data is
// big-endian, so a little-endian host must byte-swap.
bool hostIsLittleEndian()
{
    return qlib::BinOutStream::getIntByteOrder() == qlib::BinOutStream::INTBO_LE;
}

// Number of padding bytes needed to align size to a 4-byte boundary.
qint64 nc3Padding(qint64 size)
{
    return (4 - (size % 4)) % 4;
}

// Byte size of a NetCDF 3 element type (0 for unknown types).
qint64 sizeofNcType(qint32 type)
{
    switch (type) {
    case NC3_BYTE:
    case NC3_CHAR:
        return 1;
    case NC3_SHORT:
        return 2;
    case NC3_INT:
    case NC3_FLOAT:
        return 4;
    case NC3_DOUBLE:
        return 8;
    default:
        return 0;
    }
}

}  // anonymous namespace

///////////////////////////////////////////////////////////////////////////

Netcdf3InStream::Netcdf3InStream(qlib::InStream &ins)
    : super_t(ins),
      m_pos(0),
      m_b64header(false),
      m_b64offset(false),
      m_numRecs(0),
      m_bStreaming(false),
      m_recordSize(0),
      m_recordDataStart(0),
      m_frame(0),
      m_atRecStart(false),
      m_natoms(0),
      m_hasRecordDim(false),
      m_pCoord(nullptr),
      m_pCellLen(nullptr),
      m_pCellAng(nullptr)
{
    m_bSwap = hostIsLittleEndian();
    setSwapMode(m_bSwap ? MODE_SWAP : MODE_NOOP);
}

Netcdf3InStream::~Netcdf3InStream() {}

///////////////////////////////////////////////////////////////////////////
// Low-level primitives (position-tracked).

void Netcdf3InStream::readCharN(char *dst, qint64 n)
{
    if (n <= 0) return;
    readFully(dst, 0, static_cast<int>(n));
    m_pos += n;
}

void Netcdf3InStream::skipBytes(qint64 n)
{
    while (n > 0) {
        int chunk = static_cast<int>(std::min<qint64>(n, INT_MAX));
        int s = skip(chunk);
        if (s <= 0) {
            MB_THROW(qlib::EOFException, "NetCDF3: truncated stream while skipping");
            return;
        }
        n -= s;
        m_pos += s;
    }
}

void Netcdf3InStream::skipPadding(qint64 size)
{
    const qint64 pad = nc3Padding(size);
    if (pad > 0) skipBytes(pad);
}

void Netcdf3InStream::seekForward(qint64 absTarget)
{
    if (absTarget < m_pos) {
        MB_THROW(qlib::RuntimeException, "NetCDF3: backward seek not supported");
        return;
    }
    skipBytes(absTarget - m_pos);
}

bool Netcdf3InStream::bulkReadTolerant(char *dst, qint64 n)
{
    if (n <= 0) return false;
    qint64 total = 0;
    while (total < n) {
        int want = static_cast<int>(std::min<qint64>(n - total, INT_MAX));
        int r = read(dst, static_cast<int>(total), want);
        if (r <= 0) break;
        total += r;
    }
    if (total == 0) return false;  // clean end of stream at a record boundary
    if (total < n) {
        MB_THROW(qlib::EOFException, "NetCDF3: truncated record");
        return false;
    }
    return true;
}

qfloat32 Netcdf3InStream::decF32(const char *p) const
{
    qfloat32 v;
    if (m_bSwap) {
        char b[4] = {p[3], p[2], p[1], p[0]};
        std::memcpy(&v, b, 4);
    } else {
        std::memcpy(&v, p, 4);
    }
    return v;
}

qfloat64 Netcdf3InStream::decF64(const char *p) const
{
    qfloat64 v;
    if (m_bSwap) {
        char b[8] = {p[7], p[6], p[5], p[4], p[3], p[2], p[1], p[0]};
        std::memcpy(&v, b, 8);
    } else {
        std::memcpy(&v, p, 8);
    }
    return v;
}

///////////////////////////////////////////////////////////////////////////
// Header parsing.

LString Netcdf3InStream::readPascalString()
{
    const qint64 size = readHdrInt();
    if (size <= 0) {
        skipPadding(size);
        return LString();
    }
    std::vector<char> buf(static_cast<size_t>(size));
    readCharN(buf.data(), size);
    skipPadding(size);
    return LString(buf.data(), static_cast<int>(size));
}

NcValue Netcdf3InStream::readAttrValue()
{
    const qint32 type = readI32();
    const qint64 count = readHdrInt();
    const qint64 esize = sizeofNcType(type);
    if (esize == 0) {
        MB_THROW(qlib::FileFormatException, "NetCDF3: unknown attribute type");
        return NcValue();
    }

    NcValue val;
    if (type == NC3_CHAR) {
        val.kind = NcValue::STRING;
        if (count > 0) {
            std::vector<char> buf(static_cast<size_t>(count));
            readCharN(buf.data(), count);
            val.str = LString(buf.data(), static_cast<int>(count));
        }
    } else {
        // Numeric: keep the first value (as double); consume the rest.
        for (qint64 j = 0; j < count; ++j) {
            double d = 0.0;
            switch (type) {
            case NC3_BYTE: {
                char c;
                readCharN(&c, 1);
                d = static_cast<double>(c);
                break;
            }
            case NC3_SHORT: {
                qint16 s = tread<qint16>();
                m_pos += 2;
                d = static_cast<double>(s);
                break;
            }
            case NC3_INT:
                d = static_cast<double>(readI32());
                break;
            case NC3_FLOAT:
                d = static_cast<double>(readF32());
                break;
            case NC3_DOUBLE:
                d = readF64();
                break;
            default:
                break;
            }
            if (j == 0) {
                val.kind = NcValue::NUM;
                val.num = d;
            }
        }
    }

    skipPadding(count * esize);
    return val;
}

std::map<LString, NcValue> Netcdf3InStream::readAttrList()
{
    const qint32 marker = readI32();
    if (marker != NC3_ATTRIBUTE && marker != 0) {
        MB_THROW(qlib::FileFormatException, "NetCDF3: expected NC_ATTRIBUTE tag");
        return std::map<LString, NcValue>();
    }
    const qint64 count = readHdrInt();

    std::map<LString, NcValue> result;
    for (qint64 i = 0; i < count; ++i) {
        LString name = readPascalString();
        NcValue val = readAttrValue();
        result[name] = val;
    }
    return result;
}

void Netcdf3InStream::readDimList()
{
    const qint32 marker = readI32();
    if (marker != NC3_DIMENSION && marker != 0) {
        MB_THROW(qlib::FileFormatException, "NetCDF3: expected NC_DIMENSION tag");
        return;
    }
    const qint64 count = readHdrInt();

    for (qint64 i = 0; i < count; ++i) {
        NcDim dim;
        dim.name = readPascalString();
        dim.size = readHdrInt();
        m_dims.push_back(dim);
    }
}

void Netcdf3InStream::readVarList()
{
    const qint32 marker = readI32();
    if (marker != NC3_VARIABLE && marker != 0) {
        MB_THROW(qlib::FileFormatException, "NetCDF3: expected NC_VARIABLE tag");
        return;
    }
    const qint64 count = readHdrInt();

    for (qint64 vi = 0; vi < count; ++vi) {
        NcVar var;
        var.name = readPascalString();

        const qint64 ndims = readHdrInt();
        bool isRec = false;
        for (qint64 i = 0; i < ndims; ++i) {
            const qint64 id = readHdrInt();
            if (id < 0 || id >= static_cast<qint64>(m_dims.size())) {
                MB_THROW(qlib::FileFormatException, "NetCDF3: dimension id out of range");
                return;
            }
            var.dimIds.push_back(static_cast<int>(id));
            if (m_dims[static_cast<size_t>(id)].isRecord()) isRec = true;
        }

        var.attrs = readAttrList();
        var.type = readI32();
        readHdrInt();  // size_with_padding (unreliable; recomputed below)
        // This is the only field whose width depends on the 64-bit offset flag.
        var.begin = m_b64offset ? readI64() : static_cast<qint64>(readI32());
        var.isRecord = isRec;

        const qint64 esize = sizeofNcType(var.type);
        if (esize == 0) {
            MB_THROW(qlib::FileFormatException, "NetCDF3: unknown variable type");
            return;
        }
        qint64 sz = esize;
        for (int id : var.dimIds) {
            if (!m_dims[static_cast<size_t>(id)].isRecord())
                sz *= m_dims[static_cast<size_t>(id)].size;
        }
        var.vsize = sz;
        var.count = sz / esize;

        var.scale = 1.0;
        std::map<LString, NcValue>::const_iterator it = var.attrs.find(LString("scale_factor"));
        if (it != var.attrs.end() && it->second.kind == NcValue::NUM) var.scale = it->second.num;

        m_vars.push_back(var);
    }

    // Compute the record entry size and the start of the record data region.
    m_recordSize = 0;
    qint64 minBegin = -1;
    for (const NcVar &v : m_vars) {
        if (!v.isRecord) continue;
        m_recordSize += v.vsize + nc3Padding(v.vsize);
        if (minBegin < 0 || v.begin < minBegin) minBegin = v.begin;
    }
    m_recordDataStart = (minBegin < 0) ? m_pos : minBegin;
    for (NcVar &v : m_vars) {
        if (v.isRecord) v.relOffset = v.begin - m_recordDataStart;
    }

    // A record variable placed outside the record entry (corrupt or
    // inconsistent header) would be read past the record buffer.
    for (const NcVar &v : m_vars) {
        if (!v.isRecord) continue;
        if (v.relOffset < 0 || v.relOffset + v.vsize > m_recordSize) {
            MB_THROW(qlib::FileFormatException,
                     "NetCDF3: record variable lies outside the record entry");
        }
    }
}

void Netcdf3InStream::parseHeader()
{
    // Magic "CDF" + version byte.
    char magic[4];
    readCharN(magic, 4);
    if (magic[0] != 'C' || magic[1] != 'D' || magic[2] != 'F') {
        MB_THROW(qlib::FileFormatException, "NetCDF3: not a CDF file");
        return;
    }
    const int version = static_cast<unsigned char>(magic[3]);
    if (version == 1) {
        m_b64header = false;
        m_b64offset = false;
    } else if (version == 2) {
        m_b64header = false;
        m_b64offset = true;
    } else if (version == 5) {
        m_b64header = true;
        m_b64offset = true;
    } else {
        MB_THROW(qlib::FileFormatException, "NetCDF3: unsupported CDF version");
        return;
    }

    // Number of records (frames). A STREAMING sentinel means "unknown".
    if (m_b64header) {
        quint64 nr = readU64();
        if (nr == 0xFFFFFFFFFFFFFFFFull) {
            m_bStreaming = true;
            m_numRecs = 0;
        } else {
            m_numRecs = static_cast<qint64>(nr);
        }
    } else {
        qint32 nr = readI32();
        if (static_cast<quint32>(nr) == 0xFFFFFFFFu) {
            m_bStreaming = true;
            m_numRecs = 0;
        } else {
            m_numRecs = nr;
        }
    }

    readDimList();
    m_gatts = readAttrList();
    readVarList();

    // Resolve the variables and dimensions the AMBER layer needs.
    m_pCoord = findVar("coordinates");
    m_pCellLen = findVar("cell_lengths");
    m_pCellAng = findVar("cell_angles");

    for (const NcDim &d : m_dims) {
        if (d.name == "atom") m_natoms = static_cast<int>(d.size);
        if (d.isRecord()) m_hasRecordDim = true;
    }

    std::map<LString, NcValue>::const_iterator it = m_gatts.find(LString("Conventions"));
    if (it != m_gatts.end() && it->second.kind == NcValue::STRING) m_convention = it->second.str;
}

///////////////////////////////////////////////////////////////////////////

const NcVar *Netcdf3InStream::findVar(const char *name) const
{
    for (const NcVar &v : m_vars) {
        if (v.name == name) return &v;
    }
    return nullptr;
}

int Netcdf3InStream::getNumFrames() const
{
    return m_bStreaming ? -1 : static_cast<int>(m_numRecs);
}

void Netcdf3InStream::extractArray(const NcVar &v, const std::vector<char> &rec,
                                   std::vector<qfloat32> &out) const
{
    out.resize(static_cast<size_t>(v.count));
    const char *base = rec.data() + v.relOffset;
    if (v.type == NC3_FLOAT) {
        for (qint64 i = 0; i < v.count; ++i)
            out[static_cast<size_t>(i)] =
                decF32(base + i * 4) * static_cast<qfloat32>(v.scale);
    } else if (v.type == NC3_DOUBLE) {
        for (qint64 i = 0; i < v.count; ++i)
            out[static_cast<size_t>(i)] =
                static_cast<qfloat32>(decF64(base + i * 8) * v.scale);
    } else {
        MB_THROW(qlib::FileFormatException, "NetCDF3: coordinates must be float or double");
    }
}

void Netcdf3InStream::extractVec3(const NcVar &v, const std::vector<char> &rec, qfloat32 *out3) const
{
    const char *base = rec.data() + v.relOffset;
    if (v.type == NC3_FLOAT) {
        for (int i = 0; i < 3; ++i) out3[i] = decF32(base + i * 4) * static_cast<qfloat32>(v.scale);
    } else if (v.type == NC3_DOUBLE) {
        for (int i = 0; i < 3; ++i)
            out3[i] = static_cast<qfloat32>(decF64(base + i * 8) * v.scale);
    } else {
        MB_THROW(qlib::FileFormatException, "NetCDF3: cell must be float or double");
    }
}

bool Netcdf3InStream::readFrame(std::vector<qfloat32> &coords, qfloat32 cell[6])
{
    if (m_pCoord == nullptr) {
        MB_THROW(qlib::FileFormatException, "NetCDF3: missing coordinates variable");
        return false;
    }

    // Skip past any leading non-record data on the first frame.
    if (!m_atRecStart) {
        seekForward(m_recordDataStart);
        m_atRecStart = true;
    }

    // Stop at the recorded frame count (when known).
    if (!m_bStreaming && m_frame >= static_cast<int>(m_numRecs)) return false;

    m_recbuf.resize(static_cast<size_t>(m_recordSize));
    if (!bulkReadTolerant(m_recbuf.data(), m_recordSize)) return false;  // clean EOF
    m_pos += m_recordSize;

    extractArray(*m_pCoord, m_recbuf, coords);
    if (hasCell()) {
        extractVec3(*m_pCellLen, m_recbuf, cell);
        extractVec3(*m_pCellAng, m_recbuf, cell + 3);
    }

    ++m_frame;
    return true;
}
