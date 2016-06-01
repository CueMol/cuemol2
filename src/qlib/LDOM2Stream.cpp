// -*-Mode: C++;-*-
//
// XML-based object deserialization streams (implementation)
//
// $Id: LDOM2Stream.cpp,v 1.15 2011/04/17 10:56:39 rishitani Exp $

#include <common.h>

#include "LDOM2Stream.hpp"
#include "FilterStream.hpp"
#include "ExpatInStream.hpp"
#include "ObjectManager.hpp"
#include "ChunkDelimFilter.hpp"
#include "LDataSrcContainer.hpp"

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
LString escapeIntEntity(const LString &src)
{
  LString rval;

  int i;
  for (i=0; i<src.length(); ++i) {
    char c = src[i];
    if (c=='&') {
      rval += "&amp;";
    }
    else if (c=='<') {
      rval += "&lt;";
    }
    else if (c=='>') {
      rval += "&gt;";
    }
    else if (c=='\"') {
      rval += "&quot;";
    }
    else if (c=='\'') {
      rval += "&apos;";
    }
    else {
      rval += c;
    }
  }

  return rval;
}
}

void LDom2OutStream::writeAttr(const LString &key, const LString &val)
{
  
  writeStr(" "+key+"=\""+escapeIntEntity(val)+"\"");
}

//static
bool LDom2OutStream::isNodeAttr(LDom2Node *pNode)
{
  return pNode->isAttr();
  /*
  if (pNode->getChildCount()>0)
  return false;

  if (!pNode->getTypeName().isEmpty()) {
    // node with defined type name should be written as child element
    return false;
  }

  return true;
  */
}

bool LDom2OutStream::hasModifiedNodes(LDom2Node *pNode)
{
  if (pNode->getChildCount()==0) {
    if (pNode->isReadOnly())
      return false; // readonly node cannot be modified
      
    if (pNode->isDefault())
      return false; // is default, therefore not modified.
    
    // pNode is modified
    return true;
  }

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    LDom2Node *pChNode = pNode->getCurChild();
    if (hasModifiedNodes(pChNode))
      return true;
  }

  // all subnodes are not modified
  return false;
}

void LDom2OutStream::write(LDom2Node *pNode)
{
  LString tag = pNode->getTagName();
  LString typ = pNode->getTypeName();

  writeSTagStart(tag);

  // write ID attribute (if exists)
  LString id = pNode->getStrAttr("id");
  if (!id.isEmpty())
    writeAttr("id", id);

  bool bPermitUserTypeAttr;
  if (pNode->isReadOnly() && pNode->getChildCount()!=0) {
    // Read-only container node doesn't use type attribute as type_name
    // --> user can use type attr for any other purpose.
    bPermitUserTypeAttr = true;
  }
  else {
    // Type attr is used for object's type name definition by the LDOM system
    bPermitUserTypeAttr = false;
    if (!typ.isEmpty()) {
      writeAttr("type", typ);
    }
    else {
      // typeName is empty --> attrs may contain type attr?
      typ = pNode->getStrAttr("type");
      if (!typ.isEmpty())
        writeAttr("type", typ);
    }
  }
  
  // write value attr if val is not empty
  LString val = pNode->getValue();
  if (!val.isEmpty())
    writeAttr("value", val);

  bool bHasContents = !pNode->getContents().isEmpty();
  if (pNode->getChildCount()==0 && !bHasContents) {
    // no contents and no child elems/attrs
    // --> close empty tag and exit
    closeEmptyTag();
    return;
  }

  bool bHasElems = false;
  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    LDom2Node *pChNode = pNode->getCurChild();

    if (isNodeAttr(pChNode)) {
      if (pChNode->isDefault()||pChNode->isReadOnly())
        continue;
      // skip system-reserved attributes (id or type)
      if (bPermitUserTypeAttr) {
        if (!pChNode->getTagName().equals("id"))
          writeAttr(pChNode->getTagName(), pChNode->getValue());
      }
      else {
        if (!pChNode->getTagName().equals("type") &&
            !pChNode->getTagName().equals("id"))
          writeAttr(pChNode->getTagName(), pChNode->getValue());
      }
    }
    else {
      if (pChNode->isReadOnly()) {
        if (hasModifiedNodes(pChNode))
          bHasElems = true;
      }
      else {
        if (!pChNode->isDefault())
          bHasElems = true;
      }
    }
  }
    
  if (!bHasElems && !bHasContents) {
    // no contents and no child elems
    // --> close empty tag and exit
    closeEmptyTag();
    return;
  }
  closeTag();
    
  //
  // Write internal elements
  //
  ++m_nLevel;
  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    LDom2Node *pChNode = pNode->getCurChild();
    if (isNodeAttr(pChNode))
      continue;

    if (pChNode->isReadOnly()) {
      // Read-only node (i.e. non-polymorphic prop) is written out,
      // if the node itself or the children has non-default value.
      if (hasModifiedNodes(pChNode))
        LDom2OutStream::write(pChNode);
    }
    else {
      // Writable node (i.e. polymorphic prop) is written out,
      // only if the node itself has non-default value.
      // (don't check the child node values)
      if (!pChNode->isDefault())
        LDom2OutStream::write(pChNode);
    }
  }
  --m_nLevel;
    
  if (bHasContents) {
    // If contents are present, write them as the CDATA section with the end tag
    writeStr("<![CDATA[");
    writeStr(pNode->getContents());
    writeStr("]]></"+tag+">\n");
    return;
  }

  writeEndTag(tag);
}

////////////
// Write top node of tree (Entry method for writing)
void LDom2OutStream::write(LDom2Tree *pTree)
{
  m_nLevel = 0;
  writeHeader();
  write(pTree->top());

  // Write data chunks for Embedded Objects
  ObjectManager *pOM = ObjectManager::getInstance();
  ChunkTable::const_iterator iter = m_datachunk.begin();
  ChunkTable::const_iterator iend = m_datachunk.end();
  bool bfirst = true;
  for (; iter!=iend; ++iter) {
    //uid_t objid = iter->first;
    //LString cid = iter->second;
    LString cid = iter->first;
    
    //LDataSrcContainer *pChunk = dynamic_cast<LDataSrcContainer *>(pOM->getObjectByUID(objid));
    LDataSrcContainer *pCnt = iter->second;

    if (pCnt==NULL || !pCnt->isDataSrcWritable()) {
      LOG_DPRINTLN("FATAL ERROR: cannot serialize data chunk %s", cid.c_str());
      continue;
    }

    if (bfirst) {
      writeStr("\n" END_OF_XML_MARKER "\n");
      bfirst = false;
    }
    writeStr("\n" CHUNK_STARTL_MARKER +cid+ CHUNK_STARTR_MARKER "\n");
    pCnt->writeDataChunkTo(*this);
    writeStr("\n" CHUNK_ENDL_MARKER +cid+ CHUNK_ENDR_MARKER "\n");
  }

  // super_t::close();
}

LString LDom2OutStream::prepareDataChunk(LDataSrcContainer *pCnt)// uid_t objid)
{
  int ncid = m_datachunk.size();
  LString chunkid = LString::format("datachunk:%05d", ncid);
  m_datachunk.insert(std::pair<LString, LDataSrcContainer *>(chunkid, pCnt));
  //m_datachunk.insert(std::pair<uid_t, LString>(objid, chunkid));
  return chunkid;
}


////////////////////////////////////////

namespace {

//
//  Create LDOM tree from XML stream using Expat library
//
class XMLParser2 : public ExpatInStream
{
public:
  LDom2Tree *m_pData;

public:
  XMLParser2(InStream &r)
    : ExpatInStream(r), m_pData(NULL)
  {
  }
    
  virtual ~XMLParser2() {
  }
    
  virtual void startElement(const LString &name, const ExpatInStream::Attributes &attrs)
  {
    //MB_DPRINTLN("Start Element: tag= %s depth=%d",name.c_str(), getDepth());

    LDom2Node *pParNode = m_pData->current();
    LDom2Node *pNode;

    if (getDepth()==0) {
      pNode = pParNode;
    }
    else {
      pNode = pParNode->appendChild();
      m_pData->traverse();
    }

    pNode->setTagName(name);
    
    // process attributes
    ExpatInStream::Attributes::const_iterator iter = attrs.begin();
    ExpatInStream::Attributes::const_iterator iend = attrs.end();
    for (; iter!=iend; ++iter) {
      const LString &key = iter->first;
      const LString &val = iter->second;
      //MB_DPRINTLN("  element attr: key=%s value=%s", key.c_str(), val.c_str());
      if (key.equals("type")) {
        // The "type" attribute is stored in both typeName prop and attribute array
        pNode->setTypeName(val);
        //continue;
      }
      if (key.equals("value")) {
        pNode->setValue(val);
        continue;
      }
      pNode->appendStrAttr(key, val);
    }

    m_pData->current()->clearContents();
  }
  
  virtual void endElement(const LString &name) {
    //MB_DPRINTLN("End Element: tag= %s depth=%d",name.c_str(), getDepth());
    if (getDepth()>0)
      m_pData->popNode();
  }
  
  virtual void charData(const LString &sbuf) {
    //MB_DPRINTLN("charData: [%s]", sbuf.c_str());
    //m_pData->current()->value += sbuf;
    m_pData->current()->appendContents(sbuf);
  }
  
};

}

//////////////////////////////////////////////

void LDom2InStream::read(LDom2Tree &tree)
{
  //MB_DPRINTLN("************************ void LDom2InStream::read(LDom2Tree &tree)");
  FilterInStream<ChunkFilterImpl> cf(*this);
  static_pointer_cast<ChunkFilterImpl>(cf.getImpl())
    ->setMark(END_OF_XML_MARKER "\n");

  XMLParser2 psr(cf);
  psr.m_pData = &tree;
  psr.parse();
  psr.m_pData = NULL;

  tree.current()->firstChild();
  m_nextChunkID = "";
}


//////////////////////////////////////////////
// Data-Chunk operations

LString LDom2InStream::getNextDataChunkID()
{
  if (!ready())
    return LString();

  if (!m_nextChunkID.isEmpty())
    return m_nextChunkID;

  char sbuf[256];
  int nr = super_t::read(sbuf, 0, CHUNK_STARTMK_LEN);
  if (nr!=CHUNK_STARTMK_LEN) {
    MB_THROW(FileFormatException, "data chunk is corrupted.");
    return LString();
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

  //MB_DPRINTLN("!! next chunk id=%s", m_nextChunkID.c_str());
  return m_nextChunkID;
}

qlib::InStream *LDom2InStream::getNextChunkStream()
{
  if (m_nextChunkID.isEmpty())
    return NULL;

  LString mk = "\n" CHUNK_ENDL_MARKER +m_nextChunkID+ CHUNK_ENDR_MARKER "\n";
  FilterInStream<ChunkFilterImpl> *pcf = MB_NEW FilterInStream<ChunkFilterImpl>(*this);
  static_pointer_cast<ChunkFilterImpl>(pcf->getImpl())->setMark(mk);

  return pcf;
}

void LDom2InStream::closeChunkStream(qlib::InStream *pin)
{
  FilterInStream<ChunkFilterImpl> *pcf =
    dynamic_cast<FilterInStream<ChunkFilterImpl> *>(pin);

  if (pin==NULL) {
    MB_THROW(InvalidCastException, "LDom2InStream::closeChunkStream");
    return;
  }

  char sbuf[4096];
  while (pcf->ready()) {
    int nr = pcf->read(sbuf, 0, sizeof sbuf);
    if (nr!=sizeof sbuf)
      break;
  }
  delete pcf;
  m_nextChunkID = "";
  return;
}

void LDom2InStream::addChunkMap(const LString &src, LDataSrcContainer *pCnt)
{
  m_datachunk.insert(std::pair<LString, LDataSrcContainer *>(src, pCnt));
}

LDataSrcContainer *LDom2InStream::findChunkObj(const LString &chunkid) const
{
  ChunkTable::const_iterator ci = m_datachunk.find(chunkid);
  if (ci==m_datachunk.end()) {
    LString msg = LString::format("Chunk (ID: \"%s\") is not found", chunkid.c_str());
    LOG_DPRINTLN("SceneXMLRead> %s", msg.c_str());
    MB_THROW(qlib::IOException, msg);
  }
  return ci->second;
}

