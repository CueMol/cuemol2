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

    virtual bool isDataSrcWritable() const;
    virtual LString getDataChunkReaderName() const;

    virtual void setDataChunkName(const LString &name, LDom2Node *pNode);

    virtual void writeDataChunkTo(LDom2OutStream &oos) const;

    //////////

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


