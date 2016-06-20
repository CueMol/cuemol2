// -*-Mode: C++;-*-
//
// Object serialization/deserialization classes
// for QSC(XML) format (ver. 3)
//

#ifndef LOBJ_STREAM_3_HPP_INCLUDED
#define LOBJ_STREAM_3_HPP_INCLUDED

#include "LDOM2Tree.hpp"
#include "FormatStream.hpp"

namespace qlib {

  ///
  ///  QSC(XML) file input stream
  ///
  class QLIB_API LObjInStream3 : public FormatInStream
  {
  private:
    typedef FormatInStream super_t;

    LString m_nextChunkID;

    typedef std::map<LString, LDataSrcContainer *> ChunkTable;
    ChunkTable m_datachunk;

    void *m_pInStream;

  public:
    LObjInStream3();

    LObjInStream3(InStream &out);

    virtual ~LObjInStream3();

    //////////

    void start();
    virtual void close();

    // read XML part of the stream
    void read(LDom2Tree &tree);

    LString getNextDataChunkID();

    void addChunkMap(const LString &src, LDataSrcContainer *pCnt);
    
    LDataSrcContainer *findChunkObj(const LString &chunkid) const;

    LDataSrcContainer *getNextContainer()
    {
      LString id = getNextDataChunkID();
      if (id.isEmpty()) return NULL;
      return findChunkObj( id );
    }

    // get stream object for the next datachunk
    qlib::InStream *getNextChunkStream();

    // close the chunk stream obtained by getNextChankStream()
    void closeChunkStream(qlib::InStream *pin);

  private:
    int m_nBufSz;

  public:
    void setBufSize(int n) {
      m_nBufSz = n;
    }

  };

}

#endif

