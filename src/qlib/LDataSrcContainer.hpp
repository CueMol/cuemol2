// -*-Mode: C++;-*-
//
// Data source container interface
//
//

#ifndef LDATA_SRC_CONTAINER_HPP_INCLUDED
#define LDATA_SRC_CONTAINER_HPP_INCLUDED

#include "qlib.hpp"
#include "LString.hpp"

namespace qlib {

  class LDom2OutStream;
  class LDom2Node;

  class InStream;

  ///
  ///  Data source container interface
  ///
  class QLIB_API LDataSrcContainer
  {
  public:
    // virtual ~LDataSrcContainer();

    //////////

    /// Return true if this container supports writing to QSC/QDF
    virtual bool isDataSrcWritable() const;

    /// Return the Reader object nickname for this data-source container
    ///  (Data source container can determine the reader name based on the compatibility version number)
    virtual LString getDataChunkReaderName(int nQdfVer) const;

    /// Set-up the source and source type names to the data node pNode and update this object's props
    ///  (Typical impl calls getDataChunkReaderName() to determine the source type)
    virtual void setDataChunkName(const LString &name, LDom2Node *pNode, int nQdfVer);

    /// Write the contents of this data source container to the object stream
    virtual void writeDataChunkTo(LDom2OutStream &oos) const;

    //////////

    /// Read the contents of this data source container from the stream
    virtual void readFromStream(qlib::InStream &ins);

    /// Update src path prop (after reading from src or alt_src)
    virtual void updateSrcPath(const LString &srcpath) =0;

    ////////////////////
    // convenience methods

    /// Read object from file path (utility method)
    void readFromPath(const LString &path);

    /// Load from src or alt_src (perform conversion & check of source path)
    LString readFromSrcAltSrc(const LString &src, const LString &altsrc, const LString &base_path, bool &b);

    static LString selectSrcAltSrc(const LString &src,
                                   const LString &altsrc,
                                   const LString &base_path,
                                   bool &rbReadFromAltSrc);
    ////////////////////


  };


}

#endif


