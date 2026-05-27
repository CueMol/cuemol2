//
// Stream manager singleton class
//
// $Id: StreamManager.cpp,v 1.17 2010/12/15 00:19:08 rishitani Exp $
//

#include <common.h>

#include "StreamManager.hpp"
#include "ObjReader.hpp"
#include "ObjWriter.hpp"
#include <qlib/ClassRegistry.hpp>

#include <qlib/FileStream.hpp>
#include <qlib/GzipStream.hpp>
#include <qlib/LByteArray.hpp>
#include <qlib/LVarArray.hpp>

#ifdef HAVE_LZMA_H
#include <qlib/XzStream.hpp>
#endif

#include <qlib/PipeStream.hpp>
#include "IOThread.hpp"

#include <qlib/LDOM2Stream.hpp>
#include <qlib/StringStream.hpp>

#include "SceneManager.hpp"
#include "RendererFactory.hpp"
#include "style/AutoStyleCtxt.hpp"
#include "SceneXMLReader.hpp"
#include "SceneXMLWriter.hpp"

using namespace qsys;

SINGLETON_BASE_IMPL(qsys::StreamManager);

///////////////

StreamManager::StreamManager()
{
  MB_DPRINTLN("StreamManager(%p) created", this);
}

StreamManager::~StreamManager()
{
  MB_DPRINTLN("StreamManager(%p) destructed", this);
}

//int StreamManager::loadObjectAsync(const LString &ftype)
int StreamManager::loadObjectAsync(qlib::LScrSp<ObjReader> pReader)
{
  MB_DPRINTLN("StreamManager.loadAsyncObject(%s) called", pReader->getName());

  IOThread *pThr = MB_NEW IOThread;
  pThr->m_pRdr = pReader;
  int tid = m_iotab.put(pThr);
  pThr->kick();

  return tid;
}

void StreamManager::supplyDataAsync(int id, qlib::LScrSp<qlib::LByteArray> pbuf, int nlen)
{
  MB_DPRINTLN("StreamManager.supplyDataAsync(%d, size=%d) called",id, nlen);
  IOThread *pThr = m_iotab.get(id);
  if (pThr==NULL) return;
  pThr->supplyData((const char *)pbuf->data(), nlen);
}

ObjectPtr StreamManager::waitLoadAsync(int id)
{
  IOThread *pThr = m_iotab.get(id);
  if (pThr==NULL) return ObjectPtr();
  
  pThr->notifyEos();
  pThr->waitTermination();

  ObjectPtr pret = pThr->m_pObj;
  m_iotab.remove(id);
  delete pThr;

  if (!pret.isnull())
    pret->setSource("");

  return pret;
}

///////////////

void StreamManager::regIOHImpl(const LString &abiname)
{
  LString nickname,descr,fext;
  int ntype;

  qlib::ClassRegistry *pCR = qlib::ClassRegistry::getInstance();
  qlib::LClass *pCls = pCR->getClassObjByAbiName(abiname);
  
  // Create a dummy instance to retrieve type information
  {
    InOutHandler *pIOH = dynamic_cast<InOutHandler *>(pCls->createObj());
    if (pIOH==NULL) {
      LString msg = LString::format("Class %s is not ObjReader", abiname.c_str());
      MB_THROW(qlib::InvalidCastException, msg);
      return;
    }

    nickname = pIOH->getName();
    descr = pIOH->getTypeDescr();
    fext = pIOH->getFileExt();
    ntype = pIOH->getCatID();

    delete pIOH;
  }

  ReaderInfo ri;
  ri.nickname = nickname;
  ri.descr = descr;
  ri.fext = fext;
  ri.pClass = pCls;
  ri.nCatID = ntype;

  if (!m_rdrinfotab.set(abiname, ri)) {
    LString msg = LString::format("Reader/Writer <%s> already exists", abiname.c_str());
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }
}

bool StreamManager::unregistReader(const LString &abiname, bool bWriter /*= false*/)
{
  // TO DO: implementation
  return false;
}

bool StreamManager::isReaderRegistered(const LString &abiname)
{
  return m_rdrinfotab.containsKey(abiname);
}

InOutHandler *StreamManager::createHandlerPtr(const LString &nickname, int nCatID) const
{
  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {
    const LString &nknm = entry.second.nickname;
    if (!nickname.equals(nknm))
      continue;
    if (nCatID!=entry.second.nCatID)
      continue;
    qlib::LClass *pCls = entry.second.pClass;
    MB_ASSERT(pCls!=NULL);
    
    InOutHandler *pObj = dynamic_cast<InOutHandler *>(pCls->createObj());
    if (pObj==NULL) {
      // This should not happen!!
      LOG_DPRINTLN("Reader %s is not ObjReader", nknm.c_str());
      continue;
    }

    pObj->resetAllProps();
    return pObj;
  }

  // not found!!
  return NULL;
}

ObjReader *StreamManager::createReaderPtr(const LString &nickname) const
{
  return dynamic_cast<ObjReader *>(createHandlerPtr(nickname, InOutHandler::IOH_CAT_OBJREADER));
}


LString StreamManager::getReaderInfoJSON() const
{
  return getIOHInfoJSONImpl(InOutHandler::IOH_CAT_OBJREADER);
}

LString StreamManager::getWriterInfoJSON() const
{
  return getIOHInfoJSONImpl(InOutHandler::IOH_CAT_OBJWRITER);
}

LString StreamManager::getIOHInfoJSONImpl(int aCatID) const
{
  int i;
  qlib::LStringList tmps;
  LString rval;
  data_t::const_iterator iter;

  rval += "({ ";

  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {
    //iter = m_rdrinfotab.begin();
    //for (i=0; iter!=m_rdrinfotab.end(); ++iter) {
    //if (iter->second.bWriter!=bWriter)
    //continue;
    if (entry.second.nCatID!=aCatID)
      continue;
    LString descr = entry.second.descr;
    tmps.push_back("\"" + descr + "\"");
  }  

  int nent = tmps.size();
  rval += LString::format("size: %d", nent);
  if (nent<=0) {
    rval += " })\n";
    return rval;
  }

  rval += ",\n";

  rval += "descrs:[ ";
  rval += LString::join(",\n", tmps);
  rval += "],\n";
  tmps.erase(tmps.begin(), tmps.end());
  
  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {
    //iter = m_rdrinfotab.begin();
    //for (i=0; iter!=m_rdrinfotab.end(); ++iter) {
    if (entry.second.nCatID!=aCatID)
      continue;
    //if (entry.second.bWriter!=bWriter)
    //continue;
    LString fext = entry.second.fext;
    tmps.push_back("\"" + fext + "\"");
  }  

  rval += "fexts:[ ";
  rval += LString::join(",\n", tmps);
  rval += "],\n";
  tmps.erase(tmps.begin(), tmps.end());

  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {
    //iter = m_rdrinfotab.begin();
    //for (i=0; iter!=m_rdrinfotab.end(); ++iter) {
    //if (iter->second.bWriter!=bWriter)
    //continue;
    if (entry.second.nCatID!=aCatID)
      continue;
    LString s = entry.second.nickname;
    tmps.push_back("\"" + s + "\"");
  }  

  rval += "nicknames:[ ";
  rval += LString::join(",\n", tmps);
  rval += "] })\n";

  return rval;
}

LString StreamManager::getInfoJSON2() const
{
  std::list<LString> tmps;
  LString rval;
  data_t::const_iterator iter;

  rval += "[";

  bool bFirst = true;
  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {

    if (!bFirst)
      rval += ",";
    bFirst = false;

    rval += "{";

    rval += LString("\"descr\": \"") + entry.second.descr + "\",";
    rval += LString("\"fext\": \"") + entry.second.fext + "\",";
    rval += LString("\"name\": \"") + entry.second.nickname + "\",";
    rval += LString::format("\"category\": %d", entry.second.nCatID);

    rval += "}";
  }  

  rval += "]";

  return rval;
}

/*
LString StreamManager::getInitRendererNames(const LString &rdrnm) const
{
  // Create the requested reader obj
  ObjReader *pRdr = createReaderPtr(rdrnm);
  if (pRdr==NULL) {
    LOG_DPRINTLN("StreamManager> Reader %s not found", rdrnm.c_str());
    return LString();
  }

  ObjectPtr pObj = pRdr->createDefaultObj();
  if (pObj.isnull()) {
    LOG_DPRINTLN("StreamManager> No default obj found for Reader %s", rdrnm.c_str());
    return LString();
  }

  LString rval;
  rval = pObj->searchCompatibleRendererNames();
  delete pRdr;

  return rval;
}
*/

namespace {
// Default sniff buffer size. Real-world PDB-derived mmCIF files carry
// long metadata headers (entity, entity_src_gen, struct_ref, ...): even
// the 46-residue 1CRN places `_atom_site.` at byte ~20000. 64 KB covers
// virtually all PDB cif headers while staying trivial in I/O cost.
static const int SNIFF_PEEK_BYTES = 65536;

// Drain up to `nBytes` from `src` into a std::string. Partial reads
// (EOF, truncation, read errors) are tolerated -- we return whatever
// bytes were successfully collected.
std::string drainHead(qlib::InStream &src, int nBytes)
{
  std::string buf;
  buf.reserve(nBytes);
  try {
    for (int i = 0; i < nBytes; ++i) {
      int c = src.read();
      if (c < 0) break;
      buf.push_back(static_cast<char>(c));
    }
  }
  catch (...) {
    // Tolerate; return whatever we've accumulated so far.
  }
  return buf;
}

enum HeadEncoding { ENC_RAW, ENC_GZIP, ENC_XZ };

// Probe the first few bytes of `path` and return what compression (if
// any) the file appears to use. The 6-byte sample is large enough to
// capture both gzip (2-byte magic) and xz (6-byte magic).
HeadEncoding detectEncoding(const LString &path)
{
  qlib::FileInStream probe;
  try {
    probe.open(path);
  }
  catch (...) {
    return ENC_RAW;  // Caller's open() will fail too and bail.
  }

  unsigned char magic[6] = {0};
  int nRead = 0;
  try {
    nRead = probe.read(reinterpret_cast<char *>(magic), 0, 6);
  }
  catch (...) {
    nRead = 0;
  }
  try { probe.close(); } catch (...) {}

  if (nRead >= 2 && magic[0] == 0x1f && magic[1] == 0x8b) {
    return ENC_GZIP;
  }
  // xz magic: FD 37 7A 58 5A 00  ("\xfd7zXZ\0")
  if (nRead >= 6 && magic[0] == 0xfd && magic[1] == '7' && magic[2] == 'z' &&
      magic[3] == 'X' && magic[4] == 'Z' && magic[5] == 0) {
    return ENC_XZ;
  }
  return ENC_RAW;
}
}  // namespace

LString StreamManager::peekHead(const LString &path, int nBytes,
                                bool supportCompression) const
{
  if (!supportCompression) {
    // Caller has not opted into transparent decompression. The raw head
    // bytes of a compressed file would never match any reader's
    // canHandleContent(), so return an empty buffer (which the caller
    // treats as "no sniff verdict, use ext fallback") instead of wasting
    // the read.
    LString lowered = path.toLowerCase();
    if (lowered.endsWith(".gz") || lowered.endsWith(".xz")) {
      return LString();
    }
  }

  HeadEncoding enc = supportCompression ? detectEncoding(path) : ENC_RAW;

  qlib::FileInStream file_ins;
  try {
    file_ins.open(path);
  }
  catch (...) {
    return LString();
  }

  std::string buf;

  // Mirror ObjReader::read2()'s filter-chain pattern: wrap the raw file
  // stream in a Gzip/Xz decompressor when the magic bytes say so.
  if (enc == ENC_GZIP) {
    try {
      qlib::GzipInStream gzin(file_ins);
      buf = drainHead(gzin, nBytes);
      try { gzin.close(); } catch (...) {}
    }
    catch (...) {
      // Corrupt gzip header etc. -- treat as no buffer.
    }
  }
#ifdef HAVE_LZMA_H
  else if (enc == ENC_XZ) {
    try {
      qlib::XzInStream xzin(file_ins);
      buf = drainHead(xzin, nBytes);
      try { xzin.close(); } catch (...) {}
    }
    catch (...) {
    }
  }
#endif
  else {
    buf = drainHead(file_ins, nBytes);
  }

  try { file_ins.close(); } catch (...) {}

  return LString(buf.c_str(), static_cast<int>(buf.size()));
}

// Shared core of searchReader{,s}ByContent. When `bFirstOnly` is true,
// returns at the first YES verdict (no further readers are queried);
// otherwise collects every YES match and joins them with ','.
LString StreamManager::searchByContentImpl(const LString &path,
                                           const LString &nicknames_csv,
                                           int nCatID,
                                           bool supportCompression,
                                           bool bFirstOnly) const
{
  // Parse CSV into a quick-lookup list. Empty CSV means "walk every
  // registered reader of the given category". split_of() treats every
  // char in its first arg as a separator and silently drops empty
  // tokens, so a humanised CSV like " mmcif , mmcifmap " collapses to
  // ["mmcif", "mmcifmap"] without an extra trim pass. Reader nicknames
  // are alphanumeric, so the broader "comma OR whitespace" delimiter
  // set is benign.
  qlib::LStringList wanted;
  if (!nicknames_csv.isEmpty()) {
    nicknames_csv.split_of(", \t", wanted);
  }
  const bool filtered = !wanted.empty();

  std::vector<const ReaderInfo *> candidates;
  for (const auto &entry : m_rdrinfotab) {
    if (entry.second.nCatID != nCatID) continue;
    if (filtered) {
      bool match = false;
      for (const LString &nm : wanted) {
        if (entry.second.nickname.equals(nm)) {
          match = true;
          break;
        }
      }
      if (!match) continue;
    }
    candidates.push_back(&entry.second);
  }

  if (candidates.empty()) return LString();

  LString headBuf = peekHead(path, SNIFF_PEEK_BYTES, supportCompression);
  if (headBuf.isEmpty()) return LString();

  qlib::LStringList hits;
  for (const ReaderInfo *pInfo : candidates) {
    qlib::LClass *pCls = pInfo->pClass;
    MB_ASSERT(pCls != NULL);
    ObjReader *pRdr = dynamic_cast<ObjReader *>(pCls->createObj());
    if (pRdr == NULL) continue;

    int verdict = ObjReader::CONTENT_UNKNOWN;
    try {
      qlib::StrInStream ins(headBuf);
      verdict = pRdr->canHandleContent(ins);
    }
    catch (...) {
      // Swallow per-reader sniff exceptions; treat as UNKNOWN.
    }
    delete pRdr;

    if (verdict == ObjReader::CONTENT_YES) {
      if (bFirstOnly) return pInfo->nickname;
      hits.push_back(pInfo->nickname);
    }
  }

  if (hits.empty()) return LString();
  return LString::join(",", hits);
}

LString StreamManager::searchReadersByContent(
    const LString &path, const LString &nicknames_csv, int nCatID,
    bool supportCompression) const
{
  return searchByContentImpl(path, nicknames_csv, nCatID, supportCompression,
                             /*bFirstOnly=*/false);
}

LString StreamManager::searchReaderByContent(
    const LString &path, const LString &nicknames_csv, int nCatID,
    bool supportCompression) const
{
  return searchByContentImpl(path, nicknames_csv, nCatID, supportCompression,
                             /*bFirstOnly=*/true);
}

LString StreamManager::findCompatibleWriterNamesForObj(qlib::uid_t objid)
{
  ObjectPtr pObj = SceneManager::getInstance()->getObject(objid);

  const int kCatID = InOutHandler::IOH_CAT_OBJWRITER;
  qlib::LStringList ls;

  BOOST_FOREACH(const data_t::value_type &entry, m_rdrinfotab) {
    const LString &nknm = entry.second.nickname;
    if (kCatID!=entry.second.nCatID)
      continue;
    qlib::LClass *pCls = entry.second.pClass;
    MB_ASSERT(pCls!=NULL);
    
    ObjWriter *pObjWr = dynamic_cast<ObjWriter *>(pCls->createObj());
    if (pObjWr==NULL) {
      // This should not happen!!
      LOG_DPRINTLN("Fatal Error: Handler %s is not ObjWriter", nknm.c_str());
      continue;
    }

    if (pObjWr->canHandle(pObj)) {
      ls.push_back(nknm);
    }
    delete pObjWr;
  }

  if (ls.size()==0)
    return LString();

  return LString::join(",", ls);
}


/////////////////////////////////////////////////////////////////////////


qlib::LByteArrayPtr StreamManager::toXML(const qlib::LScrObjBasePtr &pSObj)
{
  SceneXMLWriter writer;
  qlib::LScrSp<qlib::LByteArray> rval = writer.toByteArray(pSObj);
  return rval;
}

qlib::LByteArrayPtr StreamManager::toXML2(const qlib::LScrObjBasePtr &pSObj,
                                          const LString &type_ovwr)
{
  SceneXMLWriter writer;
  qlib::LScrSp<qlib::LByteArray> rval = writer.toByteArray(pSObj, type_ovwr);
  return rval;
}

qlib::LByteArrayPtr StreamManager::rendGrpToXML(const qlib::LVarArray &objs, const LString &grpname)
{
  const int nlen = objs.size();
  
//  if (nlen==0)
//    return qlib::LByteArrayPtr();

  {
    // try renderer array
    std::list<RendererPtr> list;
    for (int i=0; i<nlen; ++i) {
      if (!objs[i].isObject())
        return qlib::LByteArrayPtr();
      
      LScriptable *pObj = objs[i].getObjectPtr();
      if (pObj==NULL)
        return qlib::LByteArrayPtr();
      if (!pObj->isSmartPtr())
        return qlib::LByteArrayPtr();

      qlib::LSupScrSp *pBaseSP = static_cast<qlib::LSupScrSp *>(pObj);
      RendererPtr pRend = RendererPtr(*pBaseSP);
      if (pRend.isnull())
        return qlib::LByteArrayPtr();

      list.push_back(pRend);
    }

    SceneXMLWriter writer;
    qlib::LByteArrayPtr rval = writer.rendArrayToByteArray(list, grpname);
    return rval;
  }
  
  
  // return qlib::LByteArrayPtr();
}

////////////////////////////////

qlib::LScrObjBasePtr StreamManager::fromXML(const qlib::LByteArrayPtr &pbuf,
                                            qlib::uid_t nSceneID)
{
  SceneXMLReader reader;
  ScenePtr pScene = SceneManager::getSceneS(nSceneID);
  reader.attach(pScene);
  qlib::LScrSp<qlib::LScrObjBase> rval = reader.fromByteArray(pbuf);
  reader.detach();
  return rval;
}

qlib::LVarArray StreamManager::rendArrayFromXML(const qlib::LByteArrayPtr &pbuf,
                                                qlib::uid_t nSceneID)
{
  SceneXMLReader reader;
  ScenePtr pScene = SceneManager::getSceneS(nSceneID);
  reader.attach(pScene);

  std::list<RendererPtr> rends;
  LString grpname;
  reader.rendArrayFromByteArray(pbuf, rends, grpname);

  reader.detach();

  int nrends = rends.size();
  qlib::LVarArray rval(nrends+1);
  
  // the first element contains the group name (empty if array is not a group)
  rval[0].setStringValue(grpname);

  int i=1;
  BOOST_FOREACH (RendererPtr pRend, rends) {
    LScriptable *p = pRend.copy();
    rval[i].setObjectPtr(p);
    ++i;
  }

  return rval;
}


