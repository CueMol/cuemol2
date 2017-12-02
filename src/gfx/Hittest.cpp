// -*-Mode: C++;-*-
//
//  Default hittest implementation
//

#include <common.h>

#include "Hittest.hpp"
#include "HittestContext.hpp"

using namespace gfx;

RawHitData::~RawHitData()
{
}

HitData::~HitData()
{
  clear();
}

void HitData::clear()
{
  BOOST_FOREACH(const data_t::value_type &ee, m_data) {
    delete ee.second;
  }
  m_data.clear();
  m_nNrRendID = qlib::invalid_uid;
}

HitData::HitEntry *HitData::getOrCreateEntry(qlib::uid_t rend_id)
{
  data_t::const_iterator iter = m_data.find(rend_id);
  if (iter==m_data.end()) {
    HitEntry *pRet = MB_NEW HitEntry();
    pRet->rend_id = rend_id;
    m_data.insert(data_t::value_type(rend_id, pRet));
    return pRet;
  }
  return iter->second;
}

void HitData::createNearest(HittestContext *phc)
{
  m_nNrRendID = qlib::invalid_uid;

  int nrend = phc->m_data.size();
  if (nrend==0) // no hit
    return;

  MB_DPRINTLN("HitTest> hit nrend=%d", nrend);

  float minz = 1.0e10;
  int i=0, mini;
  qlib::uid_t rend_id;
  BOOST_FOREACH (const HittestContext::DataElem &de, phc->m_data) {
    if (de.z < minz) {
      minz = de.z;
      mini = i;
      rend_id = de.rendid;
    }
    i++;
  }

  const HittestContext::DataElem &de = phc->m_data[mini];
  gfx::HitData::HitEntry *pEnt = getOrCreateEntry(rend_id);

  // make index
  unsigned int ind = pEnt->data.size();
  pEnt->index.push_back(ind);

  // copy to data array
  BOOST_FOREACH (int j, de.names) {
    pEnt->data.push_back(j);
    MB_DPRINTLN("id = %d", j);
  }

  m_nNrRendID = rend_id;
}

void HitData::createAll(HittestContext *phc)
{
  m_nNrRendID = qlib::invalid_uid;

  int nrend = phc->m_data.size();
  if (nrend==0) // no hit
    return;

  MB_DPRINTLN("HitTest> hit nrend=%d", nrend);

  float minz = 1.0e10;
  qlib::uid_t rend_id;
  BOOST_FOREACH (const HittestContext::DataElem &de, phc->m_data) {
    if (de.z < minz) {
      minz = de.z;
      rend_id = de.rendid;
    }

    gfx::HitData::HitEntry *pEnt = getOrCreateEntry(de.rendid);

    // make index
    unsigned int ind = pEnt->data.size();
    pEnt->index.push_back(ind);

    // copy to data array
    BOOST_FOREACH (int j, de.names) {
      pEnt->data.push_back(j);
      MB_DPRINTLN("id = %d", j);
    }
  }

  m_nNrRendID = rend_id;
}

int HitData::getRendArray(qlib::uid_t *pBuf, int nBufSize) const
{
  data_t::const_iterator biter = m_data.begin();
  data_t::const_iterator eiter = m_data.end();
  int i;
  for (i=0; i<nBufSize && biter!=eiter; ++i, ++biter)
    pBuf[i] = biter->first;

  return i;
}

int HitData::getDataSize(qlib::uid_t rend_id) const
{
  data_t::const_iterator iter = m_data.find(rend_id);
  if (iter==m_data.end())
    return 0;
  HitEntry *pEnt = iter->second;
  //return pEnt->intdata.size();
  return pEnt->index.size();
}

int HitData::getDataAt(qlib::uid_t rend_id, int ii, int subii) const
{
  HitEntry *pEnt;

  data_t::const_iterator iter = m_data.find(rend_id);
  if (iter==m_data.end())
    return -1;
  pEnt = iter->second;

  if (ii>=pEnt->index.size()) {
    MB_DPRINTLN("HitTest> rend ID %d; main index (%d) is out of bound", rend_id, ii);
    return -1;
  }

  int intn_start = pEnt->index.at(ii);
  int intn_end;
  if (ii<pEnt->index.size()-1)
    intn_end = pEnt->index.at(ii+1);
  else
    intn_end = pEnt->data.size();

  if (subii>=intn_end-intn_start) {
    MB_DPRINTLN("HitTest> rend ID %d; mainindex (%d), subindex(%d) is out of bound",
                rend_id, ii, subii);
    return -1;
  }

  return pEnt->data.at(intn_start+subii);
}

///////////////////////////////////////////////////////////////////

HittestList::~HittestList()
{
}

void HittestList::drawPointHit(int nid, const Vector4D &pos)
{
  m_data.push_back(HitElem());
  HitElem &he = m_data.back();
  he.pos = pos;
  he.pos.w() = 1.0;
  he.id = nid;
  //MB_DPRINTLN("names size=%d, nid=%d %d", he.names.size(), nid, he.names[nnm-1]);
}

///////////////////////////////////////////////////////////////////

void HittestContext::pushMatrix()
{
  MB_DPRINTLN("Hit(%p) pushMat %d", this, m_matstack.size());
  if (m_matstack.size()<=0)
    m_matstack.push_front(Matrix4D());
  else
    m_matstack.push_front(m_matstack.front());
}

void HittestContext::popMatrix()
{
  MB_DPRINTLN("Hit(%p) popMat %d", this, m_matstack.size());
  if (m_matstack.size()<=1) {
    LString msg("Hittest> FATAL ERROR: cannot popMatrix()!!");
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }
  m_matstack.pop_front();
}

void HittestContext::multMatrix(const Matrix4D &mat)
{
  Matrix4D top = m_matstack.front();
  top.matprod(mat);
  m_matstack.front() = top;
}

void HittestContext::loadMatrix(const Matrix4D &mat) {
  m_matstack.front() = mat;
}

const qlib::Matrix4D &HittestContext::topMatrix() const {
  if (m_matstack.size()<1) {
    LString msg("Hittest> FATAL ERROR: cannot topMatrix()!!");
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::RuntimeException, msg);
  }
  return m_matstack.front();
}

void HittestContext::loadName(int nameid) {
  MB_DPRINTLN("HitCtxt> load name %d", nameid);
  m_names.front() = nameid;
}

void HittestContext::pushName(int nameid) {
  MB_DPRINTLN("HitCtxt> push name %d", nameid);
  m_names.push_front(nameid);
}

void HittestContext::popName() {
  MB_DPRINTLN("HitCtxt> pop name");
  if (m_names.size()<=1) {
    LString msg("HittestList> FATAL ERROR: cannot popName()!!");
    LOG_DPRINTLN(msg);
    MB_THROW(qlib::RuntimeException, msg);
    return;
  }
  m_names.pop_front();
}

void HittestContext::callDisplayList(DisplayContext *pdl)
{
  HittestList *phl = dynamic_cast<HittestList *>(pdl);
  if (phl==NULL)
    return;

  // m_data.push_back(phl);

  topMatrix().dump();

  BOOST_FOREACH (const HittestList::HitElem &elem, phl->m_data) {
    Vector4D vv = topMatrix().mulvec(elem.pos);
    vv = m_projMat.mulvec(vv);

    //MB_DPRINTLN("***** (%f,%f,%f)->(%f,%f,%f)",
    //elem.pos.x(), elem.pos.y(), elem.pos.z(),
    //vv.x(), vv.y(), vv.z());

    // XXX: z<1.2 is empilical value limit that can be seen in the fog
    if (vv.x()>-1.0 && vv.x()<1.0 &&
        vv.y()>-1.0 && vv.y()<1.0 &&
        //vv.z()>-1.0 && vv.z()<1.0) {
        vv.z()>0.0 && vv.z()<1.2) {
      MB_DPRINT("[%d %d]", m_nCurUID, elem.id);
      MB_DPRINTLN(" (%f,%f,%f)",
                  elem.pos.x(), elem.pos.y(), elem.pos.z());

      m_data.push_back(DataElem());
      DataElem &he = m_data.back();
      he.z = vv.z();
      he.rendid = m_nCurUID;
      he.names.resize(m_names.size()+1-1);
      int j;
      for (j=1; j<m_names.size(); ++j)
        he.names[j-1] = m_names[j];
      he.names[j-1] = elem.id;
    }
  }
}
