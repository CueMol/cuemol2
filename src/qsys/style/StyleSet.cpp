// -*-Mode: C++;-*-
//
// StyleSet implementation
//
// $Id: StyleSet.cpp,v 1.2 2011/04/16 17:30:39 rishitani Exp $

#include <common.h>

#include "StyleSet.hpp"
#include "StyleFile.hpp"

#include <gfx/SolidColor.hpp>
#include <gfx/NamedColor.hpp>

#include <qlib/FileStream.hpp>
#include <qlib/LDOM2Stream.hpp>
#include <qlib/ObjectManager.hpp>

using namespace qsys;
using qlib::LDom2Node;
using gfx::SolidColor;
using gfx::SolidColorPtr;
using gfx::AbstractColor;
using gfx::NamedColor;

#define DELIM STYLEMGR_DB_DELIM

StyleSet::StyleSet()
     : m_bReadOnly(false), m_bModified(false), m_bOverrideID(false)
{
  m_nUID = qlib::ObjectManager::sRegObj(this);
  MB_DPRINTLN("StyleSet (%d) created.", m_nUID);
}

StyleSet::~StyleSet()
{
  m_matdata.clearAndDelete();

  BOOST_FOREACH (data_t::value_type &v, m_data) {
    delete v.second;
  }

  qlib::ObjectManager::sUnregObj(m_nUID);

  MB_DPRINTLN("StyleSet (%d/%p) destructed", m_nUID, this);
}

//////////

//static
bool StyleSet::decodeStrDataKey(const LString &inkey, LString &dbname, LString &tagname, LString &id)
{
  int c0 = inkey.indexOf(STYLEMGR_DB_DELIM);
  if (c0<0)
    return false;
  dbname = inkey.substr(0, c0);
  LString s0 = inkey.substr(c0+1);

  int c1 = s0.indexOf(STYLEMGR_DB_DELIM);
  if (c1<0)
    return false;
  tagname = s0.substr(0, c1);
  id = s0.substr(c1+1);
  
  //int c2 = id.indexOf(STYLEMGR_DB_DELIM);
  //if (c2>=0)
  //return false;
  return true;
}

//////////

bool StyleSet::getColor(const LString &rkey, ColorPtr &rcol) const
{
  LString key = rkey.toLowerCase();
  palette_t::const_iterator iter = m_palette.find(key);
  if (iter==m_palette.end()) 
    return false;
  rcol = iter->second;
  return true;
}

bool StyleSet::setColor(const LString &rkey, const ColorPtr &pCol)
{
  LString key = rkey.toLowerCase();
  palette_t::iterator iter = m_palette.find(key);
  if (iter!=m_palette.end()) {
    iter->second = pCol;
    m_bModified = true;
    return false;
  }
  
  bool res = m_palette.insert(palette_t::value_type(key, pCol)).second;
  MB_ASSERT(res);
  m_bModified = true;
  return true;
}

bool StyleSet::hasColor(const LString &rkey) const
{
  LString key = rkey.toLowerCase();
  palette_t::const_iterator iter = m_palette.find(key);
  if (iter==m_palette.end()) 
    return false;
  return true;
}

bool StyleSet::removeColor(const LString &rkey)
{
  LString key = rkey.toLowerCase();
  palette_t::iterator iter = m_palette.find(key);
  if (iter==m_palette.end()) 
    return false;

  m_bModified = true;
  m_palette.erase(iter);
  return true;
}

/////////////////////////

bool StyleSet::getString(const LString &key, LString &rval) const
{
  strdata_t::const_iterator iter = m_strdata.find(key);
  if (iter==m_strdata.end())
    return false;
  rval =  iter->second;
  return true;
}

bool StyleSet::setString(const LString &key, const LString &value)
{
  strdata_t::iterator iter = m_strdata.find(key);
  if (iter!=m_strdata.end()) {
    // overwrite value of existing string data
    iter->second = value;
    m_bModified = true;
    return false;
  }

  // append new string data
  bool res = m_strdata.insert(strdata_t::value_type(key, value)).second;
  MB_ASSERT(res);
  m_bModified = true;
  return true;
}

bool StyleSet::hasString(const LString &key) const
{
  strdata_t::const_iterator iter = m_strdata.find(key);
  if (iter==m_strdata.end())
    return false;
  return true;
}

bool StyleSet::removeString(const LString &key)
{
  strdata_t::iterator iter = m_strdata.find(key);
  if (iter==m_strdata.end()) 
    return false;

  m_bModified = true;
  m_strdata.erase(iter);
  return true;
}

/////////////////////////

LDom2Node *StyleSet::getData(const LString &key) const
{
  data_t::const_iterator iter = m_data.find(key);
  if (iter==m_data.end())
    return NULL;
  return iter->second;
}

bool StyleSet::putData(const LString &key, LDom2Node *pNode)
{
  bool res = m_data.insert(data_t::value_type(key, pNode)).second;
  if (res)
    m_bModified = true;
  return res;
}

bool StyleSet::removeData(const LString &key)
{
  data_t::iterator iter = m_data.find(key);
  if (iter==m_data.end())
    return false;

  LDom2Node *pNode = iter->second;
  if (pNode!=NULL)
    delete pNode;

  m_data.erase(iter);
  return true;
}

//////////

bool StyleSet::putMaterial(const LString &id, const LString &type, const LString &value)
{
  Material *pMat = m_matdata.get(id);
  if (pMat==NULL) {
    pMat = MB_NEW Material();
    m_matdata.set(id, pMat);
  }

  pMat->setDepValue(type, value);
  m_bModified = true;
  return true;
}

bool StyleSet::putMaterial(const LString &id, int type, double value)
{
  Material *pMat = m_matdata.get(id);
  if (pMat==NULL) {
    pMat = MB_NEW Material();
    m_matdata.set(id, pMat);
  }

  pMat->setSysValue(type, value);
  m_bModified = true;
  return true;
}

Material *StyleSet::getMaterial(const LString &id) const
{
  return m_matdata.get(id);
}

LString StyleSet::getMaterialNamesJSON(bool bParen/*=true*/) const
{
  LString rval = "";
  if (bParen)
    rval += "[";

  bool bfirst = true;
  matdata_iterator iter = matBegin();
  matdata_iterator eiter = matEnd();
  for (; iter!=eiter; ++iter) {
    const LString &fkey = iter->first;
    
    if (!bfirst)
      rval += ",";
    else
      bfirst = false;
    
    rval += "\""+fkey.escapeQuots()+"\"";
  }

  if (bParen)
    rval += "]";
  return rval;
}

//////////////////////////////////////////////////
// serialization / deserialization

void StyleSet::writeToDataNode(qlib::LDom2Node *pNode) const
{
  // style set name (id)
  LString id = getName();

  // output ID attribute
  pNode->appendStrAttr("id", id);

  // Serialize internal style definitions

  // write material nodes
  writeMatToDataNode(pNode);

  // write color nodes
  writeColToDataNode(pNode);

  // write string (sel, setting, etc) data nodes
  writeStrToDataNode(pNode);

  // write style nodes
  writeStyleToDataNode(pNode);
}
    
/// color table serialization
void StyleSet::writeColToDataNode(qlib::LDom2Node *pNode) const
{
  coldata_iterator iter = m_palette.begin();
  coldata_iterator eiter = m_palette.end();
  for (; iter!=eiter; ++iter) {
    const LString &colname = iter->first;
    const ColorPtr &pcol = iter->second;
    LString strval = pcol->toString();
    
    qlib::LDom2Node *pCCNode = pNode->appendChild();
    pCCNode->setTagName("color");
    pCCNode->appendStrAttr("id", colname);
    pCCNode->setValue(strval);
  }
}

/// string table serialization
void StyleSet::writeStrToDataNode(qlib::LDom2Node *pNode) const
{
  strdata_iterator iter = strBegin();
  strdata_iterator eiter = strEnd();
  for (; iter!=eiter; ++iter) {
    const LString &ckey = iter->first;
    const LString &value = iter->second;
    
    LString dbname, tagname, id;
    if (!decodeStrDataKey(ckey, dbname, tagname, id)) {
      LOG_DPRINTLN("StyleSet> invalid strdata key: %s", ckey.c_str());
      continue; // ERROR !! (ignore)
    }

    if (!dbname.equals("string"))
      continue; // ignore non-string database

    qlib::LDom2Node *pCCNode = pNode->appendChild();
    pCCNode->setTagName(tagname);
    pCCNode->appendStrAttr("id", id);
    pCCNode->setValue(value);
  }
}

/// style (structured data) table serialization
void StyleSet::writeStyleToDataNode(qlib::LDom2Node *pNode) const
{
  data_iterator iter = dataBegin();
  data_iterator eiter = dataEnd();
  for (; iter!=eiter; ++iter) {
    LString style_id = iter->first.c_str();
    style_id = style_id.substr(0, style_id.length()-6);
    //MB_DPRINTLN("write style node: %s.%s", id.c_str(), style_id.c_str());
    LDom2Node *pCCNode = MB_NEW LDom2Node(*iter->second);
    pCCNode->appendStrAttr("id", style_id);
    pNode->appendChild(pCCNode);
  }
}

/// material table serialization
void StyleSet::writeMatToDataNode(qlib::LDom2Node *pNode) const
{
  // TO DO: implementation
}

/// serialization (to JSON string, key only)
LString StyleSet::getStrDataKeysJSON(const LString &dbname, const LString &cat) const
{
  LString prefix = dbname + DELIM + cat + DELIM;
  int nPsLen = prefix.length();

  LString rval;
  bool bfirst = true;

  strdata_iterator iter = strBegin();
  strdata_iterator eiter = strEnd();

  for (; iter!=eiter; ++iter) {
    const LString &fkey = iter->first;
    if (!fkey.startsWith(prefix)) continue;
    LString key = fkey.substr(nPsLen);
    
    if (!bfirst)
      rval += ",";
    else
      bfirst = false;
    
    rval += "\""+key.escapeQuots()+"\"";
  }

  return rval;
}

LString StyleSet::getStyleKeysJSON() const
{
  LString postfix = LString(DELIM) + "style";
  int nPsLen = postfix.length();

  LString rval;
  bool bfirst = true;

  data_iterator iter = dataBegin();
  data_iterator eiter = dataEnd();

  for (; iter!=eiter; ++iter) {
    const LString &fkey = iter->first;
    if (!fkey.endsWith(postfix)) continue;
    LString key = fkey.substr(0, fkey.length()-nPsLen);
    
    LDom2Node *pNode = iter->second;
    LString desc = pNode->getStrAttr("desc");
    LString type = pNode->getStrAttr("type");
    
    if (!bfirst)
      rval += ",";
    else
      bfirst = false;
    
    rval += "{\"name\":";
    rval += "\""+key.escapeQuots()+"\",";
    rval += "\"desc\":";
    rval += "\""+desc.escapeQuots()+"\",";
    rval += "\"type\":";
    rval += "\""+type.escapeQuots()+"\"}";
  }

  return rval;
}

LString StyleSet::getStyleNamesJSON() const
{
  return "[" + getStyleKeysJSON() + "]";
}

// TO DO: deserialization code should be moved to here.

//////////////////////////////////////////////////

StyleList::~StyleList()
{
  /*
  // TO DO: style set possibly belongs to multiple lists of scenes,
  // therefore should be managed by reference counting.
  BOOST_FOREACH (value_type v, *this) {
    delete v;
  }
   */
}

StyleSetPtr StyleList::findSet(const LString &id) const
{
  const_iterator iter = begin();
  const_iterator eiter = end();
  for (; iter!=eiter; ++iter) {
    StyleSetPtr pSet = *iter;
    if (id.equals(pSet->getName()))
      return pSet;
  }

  return StyleSetPtr();
}

