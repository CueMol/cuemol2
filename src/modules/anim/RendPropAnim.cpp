// -*-Mode: C++;-*-
//
// RendPropAnim: superclass of renderer's property animation objects
//

#include <common.h>

#include "RendPropAnim.hpp"
#include <qsys/anim/AnimMgr.hpp>
#include <qsys/Scene.hpp>

using namespace anim;

RendPropAnim::RendPropAnim()
     : PropAnim()
{
}

RendPropAnim::RendPropAnim(const RendPropAnim &arg)
     : PropAnim(arg),
       m_propName(arg.m_propName), m_rendNames(arg.m_rendNames)
{
}

RendPropAnim::~RendPropAnim()
{
}

/////////////////////////////////////////////

LString RendPropAnim::getPropName() const
{
  return m_propName;
}

void RendPropAnim::setPropName(LString val)
{
  m_propName = val;
}

/////////////////////////////////////////////

LString RendPropAnim::getRendNames() const
{
  return m_rendNames;
}

void RendPropAnim::setRendNames(LString val)
{
  // invalidate uid cache
  m_rendPtrList.clear();
  m_rendNameList.clear();

  // extract comma-separated name list
  std::list<LString> ls, tmpl;
  val.split(',', ls);
  
  BOOST_FOREACH (const LString &elem, ls) {
    LString sobj, srend;
    int spos = elem.indexOf('/');
    if (spos<0) {
      srend = elem.trim();
      if (!srend.isEmpty())
        tmpl.push_back(srend);
    }
    else {
      sobj = elem.substr(0, spos).trim();
      srend = elem.substr(spos+1).trim();
      if (!sobj.isEmpty() && !srend.isEmpty())
        tmpl.push_back(sobj+"/"+srend);
    }

    m_rendNameList.push_back(nmlist_t::value_type(sobj, srend));
  }

  m_rendNames = LString::join(",", tmpl);
}

/////////////////////////////////////////////

void RendPropAnim::getTgtUIDs(qsys::AnimMgr *pMgr, std::vector<qlib::uid_t> &arry)
{
  int ntotal = m_rendNameList.size();
  arry.reserve(ntotal);

  qsys::ScenePtr pSc = pMgr->getTgtScene();
  fillRendArray(pSc);
  BOOST_FOREACH (qsys::RendererPtr pRend, m_rendPtrList) {
    arry.push_back(pRend->getUID());
  }
}

void RendPropAnim::fillRendArray(qsys::ScenePtr pScene)
{
  if (!m_rendPtrList.empty())
    return;

  int ntotal = m_rendNameList.size();
  m_rendPtrList.reserve(ntotal);

  BOOST_FOREACH (const nmlist_t::value_type &elem, m_rendNameList) {
    const LString &sobj = elem.first;
    const LString &srend = elem.second;
    if (sobj.isEmpty()) {
		qsys::RendererPtr pRend = pScene->getRendByName(srend);
      if (!pRend.isnull())
        m_rendPtrList.push_back( pRend );
    }
    else {
		qsys::ObjectPtr pObj = pScene->getObjectByName(sobj);
      if (!pObj.isnull()) {
		  qsys::RendererPtr pRend = pObj->getRendByName(srend);
        if (!pRend.isnull())
          m_rendPtrList.push_back( pRend );
      }
    }
  }
}

void RendPropAnim::setVisible(qsys::RendererPtr pRend, bool value)
{
  bool bOld;
  pRend->getPropBool("visible", bOld);
  if (bOld==value)
    return;
  pRend->setPropBool("visible", value);
}


