//
// Superclass of scriptable objects
//
// $Id: LScrObjects.cpp,v 1.22 2011/01/09 15:12:22 rishitani Exp $

#include <common.h>

#include "LScrObjects.hpp"
#include "LPropEvent.hpp"
#include "ObjectManager.hpp"
#include "PropSpec.hpp"
// #include "ObjStream.hpp"
#include "LDOM2Tree.hpp"


using namespace qlib;


LScrObjBase::LScrObjBase()
     : m_rootuid(invalid_uid)
{
  m_pEvtCaster = MB_NEW LPropEventCaster;
}

LScrObjBase::~LScrObjBase()
{
  delete m_pEvtCaster;
}

qlib::uid_t LScrObjBase::getRootUID() const
{
  return m_rootuid;
}

/**
   Setup the parent (root) reference (if required)
*/
void LScrObjBase::setupParentData(const LString &propname)
{
  // operations to maintain the correct m_rootuid and m_thisname
  LVariant newval;
  if (!getPropertyImpl(propname, newval))
    return;

  // // This is required to delete obj, when it scoped out.
  // newval.bOwned = true;

  if (!newval.isObject())
    return;

  LScriptable *pNewObjVal = newval.getBareObjectPtr();

  if (pNewObjVal==NULL)
    return;

  LScrObjBase *pNewPropCon = static_cast<LScrObjBase *>(pNewObjVal);

  pNewPropCon->m_rootuid = getRootUID();
  pNewPropCon->m_thisname = m_thisname + propname;

  // TO DO: travarse into the child properties of pNewPropCon
}


int LScrObjBase::addPropListener(LPropEventListener *pL)
{
  if (pL==NULL) return -1;
  return m_pEvtCaster->add(pL);
}

bool LScrObjBase::removePropListener(LPropEventListener *pL)
{
  if (pL==NULL) return false;
  return m_pEvtCaster->remove(pL);
}

void LScrObjBase::firePropChanged(LPropEvent &ev, const LString &parentname)
{
/*
  LString newval="(object)";
  if (ev.getNewValue().isStrConv())
    newval = ev.getNewValue().toString();
  MB_DPRINTLN("LScrObjBase(%s)::firePropChanged(%s=%s)",
              typeid(*this).name(),
              ev.getName().c_str(),
              newval.c_str());
*/
  
  ev.setTarget(this);
  m_pEvtCaster->replicaFire(ev);
}

void LScrObjBase::nodePropChgImpl(LPropEvent &ev)
{
  //
  // propagate prop-changed event to the parent object
  //
  if (m_rootuid!=invalid_uid) {
    LScrObjBase *pRoot = ensureNotNull(ObjectManager::sGetObj<LScrObjBase>(m_rootuid));

    // node prop changed
    MB_DPRINTLN("PropChg> NODE prop changed.");
    ev.setParentName(m_thisname);
    pRoot->firePropChanged(ev, m_thisname);

    ev.setParentName("");
    firePropChanged(ev, LString());
  }
  else {
    // this is root obj, and root prop is changed (->no propagation occurs)
    firePropChanged(ev, LString());
  }

}

bool LScrObjBase::hasProperty(const LString &propnm) const
{
  //LString last;
  //LVariant rval;
  //if (handleNestedProp(propnm, last, rval))
  //return rval.getObjectPtr()->hasProperty(last);
    
  bool res = getPropSpecImpl(propnm, NULL);
  return res;
}

bool LScrObjBase::hasWritableProperty(const LString &propnm) const
{
  //LString last;
  //LVariant rval;
  //if (handleNestedProp(propnm, last, rval))
  //return rval.getObjectPtr()->hasWritableProperty(last);

  PropSpec spec;
  bool res = getPropSpecImpl(propnm, &spec);
  if (!res) return false;
  
  return !spec.bReadOnly;
}

bool LScrObjBase::hasPropDefault(const LString &propnm) const
{
  //LString last;
  //LVariant rval;
  //if (handleNestedProp(propnm, last, rval))
  //return rval.getObjectPtr()->hasPropDefault(last);

  PropSpec spec;
  bool res = getPropSpecImpl(propnm, &spec);
  if (!res) return false;
  
  return spec.bHasDefault;
}

LString LScrObjBase::getPropTypeName(const LString &propnm) const
{
  //LString last;
  //LVariant rval;
  //if (handleNestedProp(propnm, last, rval))
  //return rval.getObjectPtr()->getPropTypeName(last);

  PropSpec spec;
  bool res = getPropSpecImpl(propnm, &spec);
  if (!res) return LString();
  
  return spec.type_name;
}

bool LScrObjBase::getProperty(const LString &propnm, LVariant &presult) const
{
  //LString last;
  //LVariant rval;
  //if (handleNestedProp(propnm, last, rval))
  //return rval.getObjectPtr()->getPropertyImpl(last, presult);

  bool res = getPropertyImpl(propnm, presult);
  return res;
}

bool LScrObjBase::setProperty(const LString &propnm, const LVariant &newval)
{
  //LString last;
  //LVariant rval;
  //if (handleNestedProp(propnm, last, rval))
  //return rval.getObjectPtr()->setProperty(last, newval);

  //////////

  // event supports & record old value
  qlib::LPropEvent ev(propnm);
  {
    LVariant oldvalue;
    bool res = getPropertyImpl(propnm, oldvalue);
    if (res) {
      // ev.setOwnedOldValue(oldvalue);
      ev.setOldValue(oldvalue);
    }
  }

  // set non-default flag if required
  if (isPropDefault(propnm)) {
    setDefaultPropFlag(propnm, false);
    ev.setOldDefault(true);
  }

  ev.setNewValue(newval);
  // ev.setNewDefault(false);

  bool res = setPropertyImpl(propnm, newval);

  // fire event
  nodePropChgImpl(ev);

  return res;
}

bool LScrObjBase::resetProperty(const LString &propnm)
{
  //LString last;
  //LVariant rval;
  //if (handleNestedProp(propnm, last, rval))
  //return rval.getObjectPtr()->resetProperty(last);

  //////////

  if (isPropDefault(propnm)) {
    // we do not have to do anything
    return true;
  }

  // event supports & record old value
  qlib::LPropEvent ev(propnm);
  {
    LVariant oldvalue;
    bool res = getPropertyImpl(propnm, oldvalue);
    if (res) {
      ev.setOldValue(oldvalue);
    }
  }

  // ev.setOldDefault(false);
  ev.setNewDefault(true);

  // set default flag
  setDefaultPropFlag(propnm, true);

  // this overwrite the value with default one
  bool res = resetPropertyImpl(propnm);

  // fire event
  nodePropChgImpl(ev);

  return res;
}

///////////////////////////////////////////////////////
// Serialization / Deserialization / ApplyStyle

void LScrObjBase::writeTo2(LDom2Node *pNode) const
{
  std::set<LString> names;
  getPropNames(names);

  BOOST_FOREACH(const LString &nm, names) {

    PropSpec spec;
    if (!getPropSpecImpl(nm, &spec))
      continue;
    LVariant value;

    // Ignore prop with the nopersist attribute
    if (spec.bNoPersist)
      continue;

    // Ignore read-only array object
    // (In future, this impl should be modified to save array ??)
    if (spec.bReadOnly &&
        spec.type_name.equals("array")) {
      continue;
    }

    //MB_DPRINTLN("> write(%s) prop=%s, isDef=%d",
    //typeid(*this).name(),
    //nm.c_str(),
    //isPropDefault(nm));

    // check default flag
    bool bDefault = false;
    if (spec.bHasDefault)
      bDefault = isPropDefault(nm);

    if (!getProperty(nm, value))
      continue;
      
    if (value.isNull())
      continue;

    LDom2Node *pChNode = pNode->appendChild(nm);
    pChNode->setupByVariant(value);
    
    pChNode->setReadOnly(spec.bReadOnly);
    pChNode->setDefaultFlag(bDefault);

  } // for (; iter!=names.end(); ++iter) {

}

void LScrObjBase::readFrom2(LDom2Node *pNode)
{

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();
    LString type = pChNode->getTypeName();

    LVariant variant;

    PropSpec spec;
    if (!getPropSpecImpl(tag, &spec)) {
      // Input error/unknown prop (ignore)
      continue;
    }

    if (spec.bNoPersist) {
      // skip the prop with nopersit attr
      MB_DPRINTLN("WARNING: readFrom2() deser of NOPERSIST prop %s is ignored", tag.c_str());
      continue;
    }
    
    if (spec.bReadOnly) {
      /*if (type.isEmpty()) {
        // Input error/read-only property (ignore)
        continue;
      }
      else {*/
      
      // This node is readonly, but there is still
      //  posibility that childrens are writable...
      
      if (!getProperty(tag, variant))
        continue;
      if (!variant.isObject())
        continue;
      //if (variant.isStrConv())
      //continue;
      
      LScriptable *pChObj = variant.getObjectPtr();
      if (pChObj==NULL) {
        LOG_DPRINTLN("LScrObjBase::readFrom2> Error: cannot get object");
        continue;
      }
      
      pChObj->readFrom2(pChNode);
      if (!pChNode->isChildrenConsumed()) {
        // TO DO: report error (unknown element)
        //LOG_DPRINTLN("LScrObjBase::readFrom2> Warning: all nodes are not consumed");
      }
      continue;

      //}
      // not reached here.
      continue;
    }

    //////////
    // In the case of writable property

    bool bChNodeRem = false;
    if (pChNode->isLeaf()) {
      // pChNode is Leaf node
      // --> typename is not specified
      //     (because this node may be defined in attribute)
      LString value = pChNode->getValue();
      variant.setStringValue(value);
      if (pChNode->getChildCount()>0) {
        // Node doesn't have typename but has child nodes!!
        // (e.g. Color nodes)
        bChNodeRem = true;
      }
    }
    else {
      // createObj() creates SmartPtr object, if the class supports it.
      LScriptable *pS = pChNode->createObjByTypeName();
      if (pS==NULL) {
	LOG_DPRINTLN("LScrObjBase::readFrom2> Error: cannot instantiate object");
	continue;
      }

      pS->readFrom2(pChNode);
      bChNodeRem = false;
      if (!pChNode->isChildrenConsumed()) {
	// TO DO: report error (unknown element)
        //LOG_DPRINTLN("LScrObjBase::readFrom2> Warning: all nodes not consumed");
      }

      variant.setObjectPtr(pS);
    }

    try {
      setPropertyImpl(tag, variant);
    }
    catch (const LException &e) {
      // Input error/set property failed
      LOG_DPRINTLN("LScrObjBase::readFrom2> Error, "
		   "setPropertyImpl(%s, %d, %s) failed: %s",
		   tag.c_str(),
		   variant.getTypeID(), variant.toString().c_str(),
		   e.getFmtMsg().c_str());
      continue;
    }

    if (bChNodeRem) {
      if (getProperty(tag, variant) &&
          variant.isObject()) {
        // load remaining nodes
        LScriptable *pS = variant.getObjectPtr();
        pS->readFrom2(pChNode);
      }
    }

    setDefaultPropFlag(tag, false);
    pChNode->setConsumed(true);
  }
}

//////////

bool LScrObjBase::isStrConv() const
{
  return false;
}

bool LScrObjBase::fromString(const LString &src)
{
  return false;
}

LString LScrObjBase::toString() const
{
  MB_DPRINTLN("Warning: LScrObjBase::toString() called");
  return LString();
}

/////////////////////////////////////////

namespace qlib {
  
/// Implementation for the default flag and instance default value for properties
//
class QLIB_API LDefaultFlagImpl
{
private:
  struct DefTabEntry {
    bool m_bIsDefault;
    // LVariant m_defVal;
  };
  typedef std::map<LString, DefTabEntry> DefPropTab;
  
  DefPropTab m_defprops;
  
public:
  bool getDefaultPropFlag(const LString &propnm, const LScrObjBase *pOuter) const
  {
    DefPropTab::const_iterator i = m_defprops.find(propnm);
    if (i==m_defprops.end()) {
      // not found in the table --> default value (flag=true)
      return true;
    }
    return i->second.m_bIsDefault;
  }

  void setDefaultPropFlag(const LString &propnm, bool bflag, const LScrObjBase *pOuter)
  {
    DefPropTab::iterator i = m_defprops.find(propnm);
    if (i==m_defprops.end()) {
      // not found in the table --> insert new entry
      DefTabEntry entry;
      entry.m_bIsDefault = bflag;
      m_defprops.insert(DefPropTab::value_type(propnm, entry));
      return;
    }
    
    // set the flag
    i->second.m_bIsDefault = bflag;
    return;
  }
  
  bool hasPropDefault(const LString &name) const
  {
    DefPropTab::const_iterator i = m_defprops.find(name);
    if (i==m_defprops.end())
      // not found in the table --> does not have instance default
      return false;
    // if (i->second.m_defVal.isNull()) 
    // // found but defVal is not set --> does not have instance default value
    // return false;
    return true;
  }

  void copyDefaultFlags(const LDefaultFlagImpl &src)
  {
    m_defprops.clear();
    m_defprops = src.m_defprops;
  }

  /*
  bool setDefVal(const LString &name, const LVariant &value) {
    DefPropTab::iterator i = m_defprops.find(name);
    if (i==m_defprops.end()) {
      // not found in the table --> create and insert new entry
      DefTabEntry entry;
      entry.m_bIsDefault = false;
      i = m_defprops.insert(DefPropTab::value_type(name, entry)).first;
    }
  
    // rewrite the entry
    i->second.m_defVal = value;
    return true;
  }
   */
};

}

LDefSupportScrObjBase::LDefSupportScrObjBase() : super_t()
{
  m_pdf = MB_NEW LDefaultFlagImpl;
}

LDefSupportScrObjBase::~LDefSupportScrObjBase()
{
  delete m_pdf;
}

bool LDefSupportScrObjBase::isPropDefault(const LString &propnm) const
{
  if (!hasPropDefault(propnm))
    return false;
  return m_pdf->getDefaultPropFlag(propnm, this);
}

void LDefSupportScrObjBase::setDefaultPropFlag(const LString &propnm, bool bflag)
{
  m_pdf->setDefaultPropFlag(propnm, bflag, this);
}

bool LDefSupportScrObjBase::hasPropDefault(const LString &propnm) const
{
  if (m_pdf->hasPropDefault(propnm)) {
    // has instance default
    return true;
  }
  // check class default
  return super_t::hasPropDefault(propnm);
}

void LDefSupportScrObjBase::copyDefaultFlags(const LDefSupportScrObjBase &src)
{
  m_pdf->copyDefaultFlags(*(src.m_pdf));
}

//bool LDefSupportScrObjBase::setInstDefault(const LString &name, const LVariant &value)
//{
//  return m_pdf->setDefVal(name, value);
//}

////////////////////////////////////////////////////////

LScriptable *LSimpleCopyScrObject::copy() const
{
  LObject *pnew = clone();
  // LScriptable *pret = reinterpret_cast<LScriptable *>(pnew);
  // MB_ASSERT(pret==dynamic_cast<LScriptable *>(pnew));

  LScriptable *pret = dynamic_cast<LScriptable *>(pnew);
  return pret;
}

void LSimpleCopyScrObject::destruct()
{
//  MB_DPRINTLN("LSimpleCopyScrObject::destruct");
//  MB_DPRINTLN("delete this %s(%p) ",
//              typeid(*this).name(), this);
  delete this;
}

/////////////////////////////////////////

LScriptable *LNoCopyScrObject::copy() const
{
  LOG_DPRINTLN("FATAL ERROR: copy() is called for NoCopy object %s(%p)",
	       typeid(*this).name(), this);
  MB_ASSERT(false);
  return NULL;
}

void LNoCopyScrObject::destruct()
{
  LOG_DPRINTLN("FATAL ERROR: destruct() is called for NoCopy object %s(%p)",
	       typeid(*this).name(), this);
  MB_ASSERT(false);
}

/////////////////////////////////////////

LScriptable *LSingletonScrObject::copy() const
{
  return const_cast<LSingletonScrObject *>(this);
}

void LSingletonScrObject::destruct()
{
}

//bool LSingletonScrObject::isPropDefault(const LString &propnm) const
//{
//  return false;
//}

//void LSingletonScrObject::setDefaultPropFlag(const LString &propnm, bool bflag)
//{
//}

////////////////////////////////

  using qlib::LString;
  using qlib::LScriptable;

namespace qlib {

  LString getPropsJSONImpl(qlib::LScriptable *pObj)
  {
    std::set<LString> nameset;
    pObj->getPropNames(nameset);

    LString rval;
    //return rval;
    rval += "[\n";

    std::set<LString>::const_iterator iter = nameset.begin();
    std::set<LString>::const_iterator end = nameset.end();
    for (bool bfirst=true; iter!=end; ++iter) {

      if (!bfirst)
        rval += ",\n";

      // TO DO: ignore property generating errors in getProp()

      rval += "{";

      const LString &key = *iter;
      qlib::PropSpec spec;
      if ( !pObj->getPropSpecImpl(key, &spec) ) {
        MB_DPRINTLN("XPCObjWrapper::getPropsJSON> "
                    "Fatal error, prop %s is not found", key.c_str());
        continue;
      }

      const LString &tn = spec.type_name;
      rval += "\"name\": \""+key+"\",\n";
      rval += LString("\"readonly\": ") + LString::fromBool(spec.bReadOnly) + ",\n";
      rval += LString("\"hasdefault\": ") + LString::fromBool(spec.bHasDefault) + ",\n";
      if (spec.bHasDefault) {
        bool bIsDef = pObj->isPropDefault(key);
        rval += LString("\"isdefault\": ") + LString::fromBool(bIsDef) + ",\n";
      }

      if (!tn.startsWith("object")) {
        rval += "\"type\": \""+tn+"\",\n";

        if (tn.equals("boolean")) {
          bool v;
          pObj->getPropBool(key, v);
          rval += LString("\"value\": ") + LString::fromBool(v) + "\n";
        }
        else if (tn.equals("integer")) {
          int v;
          pObj->getPropInt(key, v);
          rval += LString::format("\"value\": %d\n", v);
        }
        else if (tn.equals("real")) {
          double v;
          pObj->getPropReal(key, v);
          rval += LString::format("\"value\": %f\n", v);
        }
        else if (tn.equals("string")) {
          LString v;
          pObj->getPropStr(key, v);
          rval += "\"value\": \""+v.escapeQuots()+"\"\n";
        }
        else if (tn.equals("enum")) {
          if (spec.pEnumDef==NULL) {
            LOG_DPRINTLN("invalid enum data: %s", key.c_str());
            MB_ASSERT(false);
            return LString();
          }
          rval += "\"enumdef\": [";
          int i=0;
          BOOST_FOREACH(qlib::EnumDef::value_type ii, *(spec.pEnumDef)) {
            if (i!=0) rval += ",";
            rval += LString('"') + ii.first + '"';
            ++i;
          }
          rval += "],";
          qlib::LVariant lvar;
          pObj->getProperty(key, lvar);
          LString strval = lvar.toString();
          rval += "\"value\": \""+strval.escapeQuots()+"\"\n";
        }
        else {
          // Other unknown non-object types (array?)
          rval += "\"value\": \"\"\n";
        }
      }
      else {
        rval += "\"type\": \""+tn+"\",\n";

        qlib::LVariant lvar;
        pObj->getProperty(key, lvar);
        if (!lvar.isObject()) {
          // FATAL ERROR!!
          LString msg = LString::format("inconsistent object name of prop <%s>",
                                        key.c_str());
          MB_THROW(qlib::RuntimeException, msg);
          return rval;
        }

        if (lvar.isStrConv()) {
          // String-convertable object (ex. color, selection)
          LString strval = lvar.toString();
          rval += "\"value\": \""+strval.escapeQuots()+"\"\n";
        }
        else {
          // Other unknown object types
          LScriptable *pChObj = lvar.getObjectPtr();
          LString childjson = getPropsJSONImpl(pChObj);
          rval += "\"value\": "+ childjson +"\n";
        }
      }

      rval += "}";
      bfirst = false;
    }

    rval += "]";
    return rval;
  }

}
