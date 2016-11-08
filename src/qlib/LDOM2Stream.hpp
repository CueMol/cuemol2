// -*-Mode: C++;-*-
//
// Light-weight DOM-like tree class for serialization (2)
//
//

#ifndef LDOM2_STREAM_HPP_INCLUDED
#define LDOM2_STREAM_HPP_INCLUDED

#include "LDOM2Tree.hpp"
#include "FormatStream.hpp"

namespace qlib {

  ///
  ///  QSC(XML) file output stream
  ///
  class QLIB_API LDom2OutStream : public FormatOutStream
  {
  private:
    typedef FormatOutStream super_t;

    int m_nLevel;
    LString m_indstr;

    typedef std::map<LString, LDataSrcContainer *> ChunkTable;
    ChunkTable m_datachunk;

    /// Version of QDF/QSC format (in integer, 0, 1, etc)
    int m_nVersion;
    
    /// Encoding type identifier of QDF file format (2-digit string, 00, 11, etc)
    LString m_qdfEncType;

  public:
    LDom2OutStream() : super_t(), m_nLevel(0), m_indstr("\t") {}

    LDom2OutStream(OutStream &out) : super_t(out), m_nLevel(0), m_indstr("\t") {}

    virtual ~LDom2OutStream() {}

    void setIndentString(const LString &a) { m_indstr = a; }

    void write(LDom2Tree *pTree);

    void write(LDom2Node *pNode);

    virtual LString prepareDataChunk(LDataSrcContainer *pCnt);

    // virtual void close();

    LString getQdfEncType() const { return m_qdfEncType; }
    void setQdfEncType(const LString &str) { m_qdfEncType = str; }

    int getQdfVer() const { return m_nVersion; }
    void setQdfVer(int n) { m_nVersion = n; }
    
  private:

    // determine if the node is written as attr or child elem
    static bool isNodeAttr(LDom2Node *pNode);

    // pNode or its child nodes is in modified (non-default) state
    bool hasModifiedNodes(LDom2Node *pNode);

    void writeIndent() {
      for (int i=0; i<m_nLevel; ++i) {
        writeStr(m_indstr);
      }
    }

    //////////

    void writeStr(const LString &str) {
      int nlen = str.length();
      super_t::write(str.c_str(), 0, nlen);
    }
    void writeStr(const char *str) {
      int nlen = ::strlen(str);
      super_t::write(str, 0, nlen);
    }

    //////////

    void writeSTagStart(const LString &tagname) {
      writeIndent();
      writeStr("<"+tagname);
    }

    void writeAttr(const LString &key, const LString &val);

    void closeEmptyTag() {
      writeStr("/>\n");
    }

    void closeTag() {
      writeStr(">\n");
    }

    void writeEndTag(const LString &tagname) {
      writeIndent();
      writeStr("</"+tagname+">\n");
    }

    void writeHeader() {
      writeStr("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n\n");
    }

  };

  ////////////////////////////////////////////////////////////////////////////////////

  ///
  ///  QSC(XML) file input stream
  ///
  class QLIB_API LDom2InStream : public FormatInStream
  {
  private:
    typedef FormatInStream super_t;

    LString m_nextChunkID;

    typedef std::map<LString, LDataSrcContainer *> ChunkTable;
    ChunkTable m_datachunk;

  public:
    LDom2InStream() : super_t() {}

    LDom2InStream(InStream &out) : super_t(out) {}

    virtual ~LDom2InStream() {}

    //////////

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

    // close and destroy the stream obtained by getNextChankStream()
    void closeChunkStream(qlib::InStream *pin);

  };


}

#endif

