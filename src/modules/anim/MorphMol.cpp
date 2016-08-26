// -*-Mode: C++;-*-
//
// Molecular morphing animation object class
//

#include <common.h>

#include "MorphMol.hpp"

#include <qlib/Utils.hpp>
#include <qsys/EditInfo.hpp>
#include <qsys/UndoManager.hpp>
#include <modules/molstr/MolArrayMap.hpp>
#include <modules/molstr/MolAtom.hpp>

using namespace anim;
using molstr::MolArrayMap;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::SelectionPtr;

using qlib::LDom2Node;

MorphMol::MorphMol()
     : super_t()
{
  m_nAtoms = -1;
  m_dframe = 0.0;
  m_bScaleDframe = false;
}

MorphMol::~MorphMol()
{
  std::for_each(m_frames.begin(), m_frames.end(), qlib::delete_ptr<FrameData*>());
}

/*
void MorphMol::readerDetached()
{
  // setup frame crds using m_frames data
  setupData();
}
*/

/////////////////////////////////////////////////////
// Frame data implementation

bool FrameData::isDataSrcWritable() const
{
  return true;
}

LString FrameData::getDataChunkReaderName() const
{
  return LString("qdfpdb");
}

void FrameData::setDataChunkName(const LString &name, qlib::LDom2Node *pNode)
{
  LString src_type = getDataChunkReaderName();

  // set props
  m_src = name;
  m_srctype = src_type;

  // update node values
  pNode->setStrAttr("srctype", src_type);
  pNode->setStrAttr("src", name);
}

void FrameData::writeDataChunkTo(qlib::LDom2OutStream &oos) const
{
  if (m_pMol.isnull())
    return;
  m_pMol->writeDataChunkTo(oos);
}

void FrameData::readFromStream(qlib::InStream &ins)
{
  m_pMol = MolCoordPtr(MB_NEW MolCoord);
  m_pMol->setName(m_name);
  m_pMol->setSource(m_src);
  m_pMol->setAltSource(m_altsrc);
  m_pMol->setSourceType(m_srctype);
  m_pMol->readFromStream(ins);
  m_crds.resize(0);
}

void FrameData::updateSrcPath(const LString &srcpath)
{
  m_src = srcpath;
  m_altsrc = "";
}

/////////////////////////////////////////////////////
// MorphMol specific operations

void MorphMol::writeDataChunkTo(qlib::LDom2OutStream &oos) const
{
#if 0
  int i;
  int nfrms = m_frames.size();
  int nthis = -1;
  for (int i=0; i<nfrms; ++i) {
    FrameData *pFrm = m_frames[i];

    if ( pFrm->m_srctype.equals("<this>") ) {
      nthis = i;
      break;
    }
  }

  if (0<=nthis && nthis<nfrms && m_frames[nthis]!=NULL) {
    for (i=0; i<m_nAtoms; ++i) {
      int aid = m_id2aid[i];
      MolAtomPtr pAtom = getAtom(aid);
      if (pAtom.isnull()) {
        LOG_DPRINTLN("MorphMol::update mol mismatch at ID=%d (ignored)", i);
      }
      qlib::Vector4D pos(m_frames[nthis]->m_crds.at(i*3),
                         m_frames[nthis]->m_crds.at(i*3+1),
                         m_frames[nthis]->m_crds.at(i*3+2));
      pAtom->setPos(pos);
    }
  }
#endif
  
  super_t::writeDataChunkTo(oos);
}

void MorphMol::forceEmbed()
{
  super_t::forceEmbed();

  int nfrms = m_frames.size();
  for (int i=0; i<nfrms; ++i) {
    FrameData *pFrm = m_frames[i];

    if (pFrm->m_srctype.equals("<this>"))
      continue;

    pFrm->m_src = "datachunk:";
    pFrm->m_altsrc = "";
    pFrm->m_srctype = "";
  }  
}

void MorphMol::readFromStream(qlib::InStream &ins)
{
  super_t::readFromStream(ins);

  // setup <this>
  MolCoordPtr pthis(this);
  MolArrayMap thisset;
  thisset.setup(pthis);
  m_nAtoms = thisset.size();
  m_id2aid.resize(m_nAtoms);
  thisset.convertID(m_id2aid);

  int nfrms = m_frames.size();
  for (int i=0; i<nfrms; ++i) {
    FrameData *pFrm = m_frames[i];

    if ( !pFrm->m_srctype.equals("<this>") )
      continue;

    // copy default (<this>) coordinates to m_crds array
    pFrm->m_crds.resize(m_nAtoms*3);
    thisset.convertf( pFrm->m_crds );
  }

}


/// setup frames data
void MorphMol::setupData()
{
  // <this> should have been setup here
  MolCoordPtr pthis(this);
  MolArrayMap thisset;
  thisset.setup(pthis);

  int nfrms = m_frames.size();
  for (int i=0; i<nfrms; ++i) {
    FrameData *pFrm = m_frames[i];

    if ( pFrm->m_srctype.equals("<this>") ) {
      //pFrm->m_crds.resize(m_nAtoms*3);
      //thisset.convertf( pFrm->m_crds );
      // <this> should have been setup here
      continue;
    }
    else {
      // copy <frame> coordinates
      MolCoordPtr pmol = pFrm->m_pMol;

      MolArrayMap aset;
      aset.setup(pmol);

      /*
      if (m_nAtoms!=aset.size()) {
        LOG_DPRINTLN("MorphMol Error: atom size mismatch (%d != %d)",
                    aset.size(), m_nAtoms);

        // copy default (<this>) coordinates to m_crds array
        pFrm->m_crds.resize(m_nAtoms*3);
        thisset.convertf( pFrm->m_crds );
        continue;
      }
       */

      // copy coordinates to m_crds array
      pFrm->m_crds.resize(m_nAtoms*3);
      // set default positions (same as <this> frm)
      thisset.convertf( pFrm->m_crds );
      {
        int nset = 0;
        MolArrayMap::const_iterator iter = aset.begin();
        for (; iter!=aset.end(); ++iter) {
          const molstr::MolArrayMapElem &key = iter->first;
          int ind = thisset.getIndex(key);
          if (ind<0)
            continue;
          Vector4D pos = iter->first.pA->getPos();
          pFrm->m_crds[ind*3] = (float)pos.x();
          pFrm->m_crds[ind*3+1] = (float)pos.y();
          pFrm->m_crds[ind*3+2] = (float)pos.z();
          ++nset;
        }
        LOG_DPRINTLN("Morph frame <%s> aname match=%d of %d", pFrm->m_name.c_str(), nset, m_nAtoms);
      }
      // aset.convertf( pFrm->m_crds );
    }
  }
}

using molstr::MolCoordPtr;

namespace {

class MorphMolEditInfo : public qsys::EditInfo
{
public:
  qlib::uid_t m_nTgtUID;

  enum {
    MME_ADD,
    MME_REMOVE,
  };

  int m_nMode;

  int m_nInsBefore;
  MolCoordPtr m_pTgtMol;

  MorphMolEditInfo() : m_nTgtUID(qlib::invalid_uid), m_nMode(0), m_nInsBefore(0)
  {
  }

  virtual ~MorphMolEditInfo()
  {
  }

  MorphMol *getTarget() const {
    return qlib::ObjectManager::sGetObj<MorphMol>(m_nTgtUID);
  }

  /// Perform undo
  virtual bool undo()
  {
    MB_DPRINTLN("MorphMol Undo mode=%d", m_nMode);

    MorphMol *pTgt = getTarget();
    if (pTgt==NULL)
      return false;
    
    switch (m_nMode) {
    case MME_REMOVE:
      pTgt->insertBefore(m_pTgtMol, m_nInsBefore);
      break;

    case MME_ADD:
      pTgt->removeFrame(m_nInsBefore);
      break;

    default:
      return false;
    }
    return true;
  }
  
  /// Perform redo
  virtual bool redo()
  {
    MB_DPRINTLN("MorphMol Redo mode=%d", m_nMode);

    MorphMol *pTgt = getTarget();
    if (pTgt==NULL)
      return false;
    
    switch (m_nMode) {
    case MME_REMOVE:
      pTgt->removeFrame(m_nInsBefore);
      break;

    case MME_ADD:
      pTgt->insertBefore(m_pTgtMol, m_nInsBefore);
      break;

    default:
      return false;
    }
    return true;
  }
  
  virtual bool isUndoable() const {
    if (m_pTgtMol.isnull()) return false;
    return true;
  }
  virtual bool isRedoable() const {
    if (m_pTgtMol.isnull()) return false;
    return true;
  }

};
}

/// Append new coordinates frame
void MorphMol::insertBefore(MolCoordPtr pmol, int index)
{
  int nfrms = m_frames.size();

  FrameData *pFrm = NULL;
  pFrm = MB_NEW FrameData;
  pFrm->m_name = pmol->getName();
  pFrm->m_src = pmol->getSource();
  // pFrm->m_altsrc = altsrc;
  pFrm->m_srctype = pmol->getSourceType();
  pFrm->m_pMol = pmol;
  pFrm->m_crds.resize(0);
  
  if (index<0 || nfrms<=index) {
    // append to the end of the list
    m_frames.push_back(pFrm);
  }
  else {
    FrameArray::iterator iter = m_frames.begin();
    iter += index;
    m_frames.insert(iter, pFrm);
  }

  // setup undo info
  qsys::UndoUtil uu(getScene());
  if (uu.isOK()) {
    MorphMolEditInfo *pInfo = MB_NEW MorphMolEditInfo();
    pInfo->m_nMode = MorphMolEditInfo::MME_ADD;
    pInfo->m_nInsBefore = index;
    pInfo->m_pTgtMol = pmol;
    pInfo->m_nTgtUID = getUID();
    uu.add(pInfo);
  }

  return;
}

void MorphMol::removeFrame(int index)
{
  int nfrms = m_frames.size();
  
  if (index<0 || nfrms<=index) {
    // ERROR (out of index)
    return;
  }

  FrameArray::iterator iter = m_frames.begin();
  iter += index;
  FrameData *pFrm = *iter;

  if (pFrm->m_srctype.equals("<this>") ) {
    // ERROR (cannot remove this frm)
    return;
  }

  m_frames.erase(iter);

  MolCoordPtr pmol = pFrm->m_pMol;
  pFrm->m_crds.resize(0);
  pFrm->m_pMol = MolCoordPtr();
  delete pFrm;

  // setup undo info
  qsys::UndoUtil uu(getScene());
  if (uu.isOK()) {
    MorphMolEditInfo *pInfo = MB_NEW MorphMolEditInfo();
    pInfo->m_nMode = MorphMolEditInfo::MME_REMOVE;
    pInfo->m_nInsBefore = index;
    pInfo->m_pTgtMol = pmol;
    pInfo->m_nTgtUID = getUID();
    uu.add(pInfo);
  }

}

LString MorphMol::getFrameInfoJSON() const
{
  FrameArray::const_iterator iter = m_frames.begin();
  FrameArray::const_iterator eiter = m_frames.end();

  LString rval = "[";
  int i=0;
  for (; iter!=eiter; ++iter, ++i) {
    FrameData *pFrm = *iter;
    if (i>0)
      rval += ",";
    // LString name = "(noname)";
    // if (!pFrm->m_pMol.isnull())
    LString name = pFrm->m_name;

    if (pFrm->m_srctype.equals("<this>"))
      name = "(this)";

    rval += "{";
    rval += "\"name\": \"" + name + "\",";
    rval += "\"src\": \"" + pFrm->m_src.escapeQuots() + "\",";
    rval += "\"srctype\": \"" + pFrm->m_srctype + "\"";
    rval += "}";
  }
  rval += "]";

  return rval;
}

void MorphMol::appendThisFrame()
{
  if (m_frames.size()>0)
    return;
  
  // setup <this>
  MolCoordPtr pthis(this);
  MolArrayMap thisset;
  thisset.setup(pthis);
  m_nAtoms = thisset.size();
  m_id2aid.resize(m_nAtoms);
  thisset.convertID(m_id2aid);

  FrameData *pFrm = MB_NEW FrameData;
  pFrm->m_srctype = "<this>";
  pFrm->m_src = "";
  pFrm->m_altsrc = "";
  pFrm->m_crds.resize(m_nAtoms*3);
  thisset.convertf( pFrm->m_crds );
  
  m_frames.push_back(pFrm);
  return;
}

void MorphMol::update(double dframe)
{
  int i;
  const int nframes = m_frames.size();

  // check data loaded
  for (i=0; i<nframes; ++i) {
    if (m_frames[i]->m_crds.size()<=0) {
      // non-prepared frame found
      // --> setup all frames and quit checking
      setupData();
      break;
    }
  }

  if (m_nAtoms<0) return;

  double xx;
  if (m_bScaleDframe) {
    // dframe changes between 0.0 and nfrm-1
    xx = qlib::trunc(dframe, 0.0, double(nframes-1));
  }
  else {
    // dframe changes between 0.0 and 1.0
    xx = qlib::trunc(dframe, 0.0, 1.0) * double(nframes-1);
  }

  int ifrm = int( ::floor(xx) );
  double rho = xx - double(ifrm);

  int ncrd = m_nAtoms*3;
  PosArray curtmp(ncrd);

  if (ifrm==m_frames.size()-1 || qlib::isNear4(rho, 0.0) ) {
    // ifrm is the last frame
    // rho is almost zero
    //   --> use ifrm (and not interpolate between ifrm~ifrm+1)
    for (i=0; i<ncrd; ++i) {
      curtmp[i] = m_frames[ifrm]->m_crds.at(i);
    }
  }
  else {
    // interpolate between ifrm~ifrm+1
    for (i=0; i<ncrd; ++i) {
      const double x0 = m_frames[ifrm]->m_crds.at(i);
      const double x1 = m_frames[ifrm+1]->m_crds.at(i);
      curtmp[i] = x0*(1.0-rho) + x1*rho;
    }
  }
  
  for (i=0; i<m_nAtoms; ++i) {
    int aid = m_id2aid[i];
    MolAtomPtr pAtom = getAtom(aid);
    if (pAtom.isnull()) {
      LOG_DPRINTLN("MorphMol::update mol mismatch at ID=%d (ignored)", i);
    }
    qlib::Vector4D pos(curtmp[i*3],
                       curtmp[i*3+1],
                       curtmp[i*3+2]);
    pAtom->setPos(pos);
  }

  // broadcast modification event
  fireAtomsMoved();
}

/*void MorphMol::setScaleFrame(bool b)
{
  m_bScaleDframe = b;
  update(m_dframe);
  }*/

void MorphMol::writeTo2(LDom2Node *pNode) const
{
  super_t::writeTo2(pNode);

  LDom2Node *pFSNode = pNode->appendChild("frames");

  int nfrms = m_frames.size();
  for (int i=0; i<nfrms; ++i) {
    FrameData *pFrm = m_frames[i];
    if (pFrm->m_srctype.equals("<this>") ) {
      pFSNode->appendChild("this");
    }
    else {
      LDom2Node *pCCNode = pFSNode->appendChild("mol");

      const LString &src_str = pFrm->m_src;

      if (!src_str.startsWith("datachunk:")) {
        // External data source:
        // Convert to relative path from basedir, if possible.
        
        // AltSrc should be always absolute path and readable (normalization)
        LString alt_src_str = pFrm->m_altsrc;
        convSrcPath(src_str, alt_src_str, pCCNode, false);
      }
      else {
        //  ( embedded --> no path name conv, reader opts, and altpath aren't required. )
        pCCNode->setStrAttr("src", src_str);
        pCCNode->requestDataEmbed(pFrm);
      }

      pCCNode->setStrAttr("srctype", pFrm->m_srctype);
      pCCNode->setStrAttr("name", pFrm->m_name);
    }
  }
}

void MorphMol::readFrom2(LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  LDom2Node *pFSNode = pNode->findChild("frames");
  if (pFSNode==NULL)
    return;

  for (pFSNode->firstChild(); pFSNode->hasMoreChild(); pFSNode->nextChild()) {
    LDom2Node *pChNode = pFSNode->getCurChild();
    LString tag = pChNode->getTagName();

    FrameData *pFrm = NULL;

    for (;;) {
      if (tag.equals("mol")) {
        LString src = pChNode->getStrAttr("src");
        LString name = pChNode->getStrAttr("name");
        LString altsrc = pChNode->getStrAttr("alt_src");
        LString srctype = pChNode->getStrAttr("srctype");
        
        MB_DPRINTLN("MorphMol: src=%s, alt_src=%s, stctype=%s",
                    src.c_str(), altsrc.c_str(), srctype.c_str());
        // check validity of src/srctype
        if (srctype.isEmpty()) {
          // no srctype --> ignore entry
          break;
        }

        pFrm = MB_NEW FrameData;
        pFrm->m_name = name;
        pFrm->m_src = src;
        pFrm->m_altsrc = altsrc;
        pFrm->m_srctype = srctype;

        // request data loading for morphframes
        pChNode->requestDataLoad(src, altsrc, srctype, pFrm);
      }
      else if (tag.equals("this")) {
        pFrm = MB_NEW FrameData;
        pFrm->m_src = "";
        pFrm->m_altsrc = "";
        pFrm->m_srctype = "<this>";
      }

      // OK
      break;
    }
    
    if (pFrm!=NULL)
      m_frames.push_back(pFrm);
  }
}

