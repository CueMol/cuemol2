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
    virtual ~PLYFileReader();

    //////////////////////////////////////////////
    // Information query methods

    /// get the nickname of this reader (referred from script interface)
    virtual const char *getName() const;

    /// get file-type description
    virtual const char *getTypeDescr() const;

    /// get file extension
    virtual const char *getFileExt() const;

    /// create default object for this reader
    virtual qsys::ObjectPtr createDefaultObj() const;

    //////////////////////////////////////////////
    // Read/build methods

    virtual void attach(qsys::ObjectPtr pObj);
    virtual qsys::ObjectPtr detach();

    /// Read from the input stream ins, and build the attached object.
    virtual bool read(qlib::InStream &ins);

    /// Content sniff: positive marker is the literal "ply" magic line
    /// that begins every PLY file (ascii and binary alike).
    virtual int canHandleContent(qlib::InStream &ins) const;
  };

}  // namespace surface

#endif  // PLY_FILE_READER_HPP_INCLUDED
