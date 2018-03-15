// -*-Mode: C++;-*-
//
// Style file reader/writer
//
// $Id: StyleFile.cpp,v 1.1 2011/04/16 17:30:39 rishitani Exp $

#include <common.h>

#include "StyleFile.hpp"
#include "StyleMgr.hpp"
#include "StyleSet.hpp"
#include "AutoStyleCtxt.hpp"

#include <gfx/SolidColor.hpp>
#include <gfx/NamedColor.hpp>

#include <qlib/FileStream.hpp>
#include <qlib/LDOM2Stream.hpp>

#include <qlib/Utils.hpp>

using namespace qsys;

using qlib::LDom2Node;
using gfx::SolidColor;
using gfx::SolidColorPtr;
using gfx::AbstractColor;
using gfx::NamedColor;

StyleFile::StyleFile()
{
  m_pTarg = StyleMgr::getInstance();
}

// load

qlib::uid_t StyleFile::loadFile(const LString &aPath, qlib::uid_t scope, const LString &id)
{
  qlib::FileInStream fis;
  LString path;
  if (qlib::isAbsolutePath(aPath)) {
    path = aPath;
  }
  else {
    // relative to the default style dir
    LString basedir = m_pTarg->getDefaultDir();
    path = qlib::makeAbsolutePath(aPath, basedir);
  }
  fis.open(path);

  return loadStream(fis, scope, path, id);
}

qlib::uid_t StyleFile::loadStream(qlib::InStream &ins, qlib::uid_t scope, const LString &src, const LString &id)
{
  //
  // Setup streams
  //
  qlib::LDom2InStream ois(ins);

  //
  // Construct data structure from the file
  //
  qlib::LDom2Tree tree;
  ois.read(tree);
  LDom2Node *pRoot = tree.top();
  // pRoot->dump();

  return loadNodes(pRoot, scope, src, id);
}

qlib::uid_t StyleFile::loadNodes(LDom2Node *pRoot, qlib::uid_t nScopeID, const LString &src, const LString &aId)
{
  /*if (!pRoot->getTagName().equals("styles")) {
    LString msg = LString::format("Invalid tag <%s> in style file", pRoot->getTagName().c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return qlib::invalid_uid;
  }*/

  LString style_id;
  bool bOvr = false;
  if (!aId.isEmpty()) {
    // ID is specified --> override style_id with the specified one
    bOvr = true;
    style_id = aId;
  }
  else {
    // use ID attribute in the data node as a style_id (--> bOvr=false)
    style_id = pRoot->getStrAttr("id");
  }

  if (!src.isEmpty()) {
    // External src
    if (style_id.isEmpty()) {
      // External style file with empty ID (i.e. anonymous style) is not allowed.
      LString msg = LString::format("External style file <%s> has no id.", src.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return qlib::invalid_uid;
    }
  }

  StyleList *pSL = m_pTarg->getCreateStyleList(nScopeID);
  MB_ASSERT(pSL!=NULL);

  StyleSetPtr pSet = pSL->findSet(style_id);
  if (!pSet.isnull()) {
    // style with the same id is already defined.
    if (!style_id.isEmpty()) {
      // redefinition of style with the same (and not empty) ID is not allowed.
      // --> load error!!
      LString msg = LString::format("Style ID <%s> is already defined.", style_id.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return qlib::invalid_uid;
    }
  }
  else {
    // Create New style set
    pSet = StyleSetPtr( MB_NEW StyleSet() );
    pSL->push_front(pSet);
  }

  // define the loading style in the nScopeID context
  AutoStyleCtxt asc(nScopeID);

  pSet = loadNodes(pRoot, pSet);

  // set generic info
  pSet->setContextID(nScopeID);
  pSet->setSource(src);
  pSet->setName(style_id);
  pSet->setOverrideID(bOvr);

  return pSet->getUID();
}

StyleSetPtr StyleFile::loadNodes(LDom2Node *pRoot, StyleSetPtr pMergeSet)
{
  StyleSetPtr pSet = pMergeSet;
  
  if (!pRoot->getTagName().equals("styles")) {
    LString msg = LString::format("Invalid tag <%s> in style file", pRoot->getTagName().c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return pSet;
  }

  if (pSet.isnull()) {
    // Create New style set
    pSet = StyleSetPtr( MB_NEW StyleSet() );
  }
  
  for (pRoot->firstChild(); pRoot->hasMoreChild(); pRoot->nextChild()) {
    LDom2Node *pChNode = pRoot->getCurChild();
    LString tag_name = pChNode->getTagName();
    if (tag_name.equals("id")) {
      LString style_id = pChNode->getValue();
      pSet->setName(style_id);
    }
    else if (tag_name.equals("color")) {
      loadPalette(pChNode, pSet.get());
    }
    else if (tag_name.equals("material")) {
      loadMaterial(pChNode, pSet.get());
    }
    else if (tag_name.equals("setting")) {
      loadSetting(pChNode, pSet.get());
    }
    else if (tag_name.equals("style")) {
      loadStyle(pChNode, pSet.get());
      pRoot->detachCurChild();
    }
    else {
      // default: string data node
      loadStrData(pChNode, pSet.get());
    }
  }

  // Loading completed --> reset modified flag
  pSet->setModified(false);

  return pSet;
}

//////////////////////////////////////////////////////////

void StyleFile::loadStyle(LDom2Node *pNode, StyleSet *pSet)
{
  LString id = pNode->getStrAttr("id");
  if (id.isEmpty()) {
    LString msg = "style tag does not have ID attr";
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  pNode->removeChild("id");

  pSet->putData(StyleSet::makeStyleKey(id), pNode);
}

void StyleFile::loadStrData(LDom2Node *pChNode, StyleSet *pSet)
{
  LString tagname = pChNode->getTagName();
  LString id = pChNode->getStrAttr("id");
  if (id.isEmpty()) {
    LString msg = LString::format("Invalid tag <%s> in style palette file",
                                  pChNode->getTagName().c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }

  LString value = pChNode->getValue();
  LString contents = pChNode->getContents();
  contents = contents.trim("\r\n ");
  if (value.isEmpty() && !contents.isEmpty())
    value = contents;

  LString key = StyleSet::makeStrDataKey("string", tagname, id);
  pSet->setString(key, value);
  
  //if (!pSet->setString(key, value)) {
  //LString msg = LString::format("Cannot define strData entry (key=%s, value=%s): already defined",
  //key.c_str(), value.c_str());
  //MB_THROW(qlib::FileFormatException, msg);
  //return;
  //}
}

void StyleFile::loadPalette(LDom2Node *pNode, StyleSet *pSet)
{
  LString id = pNode->getStrAttr("id");
  LString mat = pNode->getStrAttr("material");
  LString value = pNode->getValue();
  
  if (id.isEmpty() || value.isEmpty()) {
    LString msg = LString::format("Invalid tag <%s> in style palette file",
                                  pNode->getTagName().c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }
  
  ColorPtr pACol = ColorPtr(AbstractColor::fromStringS(value));
  if (pACol.isnull()) {
    LString msg = LString::format("Invalid value <%s> in style palette file",
                                  value.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }

  qlib::LScrSp<NamedColor> pNCol(pACol, qlib::no_throw_tag());
  if (!pNCol.isnull()) {
    // pACol (value) is named color
    //   --> resolve (and modify) named color
    LString refname = pNCol->getName();
    //ColorPtr pRefCol = m_pTarg->getColor(refname, pSet->getContextID());
    ColorPtr pRefCol = m_pTarg->getColor(refname);
    if (pRefCol.isnull()) {
      LString msg = LString::format("Undefined named color <%s> in style palette file",
                                    value.c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return;
    }
    //pACol = ColorPtr(static_cast<AbstractColor *>(pRefCol->clone()));
    pACol = procModCol(pNode, pRefCol);
  }

  // Only solid color can be registered to the pallete
  //   (this possibly throws exceptions...)
  SolidColorPtr pSCol(pACol);

  if (!mat.isEmpty())
    pSCol->setMaterial(mat);

  if (pSet->hasColor(id)) {
    LString msg = LString::format("Color palette entry (id=%s) already defined",
                                  id.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }

  pSet->setColor(id, pSCol);
}

ColorPtr StyleFile::procModCol(LDom2Node *pNode, const ColorPtr &pRefCol)
{
  LString attr;
  int nr = pRefCol->r();
  int ng = pRefCol->g();
  int nb = pRefCol->b();
  int na = pRefCol->a();
  double hue, sat, bri, alp;
  AbstractColor::RGBtoHSB(nr, ng, nb, hue, sat, bri);
  alp = double(na)/255.0;
  double d;
  bool bChg = false;

  attr = pNode->getStrAttr("set_h");
  if (!attr.isEmpty()) {
    if (!attr.toDouble(&d))
      MB_THROW(qlib::FileFormatException, "set_h");
    // hue of UI is in degree unit
    hue = d/360.0;
    bChg = true;
  }

  attr = pNode->getStrAttr("set_s");
  if (!attr.isEmpty()) {
    if (!attr.toDouble(&d))
      MB_THROW(qlib::FileFormatException, "set_s");
    sat = d;
    bChg = true;
  }

  attr = pNode->getStrAttr("set_b");
  if (!attr.isEmpty()) {
    if (!attr.toDouble(&d))
      MB_THROW(qlib::FileFormatException, "set_b");
    bri = d;
    bChg = true;
  }

  attr = pNode->getStrAttr("set_a");
  if (!attr.isEmpty()) {
    if (!attr.toDouble(&d))
      MB_THROW(qlib::FileFormatException, "set_a");
    alp = d;
    bChg = true;
  }

  ///

  attr = pNode->getStrAttr("mod_h");
  if (!attr.isEmpty()) {
    if (!attr.toDouble(&d))
      MB_THROW(qlib::FileFormatException, "mod_h");
    // hue of UI is in degree unit
    hue += d/360.0;
    bChg = true;
  }

  attr = pNode->getStrAttr("mod_s");
  if (!attr.isEmpty()) {
    if (!attr.toDouble(&d))
      MB_THROW(qlib::FileFormatException, "mod_s");
    sat += d;
    bChg = true;
  }

  attr = pNode->getStrAttr("mod_b");
  if (!attr.isEmpty()) {
    if (!attr.toDouble(&d))
      MB_THROW(qlib::FileFormatException, "mod_b");
    bri += d;
    bChg = true;
  }

  attr = pNode->getStrAttr("mod_a");
  if (!attr.isEmpty()) {
    if (!attr.toDouble(&d))
      MB_THROW(qlib::FileFormatException, "mod_a");
    alp += d;
    bChg = true;
  }

  // Always create a copy of the original color,
  // to prevent unintended modification.
  // if (!bChg)
  // return pRefCol;

  double ddr,ddg,ddb;
  AbstractColor::HSBtoRGB(hue, sat, bri, ddr, ddg, ddb);
  return ColorPtr(MB_NEW SolidColor(ddr, ddg, ddb, alp));
}

void StyleFile::loadMaterial(LDom2Node *pNode, StyleSet *pSet)
{
  LString mat_id = pNode->getStrAttr("id");
  if (mat_id.isEmpty()) {
    LString msg = LString::format("Tag <%s> requires id attribute",
                                  pNode->getTagName().c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    LDom2Node *pChNode = pNode->getCurChild();

    if (pChNode->getTagName().equals("id")) continue;

    if (!pChNode->getTagName().equals("def")) {
      LString msg = LString::format("Invalid tag <%s> in style material section",
                                    pChNode->getTagName().c_str());
      MB_THROW(qlib::FileFormatException, msg);
      return;
    }

    LString rend_type = pChNode->getStrAttr("type");
    LString value;
    if (!rend_type.isEmpty()) {
      // renderer-type-dependent string material definition
      value = pChNode->getValue();
      LString contents = pChNode->getContents();
      contents = contents.trim("\r\n ");
      if (value.isEmpty() && !contents.isEmpty())
      value = contents;
      
      // LString key = mat_id+DELIM+rend_type+DELIM+"mat";
      // if (!pSet->putString(key, value)) {
      // MB_DPRINTLN("Cannot put material (%s,%s)", mat_id.c_str(), rend_type.c_str());
      // }
      if (!pSet->putMaterial(mat_id, rend_type, value))
        MB_DPRINTLN("Cannot put material (%s,%s)", mat_id.c_str(), rend_type.c_str());
    }
    else {
      /// Material definition for internal (OpenGL) renderer
      double dvalue;
      value = pChNode->getStrAttr("ambient");
      if (value.toRealNum(&dvalue))
        if (!pSet->putMaterial(mat_id, Material::MAT_AMBIENT, dvalue))
          MB_DPRINTLN("Cannot put material (%s)", mat_id.c_str());
      value = pChNode->getStrAttr("diffuse");
      if (value.toRealNum(&dvalue))
        if (!pSet->putMaterial(mat_id, Material::MAT_DIFFUSE, dvalue))
          MB_DPRINTLN("Cannot put material (%s)", mat_id.c_str());
      value = pChNode->getStrAttr("specular");
      if (value.toRealNum(&dvalue))
        if (!pSet->putMaterial(mat_id, Material::MAT_SPECULAR, dvalue))
          MB_DPRINTLN("Cannot put material (%s)", mat_id.c_str());

      value = pChNode->getStrAttr("shininess");
      if (value.toRealNum(&dvalue))
        if (!pSet->putMaterial(mat_id, Material::MAT_SHININESS, dvalue))
          MB_DPRINTLN("Cannot put material (%s)", mat_id.c_str());
      value = pChNode->getStrAttr("emission");
      if (value.toRealNum(&dvalue))
        if (!pSet->putMaterial(mat_id, Material::MAT_EMISSION, dvalue))
          MB_DPRINTLN("Cannot put material (%s)", mat_id.c_str());
    }
  }
  
}

void StyleFile::loadSetting(LDom2Node *pNode, StyleSet *pSet)
{
  LString type = pNode->getStrAttr("type");
  if (type.isEmpty()) {
    LString msg = LString::format("Tag <%s> requires type attribute",
                                  pNode->getTagName().c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return;
  }

  for (pNode->firstChild(); pNode->hasMoreChild(); pNode->nextChild()) {
    LDom2Node *pChNode = pNode->getCurChild();
    const LString &tagname = pChNode->getTagName();
    if (tagname.equals("type")) continue;
    LString value = pChNode->getValue();
    LString contents = pChNode->getContents();
    contents = contents.trim("\r\n ");
    if (value.isEmpty() && !contents.isEmpty())
      value = contents;
    
    //LString key = tagname + DELIM + type + DELIM + "cfg";
    LString key = StyleSet::makeStrDataKey("cfg", tagname, type);
    if (!pSet->setString(key, value)) {
      LOG_DPRINTLN("Cannot define setting (%s,%s)=%s: already defined",
                   tagname.c_str(), type.c_str(), key.c_str());
    }
  }
}

//////////////////////////////////////////////////////////////////////////
// Save to datanode/file

void StyleFile::saveToNode(LDom2Node *pNode, qlib::uid_t nScopeID, const LString &basedir)
{
  StyleList *pSL = m_pTarg->getCreateStyleList(nScopeID);
  if (pSL==NULL || pSL->empty()) return;

  // Iterate reversed order:
  //  The first node is higest priority, so is defined last in the file!!
  BOOST_REVERSE_FOREACH(StyleList::value_type pSet, *pSL) {

    // make child "styles" node
    qlib::LDom2Node *pChNode = pNode->appendChild();
    pChNode->setTagName("styles");

    // style set name (id)
    LString id = pSet->getName();
    LString src = pSet->getSource();

    if ( src.isEmpty() ) {
      // Internal style description
      pSet->writeToDataNode(pChNode);
    }
    else {
      // External style reference is serialized as external reference node.
      LString relpath = qlib::makeRelativePath(src, basedir);
      pChNode->appendStrAttr("src", relpath);
      if (pSet->isOverrideID()) {
        pChNode->appendStrAttr("id", id);
      }
    }

  } // BOOST_FOREACH
}

