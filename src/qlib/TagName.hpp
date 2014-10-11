// -*-Mode: C++;-*-
//
//  light-weight string class for tagnames
//   (length of string is limited to TagStr::MAX_LEN)
//

#ifndef TAG_NAME_H__
#define TAG_NAME_H__

#include "qlib.hpp"

#include "LString.hpp"

#ifdef USE_HASH_MAP
#  include "HashMap.hpp"
#else
#  include <map>
#endif

namespace qlib {

  typedef unsigned int TagID;

  ///////////////////////////////////////////////////////
  // class tagname

  class QLIB_API TagNameTable
  {
  private:
    struct less_char : std::binary_function <const char *,const char *, bool> {
      bool operator() (const char *x, const char *y) const
      {
	return strcmp(x,y)<0;
      }
    };

#ifdef USE_HASH_MAP
    struct cstr_equal : std::equal_to <const char *> {
      bool operator() (const char *x, const char *y) const
      {
        return ::strcmp(x,y)==0;
      }
    };
#endif

#ifdef USE_HASH_MAP
    typedef qlib::hash_map< const char *, TagID, qlib::hash<const char *>, cstr_equal > StrToId;
    typedef qlib::hash_map< TagID, const char * > IdToStr;
#else
    typedef std::map< const char *, TagID, less_char > StrToId;
    typedef std::map< TagID, const char * > IdToStr;
#endif

    IdToStr m_idToStrTab;
    StrToId m_strToIdTab;

    TagID m_nNewID;

  public:

    TagNameTable();
    ~TagNameTable();

    // string --> tagID
    TagID searchTagID(const char *str);

    // tagID --> string
    const char *searchStr(TagID id);

    // create new entry
    const char *createNewTag(const char *newstr, TagID &newid);

  };

  ///////////////////////////////////////////////////////
  // class tagname

  class QLIB_API TagName //: public Serializable
  {
  public:

    // invalid tagname
    enum { TAG_NULL = 0 };

  private:

    // ID number of this tagname
    TagID m_id;

    const char *m_cachedStr;

  public:

    // default constructor
    TagName()
      : m_id(TAG_NULL), m_cachedStr(NULL)
    {
    }

    // copy constructor
    TagName(const TagName &arg)
      : m_id(arg.m_id), m_cachedStr(arg.m_cachedStr)
    {
      //MB_DPRINT("TagName cnstr1 %d(%s)\n", m_id, m_cachedStr);
    }

    //TagName(const char *pstr,int len)
    //{
    //}

    TagName(const char *pstr)
    {
      m_cachedStr = m_ptable->createNewTag(pstr, m_id);
      //MB_DPRINT("TagName cnstr2 %d(%s)\n", m_id, m_cachedStr);
    }

    TagName(char c)
    {
      char sbuf[2];
      sbuf[0] = c; sbuf[1] = '\0';
      m_cachedStr = m_ptable->createNewTag(sbuf, m_id);
      //MB_DPRINT("TagName cnstr3 %d(%s)\n", m_id, m_cachedStr);
    }

    TagName(TagID id)
      : m_id(TAG_NULL), m_cachedStr(NULL)
    {
      const char *pstr = m_ptable->searchStr(id);
      //MB_DPRINT("TagName createById=%d, %s\n", id, pstr);
      if (pstr!=NULL) {
	m_cachedStr = pstr;
	m_id = id;
      }
    }

    // destructor
    virtual ~TagName();

    /////////////////////////////////////////////////
    //
    // member functions

    TagID getID() const { return m_id; }

    int length() const {
      if (m_id==TAG_NULL)
	return 0;
      fillCache();
      MB_ASSERT(m_cachedStr!=NULL);
      return strlen(m_cachedStr);
    }

    bool isEmpty() const {
      return (length()==0);
    }

    const char *c_str() const {
      fillCache();
      MB_ASSERT(m_cachedStr!=NULL);
      return m_cachedStr;
    }

    char getAt(int n) const
    {
      fillCache();
      MB_ASSERT(m_cachedStr!=NULL);
      MB_ASSERT(n>=0);
      MB_ASSERT(n<length());
      return m_cachedStr[n];
    }

    /*
      TagName mid(int nFirst) const;
      TagName mid(int nFirst, int nCount) const;
      TagName right(int nCount) const;
      TagName left(int nCount) const;
    */

    bool equals(const TagName &arg) const
    {
      return m_id==arg.m_id;
    }

    bool equals(const char *arg) const
    {
      TagID id = m_ptable->searchTagID(arg);
      return m_id==id;
    }

    int compare(const TagName &arg) const
    {
      return strcmp(arg.c_str(), c_str());
    }

    int indexOf(char c) const
    {
      fillCache();
      MB_ASSERT(m_cachedStr!=NULL);
      int len = length();
      for (int i=0; i<len; i++)
	if (c==m_cachedStr[i])
	  return i;
      return -1;
    }

    int lastIndexOf(char c) const
    {
      fillCache();
      MB_ASSERT(m_cachedStr!=NULL);
      int len = length();
      for (int i=len-1; i>=0; i--)
	if (c==m_cachedStr[i])
	  return i;
      return -1;
    }

    bool startsWith(const char *arg) const
    {
      fillCache();
      MB_ASSERT(m_cachedStr!=NULL);
      int len = length();
      for (int i=0; i<len && arg[i]!='\0' ; i++)
	if (arg[i]!=m_cachedStr[i])
	  return false;
      return true;
    }

    bool toInt(int *retval) const
    {
      fillCache();
      MB_ASSERT(m_cachedStr!=NULL);
      MB_ASSERT(retval!=NULL);

      char *sptr;
      *retval = strtol(m_cachedStr,&sptr,0);
      if(sptr==m_cachedStr)
	return false;
      return true;
    }

    //////////////////////////////////////////////////////////////////
    // member methods (operator)

    operator const char *() const
    { return c_str(); }

    char operator[](int nIndex) const
    { return getAt(nIndex); }

    // = operator
    const TagName &operator=(const TagName &arg)
    {
      if(&arg!=this){
	m_id = arg.m_id;
	m_cachedStr = arg.m_cachedStr;
      }
      return *this;
    }

    /*
      friend TagName operator+(const TagName &arg1,const TagName &arg2);
      friend TagName operator+(const TagName &arg,const char *pstr);
      friend TagName operator+(const char *pstr,const TagName &arg);
      friend TagName operator+(const TagName &arg,char c);
      friend TagName operator+(char c,const TagName &arg);
    */

    //friend bool operator==(const TagName &arg1,const TagName &arg2);
    //friend bool operator==(const TagName &arg1,const char *arg2);
    //friend bool operator==(const char *arg1,const TagName &arg2);

    //////////////////////////////////////////////////////////////////
    // serialization

    //    virtual void writeObj(ObjOutStream &dos) const;
    //    virtual void readObj(ObjInStream &dis);

  private:
    void fillCache() const
    {
      TagName *pthis = (TagName *)this;
      if (m_id==TAG_NULL)
	pthis->m_cachedStr = m_pnull;
      else if (m_cachedStr==NULL)
	pthis->m_cachedStr = m_ptable->searchStr(m_id);
    }

    /////////////////////////////

  public:
    static bool init();
    static bool fini();

  private:
    static TagNameTable *m_ptable;
    static const char *m_pnull;

  public:
    /** comparison of TagName (this is used in map class of STL) */
    struct less_fcn : std::binary_function <TagName, TagName, bool> {
      bool operator() (const TagName &x, const TagName &y) const
      {
	return x.getID()<y.getID();
      }
    };

    struct hash_fcn
    {
      size_t operator()(const TagName &__s) const { return __s.getID(); }
    };

    struct equal_fcn : std::equal_to <TagName>
    {
      bool operator() (const TagName &x, const TagName &y) const
      {
        return x.getID()==y.getID();
      }
    };

  };


}


#endif // TAG_NAME_H__
