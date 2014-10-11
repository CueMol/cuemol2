// -*-Mode: C++;-*-
//
// system configuration database
//
// $Id: SysConfig.cpp,v 1.2 2009/01/03 14:44:10 rishitani Exp $

#include <common.h>

#include "SysConfig.hpp"

#include <qlib/ExpatInStream.hpp>
#include <qlib/PrintStream.hpp>

SINGLETON_BASE_IMPL(qsys::SysConfig);

using namespace qsys;

SysConfig::SysConfig()
{
  m_root.setPersistent(true);
  m_root.setConst(true);
}

SysConfig::~SysConfig()
{
}

SysConfig::Section *SysConfig::getSection(const LString &key, bool bCreate /*= false*/)
{
  std::list<LString> path;
  key.split(delimitor, path);
  if (path.size()==0) return NULL;

  Section *pNode = getRoot();
  std::list<LString>::const_iterator iter = path.begin();
  for (; iter!=path.end(); ++iter) {
    const LString &nm = *iter;
    if (nm.isEmpty())
      break;
    iterator pos = pNode->findName(pNode->begin(), nm);
    if (pos==pNode->end()) {
      if (!bCreate)
        break;
      // create new node
      Section *pNew = MB_NEW Section(nm);
      pNode->push_back(pNew);
      pNode = pNew;
      continue;
    }    
    pNode = *pos;
  }

  // node with matching name was not found
  if (iter!=path.end())
    return NULL;

  return pNode;
}

LString SysConfig::get(const LString &key) const
{
  SysConfig *pthis = const_cast<SysConfig *>(this);
  Section *pNode = pthis->getSection(key);
  if (pNode==NULL)
    return LString();

  // pNode points to the target node
  const qlib::LVariant &lvar = pNode->getRawData();
  if (!lvar.isString())
    return LString(); // type mismatch

  return LString(lvar.getStringValue());
}

void SysConfig::put(const LString &key, const LString &value)
{
  Section *pNode = getSection(key, true);
  if (pNode==NULL)
    return;  // ignore errors

  qlib::LVariant lvar(value);
  pNode->setRawData(lvar);
  // ignore errors
}

#if 0
LString SysConfig::getHostConf(const LString &key) const
{
  QsysModule *pqsys = QsysModule::getInstance();
  LString hnam = pqsys->getHostName();
  LString vkey = LString::format("%s:%s", hnam.c_str(), key.c_str());
  LString res = get(vkey);
  if (!res.isEmpty()) {
    return res;
  }

  // retry global entry
  return get(key);
}

void SysConfig::putHostConf(const LString &key, const LString &value)
{
  QsysModule *pqsys = QsysModule::getInstance();
  LString hnam = pqsys->getHostName();
  LString vkey = LString::format("%s:%s", hnam.c_str(), key.c_str());
  put(vkey, value);
}

#endif

namespace {

  /**
     parser for the system config in xml format
  */
  class SysConfigTabReader : public qlib::ExpatInStream
  {
  private:
    SysConfig *m_pDB;
    
    std::list<SysConfig::Section *> m_stack;

  public:
    SysConfigTabReader(InStream &r) : ExpatInStream(r), m_pDB(NULL) {
    }
    
    virtual ~SysConfigTabReader() {
    }
    
    void setDB(SysConfig *pDB) {
      m_pDB = pDB;
      // initialize stack with root node
      m_stack.push_back(pDB->getRoot());
    }
    
    ///////////////////////////////////////////////////////////////////
    
    void startEntry(const Attributes &attr) {
      int i;
      LString strName, strValue, strType, strConst;

      Attributes::const_iterator iter = attr.begin();
      for (; iter!=attr.end(); ++iter) {
        const LString &prop = iter->first;
        const LString &val = iter->second;
        if (prop.equals("name"))
	  strName = val;
        else if (prop.equals("value"))
	  strValue = val;
        else if (prop.equals("const"))
          strConst = val;
        else if (prop.equals("type"))
          strType = val;
      }

      // Entry must has key attribute
      if (strName.isEmpty()) {
        setError("Entry without name attribute was found.");
        return;
      }

      // append the entry as new section
      SysConfig::Section *pSec = MB_NEW SysConfig::Section(strName);
      m_stack.back()->push_back(pSec);
      m_stack.push_back(pSec);

      // setup section
      if (!strConst.isEmpty()) {
        if (strConst.equals("true"))
          pSec->setConst(true);
        else if (!strConst.equals("false")) {
          LOG_DPRINTLN("SysConfig> Error: const attribute (%s) "
		       "must be \"true\" or \"false\".",
                       strConst.c_str());
	  setError("Error.");
	  return;
	}
      }        
        
      qlib::LVariant lvar;
      if (strType.isEmpty() || strType.equals("string")) {
	lvar.setStringValue(strValue);
      }
      else if (strType.equals("int")) {
        int n;
        if (strValue.toInt(&n))
	  lvar.setIntValue(n);
        else {
          LOG_DPRINTLN("SysConfig> Error: cannot convert value %s to integer.",
		       strValue.c_str());
	  setError("Error.");
	  return;
	}
      }
      else if (strType.equals("real")) {
        double n;
        if (strValue.toDouble(&n))
          lvar.setRealValue(n);
        else {
          LOG_DPRINTLN("SysConfig> Error: cannot convert value %s to real number.",
		       strValue.c_str());
	  setError("Error.");
	  return;
	}
      }
      else {
	LOG_DPRINTLN("SysConfig> Error: unknown type %s.", strType.c_str());
	setError("Error.");
	return;
      }

      pSec->setRawData(lvar);
    }

    ////////////////////

    void endEntry() {
      MB_ASSERT(m_stack.size()>0);
      m_stack.pop_back();
    }

    //////////////////////////////////////////////////////////////////////////////

    virtual void startElement(const LString &name, const Attributes &attrs) {
      if (name.equals("entry"))
        startEntry(attrs);
    }

    virtual void endElement(const LString &name) {
      if (name.equals("entry"))
        endEntry();
    }

  };

} // namespace

void SysConfig::read(qlib::InStream &ins)
{
  SysConfigTabReader reader(ins);
  reader.setDB(this);
  reader.parse();
  return;
}

void SysConfig::write(qlib::OutStream &outs)
{
  qlib::PrintStream ps(outs);
  ps.println("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
  ps.println("<cueconfig>");

  m_pOut = &ps;
  const_iterator iter = m_root.begin();
  //m_keyname.push_back(m_root.getName());
  for (; iter!=m_root.end(); ++iter) {
    writeSection(*iter);
  }
  //m_keyname.pop_back();
  m_pOut = NULL;

  ps.println("</cueconfig>");

  MB_ASSERT(m_keyname.size()==0);
}

void SysConfig::writeSection(Section *pSec)
{
  if (!pSec->isPersistent())
    return;
  
  qlib::PrintStream &ps = *m_pOut;
  bool bOK = false;

  ps.repeat("    ", m_keyname.size()+1);

  ps.print("<entry name=\"");
  ps.print(pSec->getName());
  ps.print("\"");

  if (pSec->isConst())
    ps.print(" const=\"true\"");

  if (pSec->hasData()) {
    const qlib::LVariant &lvar = pSec->getRawData();
    // try string property (in UTF8)
    if (lvar.isString()) {
      const LString &data = lvar.getStringValue();
      ps.print(" value=\"");
      ps.print(data);
      ps.print("\"");
      ps.print(" type=\"string\"");
    }
    else if (lvar.isInt()) {
      ps.format(" value=\"%d\"", lvar.getIntValue());
      ps.print(" type=\"int\"");
    }
    else if (lvar.isReal()) {
      ps.format(" value=\"%f\"", lvar.getRealValue());
      ps.print(" type=\"real\"");
    }
    else {
      LString cat = LString::join(":", m_keyname);
      LOG_DPRINTLN("SysConfig> warning: cannot serialize section"
		   " \"%s\" name \"%s\" (unknown type)",
                   cat.c_str(), pSec->getName().c_str());
    }
  }
  
  if (pSec->size()==0) {
    ps.println("/>");
    return;
  }

  ps.println(">");

  const_iterator iter = pSec->begin();
  m_keyname.push_back(pSec->getName());
  for (; iter!=pSec->end(); ++iter) {
    writeSection(*iter);
  }
  m_keyname.pop_back();

  // close tag
  ps.repeat("    ", m_keyname.size()+1);
  ps.println("</entry>");
}

static
LString replaceDirective(const LString &path,
                         const LString &drct,
                         const LString &data)
{
  if (!path.startsWith(drct))
    return path;
  
  int ndrlen = drct.length();
  LString rem = path.substr(ndrlen);

  if (rem.isEmpty()) {
    return data;
  }

  return data + rem;
}

LString SysConfig::convPathName(const LString &path) const
{
  LString ret = path;


#if 0 //def _WIN32
  ret.replace('/', MB_PATH_SEPARATOR);

  // %%EXEDIR%% is only valid in Win32
  if (ret.startsWith("%%EXEDIR%%")) {
    // Get path name of this exe file
    char stmp[1024];
    ::GetModuleFileName(NULL, stmp, sizeof stmp);
    LString sbuf(stmp);
    // extract directory name
    int spos = sbuf.lastIndexOf(MB_PATH_SEPARATOR);
    if (spos>=0)
      sbuf = sbuf.substr(0, spos);
    MB_DPRINTLN("exedir = %s", sbuf.c_str());
    
    return replaceDirective(ret, "%%EXEDIR%%", sbuf);
  }
#endif // _WIN32

  if (ret.startsWith("%%CONFDIR%%")) {
    LString confdir = get("config_dir");
    if (confdir.isEmpty()) {
      LOG_DPRINTLN("SysConfig> Fatal error: cannot convert %%%%CONFDIR%%%% directive to config file directory.");
      return ret;
    }
    
    MB_DPRINTLN("confdir = %s", confdir.c_str());
    
    return replaceDirective(ret, "%%CONFDIR%%", confdir);
  }
  else if (ret.startsWith("%%QSDIR%%")) {
    LString confdir = convPathName(get("qscript_dir"));
    if (confdir.isEmpty()) {
      LOG_DPRINTLN("SysConfig> Fatal error: cannot convert %%%%QSDIR%%%% directive to config file directory.");
      return ret;
    }
    
    MB_DPRINTLN("qsdir = %s", confdir.c_str());
    
    return replaceDirective(ret, "%%QSDIR%%", confdir);
  }

  return ret;
}

