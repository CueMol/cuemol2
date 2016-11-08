// -*-Mode: C++;-*-
//
// Density object class
//
// $Id: DensityMap.cpp,v 1.4 2010/09/11 17:54:46 rishitani Exp $

#include <common.h>
#include "LWObject.hpp"
#include "LWRenderer.hpp"

#ifndef QM_BUILD_LW
#  include "QdfLWObjWriter.hpp"
#endif

using namespace lwview;

// default constructor
LWObject::LWObject()
{
}

LWObject::~LWObject()
{
}

void LWObject::endBuild()
{
  // make hitdata array
  buildHitData();
}


/// register new hitdata (to build hitdata structure)
int LWObject::addPointHit(int nid, const Vector4D &pos, const LString &msg)
{
  AidDataSet::const_iterator iter = m_aidDataSet.find(nid);
  if (iter!=m_aidDataSet.end()) {
    // already registerd
    return iter->second;
  }
  int rval = m_tmpHitList.size();
  m_tmpHitList.push_back(LWHitData(pos, msg));
  m_aidDataSet.insert(AidDataSet::value_type(nid, rval));
  return rval;
}

void LWObject::buildHitData()
{
  const int nsize = m_tmpHitList.size();
  m_hitdata.resize(nsize);
  int i=0;
  BOOST_FOREACH (const LWHitData &elem, m_tmpHitList) {
    m_hitdata[i] = elem;
    ++i;
  }
  m_tmpHitList.clear();
}


//////////

LString LWObject::getDataChunkReaderName(int nQdfVer) const
{
  return LString("qdflwobj");
}

void LWObject::writeDataChunkTo(qlib::LDom2OutStream &oos) const
{
#ifndef QM_BUILD_LW
  QdfLWObjWriter writer;
  writer.setVersion(oos.getQdfVer());
  writer.setEncType(oos.getQdfEncType());

  LWObject *pthis = const_cast<LWObject *>(this);
  writer.attach(qsys::ObjectPtr(pthis));
  writer.write(oos);
  writer.detach();
#endif
}

