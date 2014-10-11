// -*-Mode: C++;-*-
//
// In/Out handler abstract class
//
// $Id: InOutHandler.cpp,v 1.4 2011/01/03 16:47:05 rishitani Exp $

#include <common.h>

#include "InOutHandler.hpp"
#include <qlib/FileStream.hpp>
#include <qlib/LDOM2Tree.hpp>

using namespace qsys;

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

