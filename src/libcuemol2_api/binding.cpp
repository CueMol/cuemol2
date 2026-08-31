
#include <common.h>

#include "binding.hpp"

#include <iostream>
#include "boost/filesystem/path.hpp"
#include "boost/filesystem/operations.hpp"

#include <qlib/qlib.hpp>
#include <qlib/FileStream.hpp>
#include <qlib/ClassRegistry.hpp>

#include <gfx/TextRenderManager.hpp>

#include <qsys/qsys.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/SysConfig.hpp>

namespace cuemol2 {

  using qlib::LString;

  bool hasClass(const qlib::LString &clsname,
                bool *retval,
                qlib::LString &errmsg) noexcept
  {
    *retval = false;

    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
    if (pMgr==NULL) {
      errmsg = "ERROR: CueMol not initialized.";
      return false;
    }

    try {
      *retval =  pMgr->isRegistered(clsname);
      return true;
    }
    catch (const qlib::LException &e) {
      LOG_DPRINTLN("HasClass> Caught exception <%s>", typeid(e).name());
      LOG_DPRINTLN("HasClass> Reason: %s", e.getMsg().c_str());
      errmsg = LString::format("Caught exception <%s> Reason: %s",
                               typeid(e).name(),
                               e.getMsg().c_str());
      return false;
    }
    catch (...) {
      LOG_DPRINTLN("HasClass> Caught unknown exception for class name %s", clsname.c_str());
      errmsg = LString::format("Caught unknown exception for class name %s", clsname.c_str());
      return false;
    }

    return false;
  }

  LIBCUEMOL_API bool getAllClassNamesJSON(qlib::LString &retval,
                                          qlib::LString &errmsg) noexcept
  {
    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
    MB_ASSERT(pMgr != NULL);

    std::list<qlib::LString> ls;
    pMgr->getAllClassNames(ls);

    LString rstr = "[";
    bool ffirst = true;
    BOOST_FOREACH (const LString &str, ls) {
        MB_DPRINTLN("GACNJSON> class %s", str.c_str());
        if (!ffirst) rstr += ",";
        rstr += "\"" + str + "\"";
        ffirst = false;
    }
    rstr += "]";

    retval = rstr;
    return true;
  }

  bool getService(const qlib::LString &svcname,
                  // qlib::LDynamic **prval,
                  qlib::LScriptable **prval,
                  qlib::LString &errmsg) noexcept
  {
    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
    if (pMgr==NULL) {
      errmsg = "ERROR: CueMol not initialized.";
      return false;
    }
    
    try {
      auto pobj = pMgr->getSingletonObj(svcname);
      *prval = dynamic_cast<qlib::LScriptable *>(pobj);
      if (*prval==nullptr) {
        errmsg = "Fatal error dyncast to scriptable failed!!";
        return false;
      }
      return true;
    }
    catch (const qlib::LException &e) {
      errmsg = LString::format("Exception occured in getService for %s: %s",
                               svcname.c_str(),
                               e.getFmtMsg().c_str());
      LOG_DPRINTLN("GetService> Caught exception <%s>", typeid(e).name());
      LOG_DPRINTLN("GetService> Reason: %s", e.getMsg().c_str());
      return false;
    }
    catch (...) {
      errmsg = 
        LString::format("Unknown Exception occured in getProp for %s",
                        svcname.c_str());
      LOG_DPRINTLN("Caught unknown exception");
      return false;
    }
    
    return false;
  }

  bool createObj(const qlib::LString &clsname,
                 const qlib::LString &strval,
                 qlib::LScriptable **prval,
                 qlib::LString &errmsg) noexcept
  {
    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
    if (pMgr==NULL) {
      errmsg = "ERROR: CueMol not initialized.";
      return false;
    }

    try {
      qlib::LClass *pcls = pMgr->getClassObj(clsname);
      if (pcls==NULL)
        MB_THROW(qlib::NullPointerException, "null");
      qlib::LDynamic *pobj;
      if (strval.isEmpty())
        pobj = pcls->createScrObj();
      else
        pobj = pcls->createScrObjFromStr(strval);
      *prval = dynamic_cast<qlib::LScriptable *>(pobj);
      if (*prval==nullptr) {
        errmsg = "Fatal error dyncast to scriptable failed!!";
        return false;
      }
      return true;
    }
    catch (const qlib::LException &e) {
      errmsg = LString::format("Exception occured in createObj for %s: %s",
                               clsname.c_str(),
                               e.getFmtMsg().c_str());
      LOG_DPRINTLN("CreateObj> Caught exception <%s>", typeid(e).name());
      LOG_DPRINTLN("CreateObj> Reason: %s", e.getMsg().c_str());
      return false;
    }
    catch (...) {
      errmsg = 
        LString::format("Unknown Exception occured in createObj for %s",
                        clsname.c_str());
      LOG_DPRINTLN("CreateObj> Caught unknown exception");
      return false;
    }
    
    errmsg = "Unexpected condition in createObj()";
    return false;
  }

  bool getProp(qlib::LScriptable *pthis,
               const qlib::LString &propname,
               qlib::LVariant &lvar,
               qlib::LString &errmsg) noexcept
  {
    errmsg = "";

    try {
      return pthis->getNestedProperty(propname, lvar);
    }
    catch (qlib::LException &e) {
      errmsg = 
        LString::format("Exception occured in getProp for %s: %s",
                        propname.c_str(),
                        e.getFmtMsg().c_str());
      return false;
    }
    catch (...) {
      errmsg = 
        LString::format("Unknown Exception occured in getProp for %s",
                        propname.c_str());
      return false;
    }

    errmsg = "Unexpected condition in getProp()";
    return false;
  }
  
  bool hasProp(qlib::LScriptable *pthis,
               const qlib::LString &propname,
               bool &retval,
               qlib::LString &errmsg) noexcept
  {
    errmsg = "";

    try {
      retval = pthis->hasNestedProperty(propname);
      return true;
    }
    catch (qlib::LException &e) {
      errmsg = 
        LString::format("Exception occured in hasProp for %s: %s",
                        propname.c_str(),
                        e.getFmtMsg().c_str());
      return false;
    }
    catch (...) {
      errmsg = 
        LString::format("Unknown Exception occured in hasProp for %s",
                        propname.c_str());
      return false;
    }

    errmsg = "Unexpected condition in hasProp()";
    return false;
  }

  bool setProp(qlib::LScriptable *pthis,
               const qlib::LString &propname,
               const qlib::LVariant &lvar,
               qlib::LString &errmsg) noexcept
  {
    errmsg = "";
    
    try {
      return pthis->setNestedProperty(propname, lvar);
    }
    catch (qlib::LException &e) {
      errmsg = 
        LString::format("Exception occured in setProp for %s: %s",
                        propname.c_str(), e.getFmtMsg().c_str());
      return false;
    }
    catch (...) {
      errmsg = 
        LString::format("Unknown Exception occured in setProp for %s",
                        propname.c_str());
      return false;
    }

    errmsg = "Unexpected condition in setProp()";
    return false;
  }

  bool invokeMethod(qlib::LScriptable *pthis,
                    const qlib::LString &mthnm,
                    qlib::LVarArgs &args,
                    qlib::LString &errmsg) noexcept
  {
    errmsg = "";

    try {
      return pthis->invokeMethod(mthnm, args);
    }
    catch (qlib::LException &e) {
      errmsg = 
        LString::format("Exception occured in native method \"%s\"\nReason: %s",
                        mthnm.c_str(), e.getMsg().c_str());
      return false;
    }
    catch (...) {
      errmsg = 
        LString::format("Unknown Exception occured in native method \"%s\"",
                        mthnm.c_str());
      return false;
    }

    errmsg = "Unexpected condition in invokeMethod()";
    return false;
  }

  bool toString(qlib::LScriptable *pthis,
                qlib::LString &retval,
                qlib::LString &errmsg) noexcept
  {
    try {
      retval = pthis->toString();
      return true;
    }
    catch (qlib::LException &e) {
      errmsg = 
        LString::format("Exception occured in toString(): %s",
                        e.getFmtMsg().c_str());
      return false;
    }
    catch (...) {
      errmsg = "Unknown Exception occured in toString()";
      return false;
    }
    
    errmsg = "Unexpected condition in toString()";
    return false;
  }

  bool resetProp(qlib::LScriptable *pthis,
                 const qlib::LString &propname,
                 qlib::LString &errmsg) noexcept
  {
    try {
      pthis->resetNestedProperty(propname);
      return true;
    }
    catch (qlib::LException &e) {
      errmsg = 
        LString::format("Exception occured in resetProp for %s: %s",
                        propname.c_str(), e.getFmtMsg().c_str());
      return false;
    }
    catch (...) {
      errmsg = 
        LString::format("Unknown Exception occured in resetProp for %s",
                        propname.c_str());
      return false;
    }
    
    errmsg = "Unexpected condition in resetProp()";
    return false;
  }
  
  bool getPropsJSON(qlib::LScriptable *pthis,
                    qlib::LString &retval,
                    qlib::LString &errmsg) noexcept
  {
    try {
      retval = qlib::getPropsJSONImpl(pthis);
      return true;
    }
    catch (qlib::LException &e) {
      errmsg = 
        LString::format("Exception occured in getPropsJSON: %s",
                        e.getFmtMsg().c_str());
      return false;
    }
    catch (...) {
      errmsg = 
        LString::format("Unknown Exception occured in getPropsJSON");
      return false;
    }

    errmsg = "Unexpected condition in getPropsJSON()";
    return false;
  }
  
  bool getPropDefaultStatus(qlib::LScriptable *pthis,
                            const qlib::LString &propname,
                            int &retval,
                            qlib::LString &errmsg) noexcept
  {
    try {
      if (! pthis->hasNestedPropDefault(propname) )
        retval = 0; // no default value
      else if (! pthis->isPropDefault(propname) )
        retval = 1; // has default but not default now
      else
        retval = 2; // has default and now is default
      return true;
    }
    catch (qlib::LException &e) {
      errmsg = 
        LString::format("Exception occured in isPropDef for %s: %s",
                        propname.c_str(), e.getFmtMsg().c_str());
      return false;
    }
    catch (...) {
      errmsg = 
        LString::format("Unknown Exception occured in isPropDef for %s",
                        propname.c_str());
      return false;
    }

    errmsg = "Unexpected condition in getPropDefaultStatus()";
    return false;
  }

} // namespace cuemol2
