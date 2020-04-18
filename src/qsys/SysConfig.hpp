// -*-Mode: C++;-*-
//
// System configuration database
//
// $Id: SysConfig.hpp,v 1.3 2010/09/05 09:05:16 rishitani Exp $

#ifndef QSYS_SYS_CONFIG_HPP_
#define QSYS_SYS_CONFIG_HPP_

#include "qsys.hpp"

#include <qlib/MapTable.hpp>
#include <qlib/LVariant.hpp>
#include <qlib/SingletonBase.hpp>

namespace qlib {
  class PrintStream;
  class InStream;
  class OutStream;
}

namespace qsys {

  using qlib::LString;

  /**
     System configuration database
  */
  class QSYS_API SysConfig : public qlib::SingletonBase<SysConfig>
  {
  public:
    class Section;
    
    static const char delimitor = ':';
    
  private:
    typedef std::list<Section *> list_t;
    
  public:
    typedef list_t::iterator iterator;
    typedef list_t::const_iterator const_iterator;
    
    class Section
    {
    private:
      /** property of this node */
      qlib::LVariant m_data;
      
      /** name of this node */
      LString m_name;
      
      /** persistent property */
      bool m_bPers;
      
      /** read-only property */
      bool m_bConst;
      
      /** children nodes */
      list_t m_children;
      
      class dummy_type {};
      
    public:
      Section() : m_bPers(true), m_bConst(false) {}
      
      Section(const LString &name)
	: m_name(name), m_bPers(true), m_bConst(false) {}

      ~Section() {
	clear();
      }

      ////////////////////////////////////////////////
      
      bool isPersistent() const {
	return m_bPers;
      }
      
      void setPersistent(bool b) {
	m_bPers = b;
      }
      
      bool isConst() const {
	return m_bConst;
      }
      
      void setConst(bool b) {
	m_bConst = b;
      }
      
      LString getName() const {
	return m_name;
      }
      
      void setName(const LString &name) {
	m_name = name;
      }
      
      bool hasData() const {
	return !m_data.isNull();
      }
      
      const qlib::LVariant &getRawData() const {
	return m_data;
      }
      
      void setRawData(const qlib::LVariant &lvar) {
	m_data = lvar;
      }

      ////

      qlib::LString getStringData() const {
	if (!m_data.isString())
	  return qlib::LString();
	return m_data.getStringValue();
      }

      ////////////////////////////////////////////////
      
      const_iterator begin() const {
	return m_children.begin();
      }
      
      const_iterator end() const {
	return m_children.end();
      }
      
      iterator begin() {
	return m_children.begin();
      }
      
      iterator end() {
	return m_children.end();
      }
      
      iterator find(Section *pnode) {
	return std::find(m_children.begin(), m_children.end(), pnode);
      }
      
      const_iterator findName(const_iterator start, const LString &name) const {
	const_iterator pos = start;
	for (; pos!=m_children.end(); ++pos) {
	  if (name.equals((*pos)->getName()))
	    break;
	}
	return pos;
      }
      
      iterator findName(iterator start, const LString &name) {
	iterator pos = start;
	for (; pos!=m_children.end(); ++pos) {
	  if (name.equals((*pos)->getName()))
	    break;
	}
	return pos;
      }
      
      void erase(iterator pos) {
	Section *p = *pos;
	m_children.erase(pos);
	delete p;
      }
      
      int size() const {
	return m_children.size();
      }
      
      void clear() {
	while (m_children.size()>0) {
	  delete m_children.front();
	  m_children.pop_front();
	}
      }
      
      void push_back(Section *pnode) {
	m_children.push_back(pnode);
      }
      
    }; // class Section
    
  private:
    /** root section */
    Section m_root;
    
  public:
    
    ////////////////////////////////////////////
    //
    
    SysConfig();
    virtual ~SysConfig();
    
    /**
       Get the section "key".
       If bCreate==true and the section doesn't exist, create and return it.
    */
    Section *getSection(const LString &key, bool bCreate = false);
    
    Section *getRoot() {
      return &m_root;
    }
    
    /**
       Convert system independent path name to local path name,
       with performing some replacement of directives (e.g. %%EXEDIR%%).
    */
    LString convPathName(const LString &path) const;
    
    ////////////////////////////////////////////
    // old interfaces
    
    LString get(const LString &key) const;
    
    void put(const LString &key, const LString &value);
    
  public:
    // LString getHostConf(const LString &key) const;
    // void putHostConf(const LString &key, const LString &value);
    
    ////////////////////////////////////////////
    // serialization
    
    void read(qlib::InStream &ins);
    void write(qlib::OutStream &outs);
    
  private:
    qlib::PrintStream *m_pOut;
    std::list<LString> m_keyname;
    
    void writeSection(Section *pSec);
    
  public:
    //////////
    // Initializer/finalizer

    static bool init()
    {
      return qlib::SingletonBase<SysConfig>::init();
    }
    
    static void fini()
    {
      qlib::SingletonBase<SysConfig>::fini();
    }
  };

}

SINGLETON_BASE_DECL(qsys::SysConfig);

#endif
