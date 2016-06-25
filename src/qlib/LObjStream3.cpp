// -*-Mode: C++;-*-
//
// Object serialization/deserialization classes
// for QSC(XML) format (ver. 3)
//

#include <common.h>

#include "LObjStream3.hpp"
#include "FilterStream.hpp"
#include "ObjectManager.hpp"
#include "LDataSrcContainer.hpp"

#include "ChunkFilterImpl2.hpp"
#include "LObjStreamXMLParser2.hpp"

//////////

#define END_OF_XML_MARKER "========== End of XML =========="

#define CHUNK_STARTL_MARKER "==========START "
#define CHUNK_STARTR_MARKER "=========="
#define CHUNK_STARTLMK_LEN 16
#define CHUNK_STARTMK_LEN 43
#define CHUNK_ID_LEN 15

#define CHUNK_ENDL_MARKER "==========END "
#define CHUNK_ENDR_MARKER "=========="

//////////

using namespace qlib;

namespace {
  typedef FilterInStream<ChunkFilterImpl2> ChunkInStream;
}

LObjInStream3::LObjInStream3()
 : super_t()
{
  m_pInStream = NULL;
  m_nBufSz = 1024*1024;
}

LObjInStream3::LObjInStream3(InStream &out)
  : super_t(out)
{
  m_pInStream = NULL;
  m_nBufSz = 1024*1024;
}

LObjInStream3::~LObjInStream3()
{
  ChunkInStream *pcis = (ChunkInStream *) m_pInStream;
  if (pcis!=NULL)
    delete pcis;
}

void LObjInStream3::read(LDom2Tree &tree)
{
  MB_DPRINTLN("** void LObjInStream3::read(LDom2Tree &tree)");

  ChunkInStream *pcis = (ChunkInStream *) m_pInStream;
  MB_ASSERT(pcis!=NULL);
  sp<ChunkFilterImpl2> pcf = static_pointer_cast<ChunkFilterImpl2>(pcis->getImpl());

  pcf->setMark(END_OF_XML_MARKER "\n");

  XMLParser2 psr(*pcis);
  psr.m_pData = &tree;
  psr.parse();
  psr.m_pData = NULL;

  tree.current()->firstChild();
  m_nextChunkID = "";
}


//////////////////////////////////////////////
// Data-Chunk operations

LString LObjInStream3::getNextDataChunkID()
{
  if (!m_nextChunkID.isEmpty()) {
    return LString();
    //return m_nextChunkID;
  }

  ChunkInStream *pcis = (ChunkInStream *) m_pInStream;
  sp<ChunkFilterImpl2> pcf = static_pointer_cast<ChunkFilterImpl2>(pcis->getImpl());

  if (!pcis->ready()) {
    pcf->reset();
    // return LString();
  }

  char sbuf[256];
  int nr = pcf->readStartMk(sbuf, CHUNK_STARTMK_LEN);
  if (nr!=CHUNK_STARTMK_LEN) {
    if (!pcis->ready()) {
      MB_DPRINTLN("ObjInStream3> getNextDataChunkID failed (may be reached EOF)");
      return LString();
    }
    else {
      MB_THROW(FileFormatException, "data chunk is corrupted.");
      return LString();
    }
  }
  sbuf[nr] = '\0';

  // check the chunk start marker
  LString mk = sbuf;
  if (!mk.startsWith("\n" CHUNK_STARTL_MARKER)) {
    MB_THROW(FileFormatException, "data chunk is corrupted.");
    return LString();    
  }

  if (!mk.endsWith(CHUNK_STARTR_MARKER"\n")) {
    MB_THROW(FileFormatException, "data chunk is corrupted.");
    return LString();
  }

  // extract the chunk ID
  LString chunkID = mk.substr(CHUNK_STARTLMK_LEN + 1, CHUNK_ID_LEN);

  // check the validity of chunk ID
  if (!chunkID.startsWith("datachunk:")) {
    MB_THROW(FileFormatException, "data chunk is corrupted.");
    return LString();
  }

  LString idstr = chunkID.substr(10, 5);
  int dummy;
  if (!idstr.toInt(&dummy)) {
    MB_THROW(FileFormatException, "data chunk is corrupted.");
    return LString();
  }

  m_nextChunkID = chunkID;

  MB_DPRINTLN("ObjStr3> next chunk id=%s", m_nextChunkID.c_str());
  return m_nextChunkID;
}

qlib::InStream *LObjInStream3::getNextChunkStream()
{
  if (m_nextChunkID.isEmpty())
    return NULL;

  ChunkInStream *pcis = (ChunkInStream *) m_pInStream;
  sp<ChunkFilterImpl2> pcf = static_pointer_cast<ChunkFilterImpl2>(pcis->getImpl());

  LString mk = "\n" CHUNK_ENDL_MARKER +m_nextChunkID+ CHUNK_ENDR_MARKER "\n";

  pcf->setMark(mk);

  return pcis;
}

void LObjInStream3::closeChunkStream(qlib::InStream *pin)
{
  ChunkInStream *pcis = (ChunkInStream *) m_pInStream;
  sp<ChunkFilterImpl2> pcf = static_pointer_cast<ChunkFilterImpl2>(pcis->getImpl());

  //FilterInStream<ChunkFilterImpl2> *pcf =
  //dynamic_cast<FilterInStream<ChunkFilterImpl2> *>(pin);
  //if (pin==NULL) {
  //MB_THROW(InvalidCastException, "LObjInStream3::closeChunkStream");
  //return;
  //}

  char sbuf[4096];
  while (pcis->ready()) {
    int nr = pcis->read(sbuf, 0, sizeof sbuf);
    if (nr!=sizeof sbuf)
      break;
  }

  // delete pcf;

  m_nextChunkID = "";
  return;
}

void LObjInStream3::addChunkMap(const LString &src, LDataSrcContainer *pCnt)
{
  m_datachunk.insert(std::pair<LString, LDataSrcContainer *>(src, pCnt));
}

LDataSrcContainer *LObjInStream3::findChunkObj(const LString &chunkid) const
{
  ChunkTable::const_iterator ci = m_datachunk.find(chunkid);
  if (ci==m_datachunk.end()) {
    LString msg = LString::format("Chunk (ID: \"%s\") is not found", chunkid.c_str());
    LOG_DPRINTLN("SceneXMLRead> %s", msg.c_str());
    MB_THROW(qlib::IOException, msg);
  }
  return ci->second;
}

void LObjInStream3::start()
{
  ChunkInStream *pcis = MB_NEW ChunkInStream(*this);
  sp<ChunkFilterImpl2> pcf = static_pointer_cast<ChunkFilterImpl2>(pcis->getImpl());
  pcf->setBufferSize(m_nBufSz);
  m_pInStream = pcis;
}

void LObjInStream3::close()
{
  ChunkInStream *pcis = (ChunkInStream *) m_pInStream;
  if (pcis!=NULL) {
    pcis->close();
    delete pcis;
  }
  m_pInStream = NULL;

  super_t::close();
}

