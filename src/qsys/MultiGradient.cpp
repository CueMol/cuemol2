// -*-Mode: C++;-*-
//
//  Multi-color gradient class
//

#include <common.h>

#include "MultiGradient.hpp"

#include "Renderer.hpp"
#include "Object.hpp"
#include "Scene.hpp"
#include "PropEditInfo.hpp"
#include "UndoManager.hpp"

#include <gfx/SolidColor.hpp>
#include <gfx/GradientColor.hpp>
#include <qlib/Utils.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/LDOM2Tree.hpp>
#include <qlib/LPropEvent.hpp>

#include <qlib/ObjectManager.hpp>

#include <boost/property_tree/ptree.hpp>
#include <boost/property_tree/json_parser.hpp>
#include <sstream>

using namespace qsys;

// MC_CLONEABLE_IMPL(qsys::MultiGradient);

MultiGradient::MultiGradient()
{
}

MultiGradient::~MultiGradient()
{
}

/// get color
gfx::ColorPtr MultiGradient::getColor(double rho) const
{
  if (m_data.empty())
    return gfx::SolidColor::createRGB(0.0, 0.0, 0.0, 1.0);

  data_t::const_iterator iter = m_data.begin();

  if (m_data.size()==1)
    return iter->pColor;

  // check lower bound
  if (iter->value>rho) {
    return iter->pColor;
  }
  
  // check higher bound
  data_t::const_iterator eiter = m_data.end();
  data_t::const_iterator iter2 = eiter;
  --iter2;
  if (iter2->value<=rho) {
    return iter2->pColor;
  }

  // check middle points (iter, iter2)
  for (; iter!=eiter; ++iter) {
    iter2 = iter;
    iter2++;

    double v1 = iter->value;
    double v2 = iter2->value;
    if (v1<=rho && rho<v2) {
      double rho2 = (rho-v1)/(v2-v1);
      return gfx::ColorPtr(MB_NEW gfx::GradientColor(iter2->pColor, iter->pColor, rho2)); 
    }
  }

  // should not be reached here!!
  MB_ASSERT(false);
  LOG_DPRINTLN("ERROR!!");
  return gfx::SolidColor::createRGB(0.0, 0.0, 0.0, 1.0);
}

MultiGradient::data_t::const_iterator MultiGradient::getIterAt(int ind) const
{
  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator eiter = m_data.end();

  if (ind>=m_data.size())
    return eiter;

  int i=ind;
  while ( i>0 && iter!=eiter) {
    --i;
    ++iter;    
  }

  return iter;
}

MultiGradient::data_t::iterator MultiGradient::getIterAt(int ind)
{
  data_t::iterator iter = m_data.begin();
  data_t::iterator eiter = m_data.end();

  if (ind>=m_data.size())
    return eiter;

  int i=ind;
  while ( i>0 && iter!=eiter) {
    --i;
    ++iter;    
  }

  return iter;
}

double MultiGradient::getValueAt(int ind) const
{
  data_t::const_iterator iter = getIterAt(ind);

  if (iter==m_data.end()) {
    MB_THROW(qlib::RuntimeException, "error");
  }

  return iter->value;
}

gfx::ColorPtr MultiGradient::getColorAt(int ind) const
{
  data_t::const_iterator iter = getIterAt(ind);

  if (iter==m_data.end()) {
    MB_THROW(qlib::RuntimeException, "error");
  }

  return iter->pColor;
}

bool MultiGradient::removeAt(int ind)
{
  data_t::iterator iter = getIterAt(ind);

  if (iter==m_data.end())
    return false;

  m_data.erase(iter);
  return true;
}

void MultiGradient::writeTo2(qlib::LDom2Node *pNode) const
{
  // write properties
  super_t::writeTo2(pNode);

  BOOST_FOREACH(const Node &pt, m_data) {
    qlib::LDom2Node *pChNode = pNode->appendChild("gradnode");
    // always in child element
    pChNode->setAttrFlag(false);

    {
      // write num (value) of tuple (maybe stored as attribute)
      LString val = LString::format("%f", pt.value);
      pChNode->appendStrAttr("par", val);
    }
    {
      // write color of tuple (maybe stored as attribute)
      qlib::LDom2Node *pColNode = pChNode->appendChild("col");
      pColNode->setupByObject(pt.pColor.get());
    }

  }
}

void MultiGradient::readFrom2(qlib::LDom2Node *pNode)
{
  // read properties
  super_t::readFrom2(pNode);

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    qlib::LDom2Node *pChNode = pNode->getCurChild();
    LString tag = pChNode->getTagName();

    if (!tag.equals("gradnode")) {
      continue;
    }

    if (pChNode->findChild("par")==NULL) {
      LOG_DPRINTLN("MultiGradient.readFrom> no value attr in gradnode tag!!");
      continue;
    }

    LString valstr = pChNode->getStrAttr("par");
    double val;
    if (!valstr.toDouble(&val)) {
      LOG_DPRINTLN("MultiGradient.readFrom> invalid value attr in gradnode tag!!");
      continue;
    }

    qlib::LDom2Node *pColNode = pChNode->findChild("col");
    if (pColNode==NULL) {
      LOG_DPRINTLN("MultiGradient.readFrom> no color valule in gradnode tag!!");
      continue;
    }
    gfx::ColorPtr pCol(gfx::AbstractColor::fromNode(pColNode));
    if (pCol.isnull()) {
      LOG_DPRINTLN("MultiGradient.readFrom> invalid color in gradnode tag (ignored)");
      continue;
    }

    insert(val, pCol);
  }

}

namespace {
  // minimal JSON string escape for color strings
  LString escapeJSONString(const LString &src)
  {
    LString rval;
    for (int i=0; i<src.length(); ++i) {
      char c = src[i];
      if (c=='"' || c=='\\')
        rval += '\\';
      rval += c;
    }
    return rval;
  }
}

LString MultiGradient::getNodesJSON() const
{
  LString rval = "[";
  bool bfirst = true;
  for (const Node &node : m_data) {
    if (!bfirst)
      rval += ",";
    bfirst = false;
    LString colstr = node.pColor->toString();
    rval += LString::format("{\"value\":%.15g,\"color\":\"%s\",\"r\":%d,\"g\":%d,\"b\":%d}",
                            node.value,
                            escapeJSONString(colstr).c_str(),
                            node.pColor->r(),
                            node.pColor->g(),
                            node.pColor->b());
  }
  rval += "]";
  return rval;
}

void MultiGradient::setNodesJSON(const LString &json)
{
  namespace pt = boost::property_tree;

  // ptree's read_json requires a rooted document; wrap the array in an object
  LString wrapped = LString("{\"nodes\":") + json + "}";
  pt::ptree tree;
  std::istringstream iss(wrapped.c_str());
  try {
    pt::read_json(iss, tree);
  }
  catch (const pt::json_parser_error &e) {
    LString msg = LString::format("MultiGradient.setNodesJSON> invalid JSON: %s", e.what());
    MB_THROW(qlib::RuntimeException, msg);
  }

  auto nodes = tree.get_child_optional("nodes");
  if (!nodes) {
    MB_THROW(qlib::RuntimeException, "MultiGradient.setNodesJSON> nodes array not found");
  }

  MultiGradientPtr pScratch(MB_NEW MultiGradient());

  for (const auto &child : *nodes) {
    const pt::ptree &node = child.second;
    auto value = node.get_optional<double>("value");
    auto color = node.get_optional<std::string>("color");
    if (!value || !color) {
      MB_THROW(qlib::RuntimeException,
               "MultiGradient.setNodesJSON> node requires value and color fields");
    }
    gfx::ColorPtr pCol(gfx::AbstractColor::fromStringS(LString(color->c_str())));
    if (pCol.isnull()) {
      LString msg = LString::format("MultiGradient.setNodesJSON> invalid color: %s",
                                    color->c_str());
      MB_THROW(qlib::RuntimeException, msg);
    }
    if (pScratch->insert(*value, pCol)<0) {
      LOG_DPRINTLN("MultiGradient.setNodesJSON> duplicate value %f skipped", *value);
    }
  }

  // copyFrom() inherits undo recording and prop-changed event firing
  copyFrom(pScratch);
}

//static
MultiGradientPtr MultiGradient::createDefaultS()
{
  MultiGradientPtr pRes(MB_NEW MultiGradient());
  pRes->insert(0.0, gfx::SolidColor::createRGB(1.0, 1.0, 1.0, 1.0));
  return pRes;
}

namespace {

  class MultiGradEvent : public qlib::LPropEvent
  {
  public:
    MultiGradEvent() : qlib::LPropEvent() {}
    MultiGradEvent(const LString &name) : qlib::LPropEvent(name) {}

    /// Internal data structure is changed by non-setter method(s)
    /// (i.e. append/insertBefore, etc)
    bool isIntrDataChanged() const override { return true; }
  };

  class MultiGradEditInfo : public qsys::PropEditInfoBase
  {
  public:

    MultiGradEditInfo()
    {
    }

    ~MultiGradEditInfo() override
    {
    }

    //////////

    MultiGradientPtr m_pOld;
    MultiGradientPtr m_pNew;

    MultiGradient *getTargetObj() const
    {
      qlib::LPropSupport *pTgtRoot = getTarget();
      if (pTgtRoot==NULL) return NULL;
      
      qlib::NestedPropHandler nph(getPropName(), pTgtRoot);
      qlib::LPropSupport *pTgt = nph.apply();
      qlib::LVariant lvar;
      if (!pTgt->getProperty(nph.last_name(), lvar))
        return NULL;
      if (!lvar.isObject())
        return NULL;
      qlib::LScriptable *pScr = lvar.getBareObjectPtr();
      MultiGradient *pTgt2 = dynamic_cast<MultiGradient *>(pScr);
      return pTgt2;
    }

    /// Perform undo
    bool undo() override
    {
      MultiGradient *pTgt = getTargetObj();
      if (pTgt==NULL)
        return false;

      pTgt->copyFrom(m_pOld);

      return true;
    }

    /// Perform redo
    bool redo() override
    {
      MultiGradient *pTgt = getTargetObj();
      if (pTgt==NULL)
        return false;

      pTgt->copyFrom(m_pNew);

      return true;
    }

    bool isUndoable() const override {
      if (m_pOld.isnull() || m_pNew.isnull()) return false;
      return true;
    }
    bool isRedoable() const override {
      if (m_pOld.isnull() || m_pNew.isnull()) return false;
      return true;
    }

  };

}

qsys::ScenePtr MultiGradient::getScene() const
{
  qsys::ScenePtr pScene;

  qlib::uid_t rootuid = getRootUID();
  if (rootuid==qlib::invalid_uid)
    return pScene;

  {
    // try renderer
    qsys::Renderer *pTgtRoot =
      qlib::ObjectManager::sGetObj<qsys::Renderer>(rootuid);
    if (pTgtRoot!=NULL)
      return pTgtRoot->getScene();
  }
  
  {
    // try object
    qsys::Object *pTgtRoot =
      qlib::ObjectManager::sGetObj<qsys::Object>(rootuid);
    if (pTgtRoot!=NULL)
      return pTgtRoot->getScene();
  }

  return pScene;
}

void MultiGradient::copyFromImpl(const MultiGradient *pSrc)
{
  clear();

  int i, nsize = pSrc->getSize();
  for (i=0; i<nsize; ++i) {
    double par = pSrc->getValueAt(i);
    gfx::ColorPtr col = pSrc->getColorAt(i);
    insert(par, col);
  }
}

void MultiGradient::copyFrom(const MultiGradientPtr &pSrc)
{
  // setup undo infor
  qsys::UndoUtil uu(getScene());

  // save the old data
  MultiGradientPtr pOld;
  if (uu.isOK()) {
    pOld = MultiGradientPtr(MB_NEW MultiGradient());
    pOld->copyFromImpl(this);
  }
  
  copyFromImpl(pSrc.get());

  if (uu.isOK()) {
	  MultiGradientPtr pNew = MultiGradientPtr(MB_NEW MultiGradient());
    pNew->copyFromImpl(pSrc.get());
    MultiGradEditInfo *pInfo = MB_NEW MultiGradEditInfo();
    pInfo->setup(this);
    pInfo->m_pOld = pOld;
    pInfo->m_pNew = pNew;
    uu.add(pInfo);
  }

  // Fire prop changed event
  MultiGradEvent ev(m_thisname);
  nodePropChgImpl(ev);

}


