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
#include <qlib/LimitedInStream.hpp>

#include <limits>
#include <memory>

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

bool StreamManager::unregistReader(const LString &abiname, bool /*bWriter = false*/)
{
  // Readers and writers share one table keyed by ABI name, so the
  // category flag does not change the lookup.
  return m_rdrinfotab.remove(abiname);
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

// Outcome of one canHandleContent call under a byte budget.
struct SniffResult
{
  int verdict;
  /// verdict == UNKNOWN and the budget (not the source) ended the scan:
  /// the reader might still decide if given more bytes.
  bool truncated;
  qlib::quint64 consumed;
};

// Run `rdr.canHandleContent` against a freshly opened stream for `path`
// with a byte budget of `maxBytes` (> 0). The file is wrapped with a
// Gzip/Xz decompressor when `enc` says so, then with a LimitedInStream.
// Each call gets its own stream chain (per-candidate, per-round re-open
// / re-decode) because canHandleContent is non-rewinding -- the OS page
// cache covers the cost of repeated file reads, and readers typically
// break out of their scan within a few KB.
SniffResult sniffWithChain(qsys::ObjReader &rdr, const LString &path,
                           HeadEncoding enc, qlib::quint64 maxBytes)
{
  SniffResult res{qsys::ObjReader::CONTENT_UNKNOWN, false, 0};

  qlib::FileInStream fis;
  try {
    fis.open(path);
  }
  catch (...) {
    return res;
  }

  // Inner helper: apply the byte cap and call canHandleContent. The
  // LimitedInStream must outlive the call so its accounting can be
  // read back.
  auto withCap = [&](qlib::InStream &stream) {
    qlib::LimitedInStream lim(stream, static_cast<qlib::qint64>(maxBytes));
    res.verdict = rdr.canHandleContent(lim);
    res.consumed = static_cast<qlib::quint64>(lim.consumed());
    res.truncated =
        (res.verdict == qsys::ObjReader::CONTENT_UNKNOWN) && lim.isLimitHit();
  };

  try {
    if (enc == ENC_GZIP) {
      qlib::GzipInStream gzin(fis);
      withCap(gzin);
      try { gzin.close(); } catch (...) {}
    }
#ifdef HAVE_LZMA_H
    else if (enc == ENC_XZ) {
      qlib::XzInStream xzin(fis);
      withCap(xzin);
      try { xzin.close(); } catch (...) {}
    }
#endif
    else {
      withCap(fis);
    }
  }
  catch (...) {
    // Corrupt input, mid-decompression error, reader exception, etc.
    // Final: a retry with a bigger budget would just throw again.
    res = SniffResult{qsys::ObjReader::CONTENT_UNKNOWN, false, 0};
  }

  try { fis.close(); } catch (...) {}
  return res;
}

// Budget for the round after one that used `cap`: grow by the factor,
// never past `ceiling` (0 = no ceiling) nor past what LimitedInStream
// can represent. Returns `cap` itself when no growth is possible.
qlib::quint64 nextSniffCap(qlib::quint64 cap, qlib::quint64 ceiling)
{
  const qlib::quint64 kRepresentable =
      static_cast<qlib::quint64>(std::numeric_limits<qlib::qint64>::max());
  qlib::quint64 next;
  if (cap > kRepresentable / qsys::StreamManager::SNIFF_GROWTH_FACTOR)
    next = kRepresentable;
  else
    next = cap * qsys::StreamManager::SNIFF_GROWTH_FACTOR;
  if (ceiling > 0 && next > ceiling) next = ceiling;
  return next;
}

}  // namespace

// Shared core of searchReader{,s}ByContent. When `bFirstOnly` is true,
// returns at the first YES verdict (no further readers are queried);
// otherwise collects every YES match and joins them with ','.
LString StreamManager::searchByContentImpl(const LString &path,
                                           const LString &nicknames_csv,
                                           int nCatID,
                                           bool supportCompression,
                                           bool bFirstOnly,
                                           qlib::quint64 maxBytes) const
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

  // Short-circuit by extension when transparent decompression is off:
  // the raw bytes of a .gz / .xz file would never match any reader's
  // canHandleContent(), so don't waste a file open.
  if (!supportCompression) {
    LString lowered = path.toLowerCase();
    if (lowered.endsWith(".gz") || lowered.endsWith(".xz")) {
      return LString();
    }
  }

  // Probe magic bytes once -- candidates share the encoding decision.
  HeadEncoding enc = supportCompression ? detectEncoding(path) : ENC_RAW;

  // Escalation loop. Every candidate starts with SNIFF_INITIAL_BYTES.
  // A candidate whose UNKNOWN was caused by the budget running out
  // (truncated) is kept pending and asked again with a budget grown by
  // SNIFF_GROWTH_FACTOR; everything else (YES, NO, UNKNOWN at true
  // EOF, decisive early UNKNOWN, exception) is final after one call.
  // `maxBytes` is the ceiling of that growth (0 = no ceiling: grow
  // until every pending reader reaches EOF or a verdict).
  struct Candidate
  {
    const ReaderInfo *pInfo;
    std::unique_ptr<ObjReader> pRdr;
    bool pending;
    bool yes;
  };
  std::vector<Candidate> cands;
  cands.reserve(candidates.size());
  for (const ReaderInfo *pInfo : candidates) {
    qlib::LClass *pCls = pInfo->pClass;
    MB_ASSERT(pCls != NULL);
    ObjReader *pRdr = dynamic_cast<ObjReader *>(pCls->createObj());
    if (pRdr == NULL) continue;
    cands.push_back(Candidate{pInfo, std::unique_ptr<ObjReader>(pRdr), true, false});
  }

  const qlib::quint64 ceiling = maxBytes;
  qlib::quint64 cap = SNIFF_INITIAL_BYTES;
  if (ceiling > 0 && ceiling < cap) cap = ceiling;

  for (int round = 1;; ++round) {
    int nPending = 0;
    for (Candidate &c : cands) {
      if (!c.pending) continue;
      SniffResult r = sniffWithChain(*c.pRdr, path, enc, cap);
      if (r.verdict == ObjReader::CONTENT_YES) {
        c.pending = false;
        c.yes = true;
        if (bFirstOnly) return c.pInfo->nickname;
      }
      else if (r.truncated) {
        ++nPending;
      }
      else {
        c.pending = false;
      }
    }
    if (nPending == 0) break;
    if (ceiling > 0 && cap >= ceiling) break;
    const qlib::quint64 next = nextSniffCap(cap, ceiling);
    if (next <= cap) break;
    MB_DPRINTLN("StreamManager> sniff round %d: %d reader(s) truncated at %llu bytes, retrying with %llu",
                round, nPending, static_cast<unsigned long long>(cap),
                static_cast<unsigned long long>(next));
    cap = next;
  }

  // Multi-match: report YES readers in candidate (ABI name) order,
  // independent of the round in which each one decided.
  qlib::LStringList hits;
  for (const Candidate &c : cands) {
    if (c.yes) hits.push_back(c.pInfo->nickname);
  }

  if (hits.empty()) return LString();
  return LString::join(",", hits);
}

LString StreamManager::searchReadersByContent(
    const LString &path, const LString &nicknames_csv, int nCatID,
    bool supportCompression, qlib::quint64 maxBytes) const
{
  return searchByContentImpl(path, nicknames_csv, nCatID, supportCompression,
                             /*bFirstOnly=*/false, maxBytes);
}

LString StreamManager::searchReaderByContent(
    const LString &path, const LString &nicknames_csv, int nCatID,
    bool supportCompression, qlib::quint64 maxBytes) const
{
  return searchByContentImpl(path, nicknames_csv, nCatID, supportCompression,
                             /*bFirstOnly=*/true, maxBytes);
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


