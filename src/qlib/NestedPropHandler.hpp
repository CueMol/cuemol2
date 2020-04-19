// -*-Mode: C++;-*-
//
// Utility routine for nested property
//

#ifndef QLIB_NESTED_PROP_HANDLER_HPP_INCLUDED
#define QLIB_NESTED_PROP_HANDLER_HPP_INCLUDED

#include "qlib.hpp"

namespace qlib {

class NestedPropHandler
{
public:
  
  LString m_name;
  LString m_last_name;
  LPropSupport *m_pScrObj;
  LVariant m_rval;

  NestedPropHandler(const LString &name, LPropSupport *pScrObj)
       : m_name(name), m_pScrObj(pScrObj)
    {
    }

  const LString &last_name() const { return m_last_name; }

  /// Handle the dot notation of nested properties
  LPropSupport *apply()
  {
    m_last_name = m_name;
    if (m_name.indexOf('.')<0) {
      // not a nested name
      return m_pScrObj;
    }
    
    LStringList sl;
    m_name.split('.', sl);
  

    auto iter = sl.begin();
    int nc = sl.size() - 1;
    int i=0;
    MB_ASSERT(nc>=1);
    
    qlib::LPropSupport *pObj = const_cast<qlib::LPropSupport *>(m_pScrObj);
    LVariant var;
    
    for (; iter!=sl.end() && i<nc; ++iter, ++i) {
      const LString &prop_name = *iter;
      // check existence of prop_name in pObj
      if (!pObj->getPropSpecImpl(prop_name, NULL)) {
        // not found
        MB_DPRINTLN("handleNestedProp(%s) error; not found %s ", m_name.c_str(), iter->c_str());
        return m_pScrObj;
        //return false;
      }
      // ATTN: getProperty may return the addRefed object ptr !!
      //  (This should not fail)
      {
        LVariant vtmp;
        pObj->getProperty(prop_name, vtmp);
        if (!vtmp.isObject()) {
          // not an Object
          MB_DPRINTLN("handleNestedProp(%s) error; getprop %s err", m_name.c_str(), iter->c_str());
          return m_pScrObj;
          //return false;
        }
        var = vtmp;
      }
      
      // traverse into the child prop (object)
      pObj = var.getObjectPtr();
      if (pObj==NULL) {
        // invalid Object
        MB_DPRINTLN("handleNestedProp(%s) error; prop %s is null", m_name.c_str(), iter->c_str());
        return m_pScrObj;
        //return false;
      }
    }
    
    m_last_name = *iter;
    m_rval = var;
    
    // ATTN: pObj is addRefed!! (and will be released when this obj is destructed)
    return m_rval.getObjectPtr();
  }
};

}

#endif


