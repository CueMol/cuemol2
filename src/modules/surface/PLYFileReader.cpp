// -*-Mode: C++;-*-
//
// PLY (Stanford Polygon File) surface data reader
//

#include <common.h>

#include "PLYFileReader.hpp"
#include "MolSurfObj.hpp"
#include "MSGeomTypes.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LineStream.hpp>
#include <qlib/BinStream.hpp>

#include <vector>
#include <string>

using namespace surface;
using qlib::LString;
using qlib::Vector4D;

namespace {

  ////////////////////////////////////////////////
  // PLY header description

  enum Format
  {
    FMT_ASCII,
    FMT_BIN_LE,
    FMT_BIN_BE
  };

  enum DType
  {
    T_I8, T_U8, T_I16, T_U16, T_I32, T_U32, T_F32, T_F64, T_NONE
  };

  struct Prop
  {
    LString name;
    bool isList;
    DType countType;  // list count type (valid when isList)
    DType type;       // scalar type, or list item type
    Prop() : isList(false), countType(T_NONE), type(T_NONE) {}
  };

  struct Element
  {
    LString name;
    int count;
    std::vector<Prop> props;
    Element() : count(0) {}
  };

  DType parseType(const LString &s)
  {
    if (s.equals("char")   || s.equals("int8"))    return T_I8;
    if (s.equals("uchar")  || s.equals("uint8"))   return T_U8;
    if (s.equals("short")  || s.equals("int16"))   return T_I16;
    if (s.equals("ushort") || s.equals("uint16"))  return T_U16;
    if (s.equals("int")    || s.equals("int32"))   return T_I32;
    if (s.equals("uint")   || s.equals("uint32"))  return T_U32;
    if (s.equals("float")  || s.equals("float32")) return T_F32;
    if (s.equals("double") || s.equals("float64")) return T_F64;
    return T_NONE;
  }

  bool isIndexName(const LString &n)
  {
    return n.equals("vertex_indices") || n.equals("vertex_index");
  }

  /// Split a line into whitespace-separated tokens (drops empty tokens).
  void splitTokens(const LString &line, std::vector<LString> &toks)
  {
    qlib::LStringList ls;
    line.split_of(" \t", ls);
    toks.clear();
    for (qlib::LStringList::const_iterator i = ls.begin(); i != ls.end(); ++i)
      toks.push_back(*i);
  }

  /// Capture x/y/z/nx/ny/nz from a named scalar property; ignore the rest
  /// (color, texture coords, etc.) because MolSurfObj keeps no extra fields.
  void captureVert(const LString &name, double v, Vector4D &pos, Vector4D &nrm)
  {
    if (name.equals("x")) pos.x() = v;
    else if (name.equals("y")) pos.y() = v;
    else if (name.equals("z")) pos.z() = v;
    else if (name.equals("nx")) nrm.x() = v;
    else if (name.equals("ny")) nrm.y() = v;
    else if (name.equals("nz")) nrm.z() = v;
  }

  ////////////////////////////////////////////////
  // binary value readers (swap mode is set on bins beforehand)

  double readBinScalar(qlib::BinInStream &bins, DType t)
  {
    switch (t) {
    case T_I8:  return (double) bins.tread<qint8>();
    case T_U8:  return (double) bins.tread<quint8>();
    case T_I16: return (double) bins.tread<qint16>();
    case T_U16: return (double) bins.tread<quint16>();
    case T_I32: return (double) bins.tread<qint32>();
    case T_U32: return (double) bins.tread<quint32>();
    case T_F32: return (double) bins.tread<qfloat32>();
    case T_F64: return (double) bins.tread<double>();
    default:    return 0.0;
    }
  }

  long readBinInt(qlib::BinInStream &bins, DType t)
  {
    return (long) readBinScalar(bins, t);
  }

}  // anonymous namespace

/////////////////////////////////////////////////

PLYFileReader::PLYFileReader()
     : m_pSurf(NULL)
{
}

PLYFileReader::~PLYFileReader()
{
}

const char *PLYFileReader::getName() const
{
  return "ply";
}

const char *PLYFileReader::getTypeDescr() const
{
  return "PLY polygon file (*.ply)";
}

const char *PLYFileReader::getFileExt() const
{
  return "*.ply";
}

qsys::ObjectPtr PLYFileReader::createDefaultObj() const
{
  return qsys::ObjectPtr(new MolSurfObj());
}

/// Content sniff: every PLY file begins with the literal magic line "ply"
/// (the header is ascii even for the binary variants).
int PLYFileReader::canHandleContent(qlib::InStream &ins) const
{
  qlib::LineStream lin(ins);
  while (lin.ready()) {
    LString line = lin.readLine().trim(" \t\r\n");
    if (line.isEmpty()) continue;
    if (line.equals("ply")) return CONTENT_YES;
    // first non-empty line is not the magic -> not a PLY file (no opinion)
    return CONTENT_UNKNOWN;
  }
  return CONTENT_UNKNOWN;
}

void PLYFileReader::attach(qsys::ObjectPtr pObj)
{
  super_t::attach(pObj);
  m_pSurf = getTarget<MolSurfObj>();
}

qsys::ObjectPtr PLYFileReader::detach()
{
  m_pSurf = NULL;
  return super_t::detach();
}

/////////////////////////////////////////////////

namespace {

  /// Read one header line byte-by-byte. BinInStream never reads ahead, so the
  /// stream cursor stops exactly after the line's '\n' -- the binary body that
  /// may follow end_header stays intact for the body reader.
  bool readHeaderLine(qlib::BinInStream &bins, LString &out)
  {
    std::string buf;
    for (;;) {
      int c = bins.read();
      if (c < 0) {
        // EOF
        if (buf.empty()) return false;
        break;
      }
      if (c == '\n') break;
      if (c == '\r') continue;
      buf.push_back((char) c);
    }
    out = LString(buf);
    return true;
  }

  /// Read the next non-empty ascii body line; false at EOF.
  bool nextAsciiLine(qlib::LineStream &lis, LString &out)
  {
    while (lis.ready()) {
      LString line = lis.readLine().trim(" \t\r\n");
      if (line.isEmpty()) continue;
      out = line;
      return true;
    }
    return false;
  }

  /// Fan-triangulate a polygon (idx[0],idx[j],idx[j+1]) into MSFace triangles.
  void triangulate(const std::vector<int> &idx, int nverts,
                   std::vector<surface::MSFace> &faces)
  {
    if (idx.size() < 3) return;
    for (size_t j = 1; j + 1 < idx.size(); ++j) {
      int a = idx[0], b = idx[j], c = idx[j + 1];
      if (a < 0 || a >= nverts || b < 0 || b >= nverts || c < 0 || c >= nverts) {
        MB_THROW(qlib::FileFormatException,
                 "PLYRead> FATAL Error: face vertex index out of range.");
      }
      surface::MSFace f;
      f.id1 = a;
      f.id2 = b;
      f.id3 = c;
      faces.push_back(f);
    }
  }

  /// Index of the list property used as the face vertex list: the one named
  /// vertex_indices/vertex_index, else the first list property; -1 if none.
  int findIndexProp(const Element &face)
  {
    int fallback = -1;
    for (size_t pi = 0; pi < face.props.size(); ++pi) {
      if (!face.props[pi].isList) continue;
      if (fallback < 0) fallback = (int) pi;
      if (isIndexName(face.props[pi].name)) return (int) pi;
    }
    return fallback;
  }

  /// Recompute vertex normals from the triangle geometry (area-weighted sum of
  /// face normals). Used when the PLY file has no nx/ny/nz properties.
  void computeNormals(surface::MolSurfObj *pSurf)
  {
    const int nv = pSurf->getVertSize();
    const int nf = pSurf->getFaceSize();
    surface::MSVert *pv = pSurf->getVertPtr();
    surface::MSFace *pf = pSurf->getFacePtr();

    for (int i = 0; i < nv; ++i) {
      pv[i].nx = 0.0f;
      pv[i].ny = 0.0f;
      pv[i].nz = 0.0f;
    }

    for (int i = 0; i < nf; ++i) {
      const int i1 = pf[i].id1, i2 = pf[i].id2, i3 = pf[i].id3;
      const Vector4D a(pv[i1].x, pv[i1].y, pv[i1].z);
      const Vector4D b(pv[i2].x, pv[i2].y, pv[i2].z);
      const Vector4D c(pv[i3].x, pv[i3].y, pv[i3].z);
      // length of the cross product is twice the triangle area -> area weight
      const Vector4D fn = (b - a).cross(c - a);
      pv[i1].nx += (float) fn.x();  pv[i1].ny += (float) fn.y();  pv[i1].nz += (float) fn.z();
      pv[i2].nx += (float) fn.x();  pv[i2].ny += (float) fn.y();  pv[i2].nz += (float) fn.z();
      pv[i3].nx += (float) fn.x();  pv[i3].ny += (float) fn.y();  pv[i3].nz += (float) fn.z();
    }

    for (int i = 0; i < nv; ++i) {
      Vector4D n(pv[i].nx, pv[i].ny, pv[i].nz);
      const double len = n.length();
      if (len > 0.0) {
        pv[i].nx = (float) (n.x() / len);
        pv[i].ny = (float) (n.y() / len);
        pv[i].nz = (float) (n.z() / len);
      }
    }
  }

}  // anonymous namespace

bool PLYFileReader::read(qlib::InStream &ins)
{
  MB_ASSERT(m_pSurf != NULL);

  qlib::BinInStream bins(ins);

  //////////
  // Parse the (always-ascii) header.

  std::vector<Element> elems;
  Format fmt = FMT_ASCII;
  bool gotFormat = false;
  bool endHeader = false;

  LString line;
  if (!readHeaderLine(bins, line) || !line.trim(" \t\r\n").equals("ply")) {
    MB_THROW(qlib::FileFormatException,
             "PLYRead> FATAL Error: not a PLY file (missing 'ply' magic line).");
    return false;
  }

  while (readHeaderLine(bins, line)) {
    LString tline = line.trim(" \t\r\n");
    if (tline.isEmpty()) continue;

    std::vector<LString> toks;
    splitTokens(tline, toks);
    if (toks.empty()) continue;

    const LString &kw = toks[0];
    if (kw.equals("comment") || kw.equals("obj_info")) {
      // ignore
    }
    else if (kw.equals("format")) {
      if (toks.size() < 2)
        MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: invalid format line.");
      if (toks[1].equals("ascii")) fmt = FMT_ASCII;
      else if (toks[1].equals("binary_little_endian")) fmt = FMT_BIN_LE;
      else if (toks[1].equals("binary_big_endian")) fmt = FMT_BIN_BE;
      else
        MB_THROW(qlib::FileFormatException,
                 LString::format("PLYRead> FATAL Error: unsupported format '%s'.", toks[1].c_str()));
      gotFormat = true;
    }
    else if (kw.equals("element")) {
      if (toks.size() < 3)
        MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: invalid element line.");
      Element e;
      e.name = toks[1];
      if (!toks[2].toInt(&e.count) || e.count < 0)
        MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: invalid element count.");
      elems.push_back(e);
    }
    else if (kw.equals("property")) {
      if (elems.empty())
        MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: property without element.");
      Prop p;
      if (toks.size() >= 2 && toks[1].equals("list")) {
        if (toks.size() < 5)
          MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: invalid list property.");
        p.isList = true;
        p.countType = parseType(toks[2]);
        p.type = parseType(toks[3]);
        p.name = toks[4];
      }
      else {
        if (toks.size() < 3)
          MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: invalid property line.");
        p.isList = false;
        p.type = parseType(toks[1]);
        p.name = toks[2];
      }
      elems.back().props.push_back(p);
    }
    else if (kw.equals("end_header")) {
      endHeader = true;
      break;
    }
    // unknown header keywords are ignored
  }

  if (!gotFormat)
    MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: missing format line.");
  if (!endHeader)
    MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: missing end_header.");

  // Locate vertex/face elements (pointers stay valid: elems is now frozen).
  const Element *pVert = NULL;
  const Element *pFace = NULL;
  for (size_t i = 0; i < elems.size(); ++i) {
    if (elems[i].name.equals("vertex")) pVert = &elems[i];
    else if (elems[i].name.equals("face")) pFace = &elems[i];
  }
  if (pVert == NULL || pVert->count <= 0)
    MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: no vertex element.");

  const int nverts = pVert->count;
  if (!m_pSurf->setVertSize(nverts))
    MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: set vertex size failed.");

  bool hasNormal = false;
  {
    bool nx = false, ny = false, nz = false;
    for (size_t i = 0; i < pVert->props.size(); ++i) {
      const LString &nm = pVert->props[i].name;
      if (nm.equals("nx")) nx = true;
      else if (nm.equals("ny")) ny = true;
      else if (nm.equals("nz")) nz = true;
    }
    hasNormal = nx && ny && nz;
  }

  const int idxProp = (pFace != NULL) ? findIndexProp(*pFace) : -1;
  std::vector<surface::MSFace> faces;

  //////////
  // Read the body. Elements appear in header declaration order; non
  // vertex/face elements must still be consumed to keep the cursor aligned.

  if (fmt == FMT_ASCII) {
    qlib::LineStream lis(ins);
    for (size_t ei = 0; ei < elems.size(); ++ei) {
      const Element &e = elems[ei];
      const bool isVert = (&e == pVert);
      const bool isFace = (pFace != NULL && &e == pFace);

      for (int i = 0; i < e.count; ++i) {
        LString l;
        if (!nextAsciiLine(lis, l))
          MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: file is too short.");

        if (!isVert && !isFace)
          continue;  // skipped element: line already consumed

        std::vector<LString> toks;
        splitTokens(l, toks);
        size_t tk = 0;

        if (isVert) {
          Vector4D pos(0, 0, 0), nrm(0, 0, 0);
          for (size_t pi = 0; pi < e.props.size(); ++pi) {
            const Prop &p = e.props[pi];
            if (p.isList) {
              if (tk >= toks.size())
                MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: short vertex line.");
              int cnt = 0;
              toks[tk++].toInt(&cnt);
              for (int k = 0; k < cnt && tk < toks.size(); ++k) ++tk;
            }
            else {
              if (tk >= toks.size())
                MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: short vertex line.");
              double v = 0.0;
              toks[tk++].toDouble(&v);
              captureVert(p.name, v, pos, nrm);
            }
          }
          m_pSurf->setVertex(i, pos, nrm);
        }
        else {  // isFace
          std::vector<int> idx;
          for (size_t pi = 0; pi < e.props.size(); ++pi) {
            const Prop &p = e.props[pi];
            if (p.isList) {
              if (tk >= toks.size())
                MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: short face line.");
              int cnt = 0;
              toks[tk++].toInt(&cnt);
              for (int k = 0; k < cnt; ++k) {
                if (tk >= toks.size())
                  MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: short face line.");
                int id = 0;
                toks[tk++].toInt(&id);
                if ((int) pi == idxProp) idx.push_back(id);
              }
            }
            else {
              if (tk < toks.size()) ++tk;  // skip scalar face property
            }
          }
          triangulate(idx, nverts, faces);
        }
      }
    }
  }
  else {
    // binary: configure byte swapping from host vs file endianness.
    const bool hostLE =
        (qlib::BinOutStream::getIntByteOrder() == qlib::BinOutStream::INTBO_LE);
    const bool fileLE = (fmt == FMT_BIN_LE);
    bins.setSwapMode((hostLE != fileLE) ? qlib::BinInStream::MODE_SWAP
                                        : qlib::BinInStream::MODE_NOOP);

    for (size_t ei = 0; ei < elems.size(); ++ei) {
      const Element &e = elems[ei];
      const bool isVert = (&e == pVert);
      const bool isFace = (pFace != NULL && &e == pFace);

      for (int i = 0; i < e.count; ++i) {
        if (isVert) {
          Vector4D pos(0, 0, 0), nrm(0, 0, 0);
          for (size_t pi = 0; pi < e.props.size(); ++pi) {
            const Prop &p = e.props[pi];
            if (p.isList) {
              const long cnt = readBinInt(bins, p.countType);
              for (long k = 0; k < cnt; ++k) (void) readBinScalar(bins, p.type);
            }
            else {
              const double v = readBinScalar(bins, p.type);
              captureVert(p.name, v, pos, nrm);
            }
          }
          m_pSurf->setVertex(i, pos, nrm);
        }
        else {  // face or skipped element
          std::vector<int> idx;
          for (size_t pi = 0; pi < e.props.size(); ++pi) {
            const Prop &p = e.props[pi];
            if (p.isList) {
              const long cnt = readBinInt(bins, p.countType);
              for (long k = 0; k < cnt; ++k) {
                const long id = readBinInt(bins, p.type);
                if (isFace && (int) pi == idxProp) idx.push_back((int) id);
              }
            }
            else {
              (void) readBinScalar(bins, p.type);
            }
          }
          if (isFace) triangulate(idx, nverts, faces);
        }
      }
    }
  }

  //////////
  // Commit faces and (optionally) normals.

  if (faces.empty())
    MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: no faces found.");

  if (!m_pSurf->setFaceSize((int) faces.size()))
    MB_THROW(qlib::FileFormatException, "PLYRead> FATAL Error: set face size failed.");
  for (size_t i = 0; i < faces.size(); ++i)
    m_pSurf->setFace((int) i, faces[i]);

  if (!hasNormal)
    computeNormals(m_pSurf);

  MB_DPRINTLN("PLYRead> read %d verts, %d faces OK.", nverts, (int) faces.size());
  return true;
}
