// -*-Mode: C++;-*-
//
//  XML format top/par file reader class
//
//  $Id: XMLTopparFile.cpp,v 1.8 2011/04/03 11:11:06 rishitani Exp $

#include <common.h>

#include <qlib/Utils.hpp>
#include <qlib/FileStream.hpp>

#include "XMLTopparFile.hpp"
#include "TopoDB.hpp"
#include "ParamDB.hpp"

#include "ResiToppar.hpp"
#include "ResiPatch.hpp"

using namespace molstr;

XMLTopparFile::XMLTopparFile()
  : m_pParamDB(NULL), m_pTopoDB(NULL)
{
  m_nResids = 0;
  m_nLinks = 0;
}

XMLTopparFile::~XMLTopparFile()
{
}

/////////////////////////////////////////////////////////////////

// attach ParamDB obj to this I/O obj
void XMLTopparFile::attach(ParamDB *pdic,
			   TopoDB *ptpdic)
{
  m_pParamDB = pdic;
  m_pTopoDB = ptpdic;
}

// detach ParamDB obj from this I/O obj
void XMLTopparFile::detach()
{
  m_pParamDB = NULL;
  m_pTopoDB = NULL;
}

// read CNS format parameter file from "filename"
bool XMLTopparFile::read(const char *filename)
{
  if (m_pParamDB==NULL ||
      m_pTopoDB==NULL) {
    LOG_DPRINTLN("XMLToppar> Error: XMLTopparFile:read() : dictionary not attached !!");
    return false;
  }

  try {
    qlib::FileInStream fis;
    fis.open(filename);
    read(fis);
    fis.close();
  }
  catch (const qlib::LException &e) {
    return false;
  }

  LOG_DPRINTLN("XMLToppar> read %d residues.", m_nResids);
  LOG_DPRINTLN("XMLToppar> read %d links.", m_nLinks);
  return true;
}

void XMLTopparFile::read(qlib::InStream &ins)
{
  XMLTopparParser psr(ins);
  psr.m_pReader = this;
  psr.parse();
  // MB_DPRINTLN("##### void XMLTopparFile::read(qlib::InStream &ins) OK");
}

//

void XMLTopparFile::startTopResid(const Attrs &attrs)
{
  if (!attrs.containsKey("id")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, id attr is not defined");
    return;
  }
  LString id = attrs.get("id");

  ResiToppar *pToppar = m_pTopoDB->get(id);
  if (pToppar==NULL) {
    // Create new ResiToppar object, and register to the dictionary.
    pToppar = MB_NEW ResiToppar();
    pToppar->setName(id.c_str());
    m_pTopoDB->put(pToppar);
    // MB_DPRINTLN("XMLTop resid new def %s", id.c_str());
  }
  else {
    // MB_DPRINTLN("XMLTop resid ovwr %s", id.c_str());
  }
  m_pCurResid = pToppar;

  // 3-letter code for PDB writing
  if (attrs.containsKey("three"))
    m_pCurResid->setPropStr("three", attrs.get("three"));
  // Text description of the residue
  if (attrs.containsKey("desc"))
    m_pCurResid->setPropStr("desc", attrs.get("desc"));
  // Polymer type (group) name
  if (attrs.containsKey("group"))
    m_pCurResid->setPropStr("group", attrs.get("group"));

  if (attrs.containsKey("pivot"))
    m_pCurResid->addPivotAtom(attrs.get("pivot"));
  //m_pCurResid->setPropStr("pivot", attrs.get("pivot"));
  // single-letter code
  if (attrs.containsKey("single"))
    m_pCurResid->setPropStr("single", attrs.get("single"));
}

void XMLTopparFile::endTopResid()
{
  if (m_pCurResid!=NULL) {
    m_nResids++;
    MB_DPRINTLN("Read resid %s done.", m_pCurResid->getName().c_str());
  }
  m_pCurResid = NULL;
}

void XMLTopparFile::startTopAtoms(const Attrs &attrs)
{
  if (!attrs.containsKey("ns")) {
    m_curNS = LString();
    return;
  }
  LString ns = attrs.get("ns");
  m_curNS = ns;
}

void XMLTopparFile::endTopAtoms()
{
  m_curNS = LString();
}

void XMLTopparFile::startTopAtom(const Attrs &attrs)
{
  if (!attrs.containsKey("id")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, atom id attr is not defined");
    return;
  }
  LString id = attrs.get("id");
  //LString orig_id = id;

  if (!m_curNS.isEmpty()) {
    if (m_pCurResid->getAtom(id)==NULL) {
      LOG_DPRINTLN("ns=%s, atom %s.%s is not found in default ns",
                   m_curNS.c_str(), m_pCurResid->getName().c_str(), id.c_str());
    }
    id = m_curNS+":"+id;
  }
  
  TopAtom *pAtom = m_pCurResid->getAtom(id);
  if (pAtom==NULL) {
    m_pCurResid->addAtom(id, "", 0, 0, 0, 0);
    pAtom = m_pCurResid->getAtom(id);
  }

  if (attrs.containsKey("elem"))
    pAtom->elem = attrs.get("elem");
  if (attrs.containsKey("type"))
    pAtom->type = attrs.get("type");
  if (attrs.containsKey("charge")) {
    double val;
    if (attrs.get("charge").toDouble(&val))
      pAtom->charge = val;
  }

}

//static
int XMLTopparFile::convBondType(const LString &typestr)
{
  if (typestr.equals("single"))
    return MolBond::SINGLE;
  else if (typestr.equals("deloc"))
    return MolBond::DELOC;
  else if (typestr.equals("double"))
    return MolBond::DOUBLE;
  else if (typestr.equals("triple"))
    return MolBond::TRIPLE;
  else
    return MolBond::SINGLE;
}


void XMLTopparFile::startTopBond(const Attrs &attrs)
{
  if (!attrs.containsKey("id1")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, bond id1 attr is not defined");
    return;
  }
  LString id1 = attrs.get("id1");

  if (!attrs.containsKey("id2")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, bond id2 attr is not defined");
    return;
  }
  LString id2 = attrs.get("id2");

  TopBond *pBond = m_pCurResid->getBond(id1, id2);
  if (pBond==NULL) {
    pBond = m_pCurResid->addBond(id1, id2, 0, 0);
  }

  if (attrs.containsKey("type")) {
    pBond->type = convBondType(attrs.get("type"));
  }
  
  if (attrs.containsKey("value")) {
    double val;
    if (attrs.get("value").toDouble(&val))
      pBond->r0 = val;
  }

  if (attrs.containsKey("esd")) {
    double val;
    if (attrs.get("esd").toDouble(&val))
      pBond->esd = val;
  }
}

void XMLTopparFile::startResAlias(const Attrs &attrs)
{
  if (!attrs.containsKey("value")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, synonym value attr is not defined");
    return;
  }
  LString value = attrs.get("value");

  if (m_pCurResid==NULL) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, synonym curresid is NULL");
    return;
  }

  const LString &resnam = m_pCurResid->getName();
  m_pTopoDB->putAliasName(value, resnam);
}

void XMLTopparFile::startAtomAlias(const Attrs &attrs)
{
  if (!attrs.containsKey("value")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, synonym value attr is not defined");
    return;
  }
  LString value = attrs.get("value");

  if (!attrs.containsKey("cname")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, synonym cname attr is not defined");
    return;
  }
  LString cname = attrs.get("cname");

  if (m_pCurResid==NULL) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, synonym curresid is NULL");
    return;
  }

  m_pCurResid->putAliasName(value, cname);
}

void XMLTopparFile::startResRing(const Attrs &attrs)
{
  if (!attrs.containsKey("value")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, ring value attr is not defined");
    return;
  }
  LString value = attrs.get("value");

  std::list<LString> rmemb;
  value.split(' ', rmemb);
  if (rmemb.size()>0)
    m_pCurResid->addRing(rmemb);
}

void XMLTopparFile::startResSidech(const Attrs &attrs, bool bSideCh)
{
  if (!attrs.containsKey("value")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, side/mainch value attr is not defined");
    return;
  }
  LString value = attrs.get("value");

  std::list<LString> rmemb;
  value.split(' ', rmemb);
  if (rmemb.size()>0) {
    if (bSideCh)
      m_pCurResid->addSideCh(rmemb);
    else
      m_pCurResid->addMainCh(rmemb);
  }
}

void XMLTopparFile::startResProp(const Attrs &attrs)
{
  if (!attrs.containsKey("name")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, side/mainch name attr is not defined");
    return;
  }
  LString name = attrs.get("name");

  if (!attrs.containsKey("value")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, side/mainch value attr is not defined");
    return;
  }
  LString value = attrs.get("value");
  
  m_pCurResid->setPropStr(name, value);
}

////

void XMLTopparFile::startLink(const Attrs &attrs)
{
  if (!attrs.containsKey("id")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, link id attr is not defined");
    return;
  }
  LString id = attrs.get("id");

  bool bPoly = false;
  if (attrs.containsKey("poly") && attrs.get("poly").equalsIgnoreCase("true")) {
    bPoly = true;
  }

  ResiPatch *pPatch = m_pTopoDB->patchGet(id);
  if (pPatch==NULL) {
    pPatch = MB_NEW ResiPatch();
    pPatch->setName(id);
    m_pTopoDB->patchPut(pPatch);
  }

  pPatch->setPolyLink(bPoly);
  m_pCurPatch = pPatch;
}

void XMLTopparFile::endLink()
{
  if (m_pCurPatch!=NULL) {
    m_nLinks++;
    MB_DPRINTLN("Read link %s done.", m_pCurPatch->getName().c_str());
  }

  m_pCurPatch = NULL;
}

void XMLTopparFile::startLinkTarg(const Attrs &attrs)
{
  if (m_pCurPatch==NULL) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, target CurPatch is NULL");
    return;
  }

  LString resid1, group1;
  LString resid2, group2;
  if (attrs.containsKey("resid1"))
    resid1 = attrs.get("resid1");
  if (attrs.containsKey("group1"))
    group1 = attrs.get("group1");
  if (attrs.containsKey("resid2"))
    resid2 = attrs.get("resid2");
  if (attrs.containsKey("group2"))
    group2 = attrs.get("group2");

  const LString &patch_name = m_pCurPatch->getName();

  // MB_DPRINTLN("patch add: %s", patch_name.c_str());
  m_pTopoDB->addLink2(resid1, group1,
		      resid2, group2,
		      patch_name);
}

void XMLTopparFile::startLinkBond(const Attrs &attrs)
{
  if (m_pCurPatch==NULL) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, bond CurPatch is NULL");
    return;
  }

  if (!attrs.containsKey("id1")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, bond id1 attr is not defined");
    return;
  }
  LString id1 = attrs.get("id1");

  if (!attrs.containsKey("id2")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, bond id2 attr is not defined");
    return;
  }
  LString id2 = attrs.get("id2");

  TopBond *pBond = m_pCurPatch->getBond(id1, id2);
  if (pBond==NULL) {
    pBond = m_pCurPatch->addBond(id1, id2, ResiPatch::PATCH_ADD);
  }

  if (attrs.containsKey("type"))
    pBond->type = convBondType(attrs.get("type"));
  //pBond->type = attrs.get("type");

  if (attrs.containsKey("value")) {
    double val;
    if (attrs.get("value").toDouble(&val))
      pBond->r0 = val;
  }

  if (attrs.containsKey("esd")) {
    double val;
    if (attrs.get("esd").toDouble(&val))
      pBond->esd = val;
  }
}

void XMLTopparFile::startParAtom(const Attrs &attrs)
{
  if (!attrs.containsKey("id")) {
    MB_THROW(qlib::FileFormatException, "XMLTopparFile format, param-atom id attr is not defined");
    return;
  }
  LString id = attrs.get("id");

  param::AtomVal *pAtom = m_pParamDB->getAtom(id);
  if (pAtom==NULL) {
    if (!m_pParamDB->addAtom(id)) {
      MB_THROW(qlib::RuntimeException, "XMLTopparFile format, add atom param failed");
      return;
    }
    pAtom = m_pParamDB->getAtom(id);
  }

  LString strval;
  
  if (attrs.containsKey("elem"))
    pAtom->elem = attrs.get("elem");

  if (attrs.containsKey("hbon"))
    pAtom->hbon = attrs.get("hbon");

  if (attrs.containsKey("hybr"))
    pAtom->hybrid = attrs.get("hybr");

  if (attrs.containsKey("mass")) {
    strval = attrs.get("mass");
    if (!strval.toDouble(&pAtom->mass)) {
      MB_THROW(qlib::FileFormatException, "XMLTopparFile format, param-atom mass attr is invalid");
      return;
    }
  }

  if (attrs.containsKey("vdwr")) {
    strval = attrs.get("vdwr");
    if (!strval.toDouble(&pAtom->vdwr)) {
      MB_THROW(qlib::FileFormatException, "XMLTopparFile format, param-atom vdwr attr is invalid");
      return;
    }
  }

  if (attrs.containsKey("vdwhr")) {
    strval = attrs.get("vdwhr");
    if (!strval.toDouble(&pAtom->vdwhr)) {
      MB_THROW(qlib::FileFormatException, "XMLTopparFile format, param-atom vdwhr attr is invalid");
      return;
    }
  }

  if (attrs.containsKey("ionr")) {
    strval = attrs.get("ionr");
    if (!strval.toDouble(&pAtom->ionr)) {
      MB_THROW(qlib::FileFormatException, "XMLTopparFile format, param-atom ionr attr is invalid");
      return;
    }
  }

  if (attrs.containsKey("valency")) {
    strval = attrs.get("valency");
    if (!strval.toInt(&pAtom->valency)) {
      MB_THROW(qlib::FileFormatException, "XMLTopparFile format, param-atom valency attr is invalid");
      return;
    }
  }
}

/////////////////////////////////

bool XMLTopparParser::tagMatch2(const char *tag1, const char *tag2) const
{
  if (getParentTag(1).equalsIgnoreCase(tag1) &&
      getParentTag(0).equalsIgnoreCase(tag2))
    return true;
  return false;
}

bool XMLTopparParser::tagMatch3(const char *tag1, const char *tag2, const char *tag3) const
{
  if (getParentTag(2).equalsIgnoreCase(tag1) &&
      getParentTag(1).equalsIgnoreCase(tag2) &&
      getParentTag(0).equalsIgnoreCase(tag3))
    return true;
  return false;
}

void XMLTopparParser::startElement(const LString &name, const ExpatInStream::Attributes &attrs)
{
  m_tagstk.push_front(name);
  // MB_DPRINTLN("XMLToppar> tag=%s, parent=%s", name.c_str(), getParentTag().c_str());

  XMLTopparFile::Attrs myattrs;
  // process attributes
  ExpatInStream::Attributes::const_iterator iter = attrs.begin();
  ExpatInStream::Attributes::const_iterator end = attrs.end();
  for (; iter!=attrs.end(); ++iter) {
    const LString &key = iter->first;
    const LString &val = iter->second;
    myattrs.set(key, val);
  }

  if (tagMatch2("topology", "resid"))
    m_pReader->startTopResid(myattrs);

  if (tagMatch3("topology", "resid", "atoms"))
    m_pReader->startTopAtoms(myattrs);

  if (tagMatch3("resid", "atoms", "atom"))
    m_pReader->startTopAtom(myattrs);

  if (tagMatch3("resid", "bonds", "bond"))
    m_pReader->startTopBond(myattrs);

  if (tagMatch3("resid", "synonyms", "synonym"))
    m_pReader->startResAlias(myattrs);

  if (tagMatch3("resid", "synonyms", "atom"))
    m_pReader->startAtomAlias(myattrs);

  if (tagMatch3("resid", "rings", "ring"))
    m_pReader->startResRing(myattrs);

  if (tagMatch3("topology", "resid", "sidech"))
    m_pReader->startResSidech(myattrs, true);

  if (tagMatch3("topology", "resid", "mainch"))
    m_pReader->startResSidech(myattrs, false);

  if (tagMatch3("topology", "resid", "prop"))
    m_pReader->startResProp(myattrs);

  /////

  if (tagMatch2("links", "link"))
    m_pReader->startLink(myattrs);

  if (tagMatch3("link", "targets", "target"))
    m_pReader->startLinkTarg(myattrs);

  if (tagMatch3("link", "bonds", "bond"))
    m_pReader->startLinkBond(myattrs);

  /////

  if (tagMatch3("params", "atoms", "atom"))
    m_pReader->startParAtom(myattrs);
}

void XMLTopparParser::endElement(const LString &name)
{
  if (tagMatch2("topology", "resid"))
    m_pReader->endTopResid();

  if (tagMatch3("topology", "resid", "atoms"))
    m_pReader->endTopAtoms();

  /////

  if (tagMatch2("links", "link"))
    m_pReader->endLink();


  m_tagstk.pop_front();
}

