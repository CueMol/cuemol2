// -*-Mode: C++;-*-
//
// Color profile manager
//

#include <common.h>

#include "ColProfMgr.hpp"
#include <qlib/Utils.hpp>

SINGLETON_BASE_IMPL(gfx::ColProfMgr);

using namespace gfx;

ColProfMgr::~ColProfMgr()
{
  std::for_each(m_data.begin(), m_data.end(), qlib::delete_ptr2<data_t::value_type>());
}

void ColProfMgr::registerCms(qlib::uid_t uid)
{
  if (getCmsByID(uid)!=NULL)
    return;
  CmsXform *pObj = MB_NEW CmsXform();
  m_data.insert(data_t::value_type(uid, pObj));
}

void ColProfMgr::unregCms(qlib::uid_t uid)
{
  data_t::iterator iter = m_data.find(uid);
  if (iter==m_data.end())
    return;
  delete iter->second;
  m_data.erase(iter);
}

CmsXform *ColProfMgr::getCmsByID(qlib::uid_t uid) const
{
  data_t::const_iterator iter = m_data.find(uid);
  if (iter==m_data.end())
    return NULL;
  return iter->second;
}

/////////////////////////

//static
bool ColProfMgr::init()
{
  return qlib::SingletonBase<ColProfMgr>::init();
}

//static
void ColProfMgr::fini()
{
  qlib::SingletonBase<ColProfMgr>::fini();
  /*BOOST_FOREACH (data_t::value_type &elem, m_data) {
    delete elem.second;
  }*/
}

//static
void ColProfMgr::sRegUID(qlib::uid_t uid)
{
  ColProfMgr *pMgr = ColProfMgr::getInstance();
  pMgr->registerCms(uid);
}

//static
void ColProfMgr::sUnregUID(qlib::uid_t uid)
{
  ColProfMgr *pMgr = ColProfMgr::getInstance();
  pMgr->unregCms(uid);
}


