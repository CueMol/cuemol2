// -*-Mode: C++;-*-
//
// In/Out handler abstract class
//
// $Id: InOutHandler.cpp,v 1.4 2011/01/03 16:47:05 rishitani Exp $

#include <common.h>

#include "InOutHandler.hpp"
#include <qlib/FileStream.hpp>
#include <qlib/LDOM2Tree.hpp>

//#ifdef HAVE_BOOST_THREAD
#define BOOST_LIB_DIAGNOSTIC 1
//#define BOOST_DYN_LINK 1
#define BOOST_ALL_DYN_LINK 1

#ifdef USE_BOOST_TIMER
#include <boost/timer/timer.hpp>
#endif

using namespace qsys;

InOutHandler::InOutHandler()
     : m_pTimerObj(NULL)
{
}

InOutHandler::~InOutHandler()
{
}

LString InOutHandler::getPath(const LString &key) const
{
  // return m_stream.getPath(key);
  return m_stab.get(key);
}

void InOutHandler::setPath(const LString &key, const LString &path)
{
  // m_stream.setPath(key, path);
  m_stab.forceSet(key, path);
}
    
qlib::OutStream *InOutHandler::createOutStream(const LString &key) const
{
  qlib::FileOutStream *pRet = MB_NEW qlib::FileOutStream();
  pRet->open( getPath(key) );
  return pRet;
}

qlib::InStream *InOutHandler::createInStream(const LString &key) const
{
  qlib::FileInStream *pRet = MB_NEW qlib::FileInStream();
  pRet->open( getPath(key) );
  return pRet;
}

int InOutHandler::getCompressMode() const
{
  return COMP_NONE;
}

void InOutHandler::setCompressMode(int)
{
}

bool InOutHandler::getBase64Flag() const
{
  return false;
}

void InOutHandler::setBase64Flag(bool)
{
}

void InOutHandler::writeTo2(qlib::LDom2Node *pNode) const
{
  super_t::writeTo2(pNode);

  if (m_stab.size()<2) return;

  // Save the sub-stream information to the node tree

  qlib::LDom2Node *pChNode = pNode->appendChild("subsrc");

  qlib::MapTable<LString>::const_iterator iter = m_stab.begin();
  qlib::MapTable<LString>::const_iterator endi = m_stab.end();
  for (; iter!=endi; ++iter) {
    const LString &key = iter->first;
    if (key.isEmpty()) continue;
    
    qlib::LDom2Node *pChChNode = pChNode->appendChild(key);
    pChChNode->appendStrAttr("src", iter->second);
  }
}

void InOutHandler::readFrom2(qlib::LDom2Node *pNode)
{
  super_t::readFrom2(pNode);

  qlib::LDom2Node *pSSNode = pNode->findChild("subsrc");
  if (pSSNode==NULL)
    return;
  
  // Load the sub-stream information from the node tree

  for (pSSNode->firstChild(); pSSNode->hasMoreChild(); pSSNode->nextChild()) {
    qlib::LDom2Node *pCNode = pSSNode->getCurChild();
    LString key = pCNode->getTagName();
    LString value = pCNode->getStrAttr("src");
    LString value2 = pCNode->getStrAttr("alt_src");
    m_stab.set(key, value);
  }
}

void InOutHandler::startTimerMes()
{
#ifdef USE_BOOST_TIMER
  boost::timer::cpu_timer *p = new boost::timer::cpu_timer();
  p->start();
  m_pTimerObj = p;
#endif
}

void InOutHandler::endTimerMes()
{
#ifdef USE_BOOST_TIMER
  boost::timer::cpu_timer *p = static_cast<boost::timer::cpu_timer *>(m_pTimerObj);
  boost::timer::cpu_times t = p->elapsed();
  delete p;
  m_pTimerObj = NULL;

  qlib::LClass *pCls = getClassObj();
  LString msg = boost::timer::format(t);
  msg = msg.chomp();
  LOG_DPRINTLN( "%s> %s",
                pCls->getClassName().c_str(),
                msg.c_str() );
#endif
}

