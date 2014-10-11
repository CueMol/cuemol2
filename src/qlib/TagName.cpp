// -*-Mode: C++;-*-

#include <common.h>

#include "TagName.hpp"

using namespace qlib;

TagNameTable *TagName::m_ptable = NULL;
const char *TagName::m_pnull = "";

TagName::~TagName()
{
}

bool TagName::init()
{
  m_pnull = "";
  MB_ASSERT(m_ptable==NULL);
  m_ptable = MB_NEW TagNameTable();
  if (m_ptable!=NULL)
    return true;
  return false;
}

bool TagName::fini()
{
  if (m_ptable!=NULL)
    delete m_ptable;
  m_ptable = NULL;
  return true;
}

TagNameTable::TagNameTable()
  : m_nNewID(TagName::TAG_NULL+1)
{
}

TagNameTable::~TagNameTable()
{
  MB_DPRINTLN("delete TagNameTable");

  IdToStr::iterator i1 = m_idToStrTab.begin();
  for ( ; i1!=m_idToStrTab.end(); i1++) {
    const char *p = i1->second;
    //MB_DPRINT("delete TagName <%s>\n", p);
    delete [] (char *)p;
  }
}

// string --> tagID
TagID TagNameTable::searchTagID(const char *str)
{
  if (str==NULL)
    return TagName::TAG_NULL;

  StrToId::const_iterator iter = m_strToIdTab.find(str);

  if(iter==m_strToIdTab.end())
    return TagName::TAG_NULL;

  TagID id = iter->second;
  //MB_DPRINT("TagName searchTagID <%s>-->%d\n", str, id);
  MB_ASSERT(id<m_nNewID);
  return id;
}

// tagID --> string
const char *TagNameTable::searchStr(TagID id)
{
  if (id==TagName::TAG_NULL || id>=m_nNewID)
    return NULL;

  IdToStr::const_iterator iter = m_idToStrTab.find(id);

  if(iter==m_idToStrTab.end())
    return NULL;

  //MB_DPRINT("TagName searchStr %d--><%s>\n", id, (*iter).second);
  return iter->second;
}

// create new entry
const char *TagNameTable::createNewTag(const char *newstr, TagID &newid)
{
  //MB_DPRINT("TagName createRequest <%s>\n", newstr);
  MB_ASSERT(newstr!=NULL);

  TagID id = searchTagID(newstr);
  if (id!=TagName::TAG_NULL) {
    //MB_DPRINT("TagName already created %s(%d)\n", newstr, id);
    newid = id;
    return searchStr(id);
  }

  id = m_nNewID;
  char *pstr = MB_NEW char[strlen(newstr)+1];
  strcpy(pstr, newstr);
  m_nNewID++;
  if ((int)m_nNewID<0) {
    fprintf(stderr, "TagName space expired.\n");
    abort();
  }

  m_idToStrTab.insert(IdToStr::value_type(id, pstr));
  m_strToIdTab.insert(StrToId::value_type(pstr, id));

  newid = id;
  //MB_DPRINT("TagName New=%s(%d)\n", pstr, id);
  return pstr;
}

/*
void TagName::writeObj(ObjOutStream &dos) const
{
  dos.writeData("t", LString(c_str()));
}

void TagName::readObj(ObjInStream &dis)
{
  LString tmp;
  dis.readData("t", tmp);

  m_cachedStr = m_ptable->createNewTag(tmp, m_id);
}
*/
