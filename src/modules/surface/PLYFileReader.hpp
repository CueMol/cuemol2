// -*-Mode: C++;-*-
//
// PLY (Stanford Polygon File) surface data reader
//

#ifndef PLY_FILE_READER_HPP_INCLUDED
#define PLY_FILE_READER_HPP_INCLUDED

#include "surface.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/ObjReader.hpp>

class PLYFileReader_wrap;

namespace surface {

  class MolSurfObj;

  ///
  ///   PLY (Stanford Polygon File) surface reader.
  ///
  ///   Reads ascii / binary_little_endian / binary_big_endian PLY files
  ///   into a MolSurfObj (positions, normals, triangles). Vertex colors
  ///   and other extra properties are parsed but discarded (MolSurfObj
  ///   does not store per-vertex color). Polygons with more than three
  ///   vertices are fan-triangulated. When the file has no vertex normals,
  ///   they are computed from the faces.
  ///
  class PLYFileReader : public qsys::ObjReader
  {
    MC_SCRIPTABLE;

    friend class ::PLYFileReader_wrap;

    typedef qsys::ObjReader super_t;

  private:
    /// attached molecular surface object
    MolSurfObj *m_pSurf;

  public:
    PLYFileReader();
    ~PLYFileReader() override;

    //////////////////////////////////////////////
    // Information query methods

    /// get the nickname of this reader (referred from script interface)
    const char *getName() const override;

    /// get file-type description
    const char *getTypeDescr() const override;

    /// get file extension
    const char *getFileExt() const override;

    /// create default object for this reader
    qsys::ObjectPtr createDefaultObj() const override;

    //////////////////////////////////////////////
    // Read/build methods

    void attach(qsys::ObjectPtr pObj) override;
    qsys::ObjectPtr detach() override;

    /// Read from the input stream ins, and build the attached object.
    bool read(qlib::InStream &ins) override;

    /// Content sniff: positive marker is the literal "ply" magic line
    /// that begins every PLY file (ascii and binary alike).
    int canHandleContent(qlib::InStream &ins) const override;
  };

}  // namespace surface

#endif  // PLY_FILE_READER_HPP_INCLUDED
