// -*-Mode: C++;-*-
//
// MSMS molecular surface file reader
//
// $Id: MSMSFileReader.hpp,v 1.2 2010/09/23 13:49:13 rishitani Exp $

#ifndef MSMS_FILE_H__
#define MSMS_FILE_H__

#include "surface.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LineStream.hpp>
#include <qsys/ObjReader.hpp>

namespace qlib {
  class LineStream;
  class LClass;
}

class MSMSFileReader_wrap;

namespace surface {

  class MolSurfObj;

///
///   MSMS molecular surface file reader
///

class MSMSFileReader : public qsys::ObjReader
{
  MC_SCRIPTABLE;

  friend class ::MSMSFileReader_wrap;

  typedef qsys::ObjReader super_t;

private:
  //MCINFO: LString m_vertFileName => vertex_file
  LString m_vertFileName;

private:
  /// line buffer
  LString m_recbuf;

  /// current line number
  int m_lineno;

  /// attached molecular surface object
  MolSurfObj *m_pSurf;

public:
  MSMSFileReader();
  ~MSMSFileReader() override;

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

  /// Content sniff: positive marker is "# MSMS" in the leading
  /// comment block written by the MSMS program.
  int canHandleContent(qlib::InStream &ins) const override;

private:
  // read MSMS file from stream
  bool readVert(qlib::LineStream &ins);

  bool readFace(qlib::LineStream &ins);

  bool readRecord(qlib::LineStream &ins) {
    if (!ins.ready())
      return false;
    
    m_recbuf = ins.readLine();
    m_lineno = ins.getLineNo();
    return true;
  }

  
  LString readStr(int start, int end) {
    if (m_recbuf.isEmpty()) return LString();

    start --; end --;
    if (end >= m_recbuf.length())
      end = m_recbuf.length()-1;
    if (start<0)
      start = 0;
    if (start>end)
      start = end;

    return m_recbuf.substr(start, end-start+1);
  }

};

}

#endif // MSMS_File_H__

