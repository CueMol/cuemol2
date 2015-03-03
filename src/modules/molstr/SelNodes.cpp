// -*-Mode: C++;-*-
//
// SelNodes implementations
//
// $Id: SelNodes.cpp,v 1.20 2011/04/16 15:07:31 rishitani Exp $

#include <common.h>

#include <qlib/LRegExpr.hpp>
#include "SelNodes.hpp"
#include "MolAtom.hpp"
#include "MolResidue.hpp"

#include "qsys/style/StyleMgr.hpp"
#include "SelCommand.hpp"
#include "MolCoord.hpp"

// case sensitivity flags (rex: case sensitive, str: case insensitive)
// #define REXMATCH_ICASE
#define STRMATCH_ICASE

using namespace molstr;

bool SelSuperNode::isSelected(MolAtomPtr pAtom)
{
  return true;
}

SelSuperNode::~SelSuperNode() {}

///////////////////////////////

SelOpNode::~SelOpNode()
{
  if (m_p!=NULL)
    delete m_p;
}

int SelOpNode::getType() const
{
  return SELNODE_UOP;
}

SelSuperNode *SelOpNode::clone() const
{
  SelOpNode *pret = MB_NEW SelOpNode(m_p->clone(), m_nmode);
  pret->m_dvalue = m_dvalue;
  pret->m_artarg = m_artarg;
  return pret;
}

LString SelOpNode::toString() const
{
  LString rval;
  if (m_p==NULL) {
    MB_DPRINTLN("SelOpNode::toString() called for empty unary selnode!!");
    rval = LString("[?]");
  }
  else {
    rval = m_p->toString();
  }
  
  if (m_nmode==OP_NOT) {
    return LString::format("!(%s)", rval.c_str());
  }
  else if (m_nmode==OP_AROUND) {
    if (m_artarg.isEmpty())
      return LString::format("(%s) around %f", rval.c_str(), m_dvalue);
    else
      return LString::format("(%s) around [%s] %f", rval.c_str(), m_artarg.c_str(), m_dvalue);
  }
  else if (m_nmode==OP_BYRES) {
    return LString::format("byres (%s)", rval.c_str());
  }
  else if (m_nmode==OP_BYMAINCH) {
    return LString::format("bymainch (%s)", rval.c_str());
  }
  else if (m_nmode==OP_BYSIDECH) {
    return LString::format("bysidech (%s)", rval.c_str());
  }
  else {
    // unknown node: error!!!
    MB_ASSERT(false);
  }

  // should not be reached here
  return LString();
}

bool SelOpNode::isSelected(MolAtomPtr pAtom)
{
  switch (m_nmode) {
  case OP_NOT:
    return ! (getNode()->isSelected(pAtom));

  case OP_AROUND:
    return chkAroundNode(pAtom, false);
  case OP_EXPAND:
    return chkAroundNode(pAtom, true);

  case OP_NEIGHBOR:
    return false; //chkAroundNode(patom);
  case OP_EXTEND:
    return false; //chkAroundNode(patom);

  case OP_BYRES:
    return chkByresNode(pAtom);

  case OP_BYMAINCH:
    return chkMainSideChainNode(pAtom, false);

  case OP_BYSIDECH:
    return chkMainSideChainNode(pAtom, true);

  default:
    MB_THROW(qlib::RuntimeException, "unknown sel_uop node");
  }

  return false;
}

//////

SelBinNode::~SelBinNode()
{
  if (m_p1!=NULL)
    delete m_p1;
  if (m_p2!=NULL)
    delete m_p2;
}

int SelBinNode::getType() const
{
  return SELNODE_BINOP;
}

SelSuperNode *SelBinNode::clone() const
{
  SelBinNode *pret = MB_NEW SelBinNode(m_p1->clone(),
				    m_p2->clone(),
				    m_nmode);

  return pret;
}

LString SelBinNode::toString() const
{
  LString rval1, rval2;
  if (m_p1==NULL || m_p2==NULL) {
    MB_DPRINTLN("SelOpNode::toString() called for empty binary selnode!!");
    rval1 = LString("[?]");
    rval2 = LString("[?]");
  }
  else {
    rval1 = m_p1->toString();
    rval2 = m_p2->toString();
  }
  
  if (m_nmode==OP_AND) {
    return LString::format("(%s) and (%s)", rval1.c_str(), rval2.c_str());
  }
  else /*if (m_nmode==OP_OR)*/ {
    return LString::format("(%s) or (%s)", rval1.c_str(), rval2.c_str());
  }

  // should not be reached here
  return LString();
}

bool SelBinNode::isSelected(MolAtomPtr pAtom)
{
  switch (m_nmode) {
  case OP_AND:
    if (getNode1()->isSelected(pAtom)) {
      if (getNode2()->isSelected(pAtom))
	return true;
    }
    return false;

  case OP_OR:
    if (getNode1()->isSelected(pAtom))
      return true;
    if (getNode2()->isSelected(pAtom))
      return true;

    return false;

  default:
    MB_THROW(qlib::RuntimeException, "unknown sel_binop node");
  }
}

//////

int SelAllNode::getType() const
{
  return SELNODE_ALL;
}

SelSuperNode *SelAllNode::clone() const
{
  SelAllNode *pret = MB_NEW SelAllNode(m_fall);
  return pret;
}

LString SelAllNode::toString() const
{
  if (m_fall)
    return LString("*");
  else
    return LString("!*");
}

bool SelAllNode::isSelected(MolAtomPtr pAtom)
{
  return isAll();
}

//////

int SelRefNode::getType() const
{
  return SELNODE_REF;
}

SelSuperNode *SelRefNode::clone() const
{
  return MB_NEW SelRefNode(*this);
}

LString SelRefNode::toString() const
{
  return "Ref("+m_name+")";
}

void SelRefNode::setName(const char *name)
{
  //m_bCached = false;
  m_pCachedSel = SelectionPtr();
  m_name = name;
  resolveReference();
}

bool SelRefNode::resolveReference() const
{
  if (m_name.isEmpty()) {
    //MB_THROW(qlib::RuntimeException, "SelRefNode: empty reference");
    LOG_DPRINTLN("SelRefNode> empty reference");
    return false;
  }
  
  qsys::StyleMgr *pPM = qsys::StyleMgr::getInstance();
  qlib::uid_t nScopeID = pPM->getContextID();

  LString value = pPM->getStrData("sel", m_name, nScopeID);
  if (value.isEmpty()) {
    //MB_THROW(qlib::RuntimeException, "SelRefNode: invalid reference "+m_name);
    LOG_DPRINTLN("SelRefNode> undefined reference "+m_name);
    return false;
  }
  //m_cachedStr = value;
  
  SelCommand *pComSel = MB_NEW SelCommand();
  if (!pComSel->compile(value)) {
    delete pComSel;
    //MB_THROW(qlib::RuntimeException, "SelRefNode: invalid reference "+m_name+" for "+value);
    LOG_DPRINTLN("SelRefNode: invalid reference "+m_name+" for "+value);
    return false;
  }
  
  m_pCachedSel = SelectionPtr(pComSel);
  return true;
}

bool SelRefNode::isSelected(MolAtomPtr pAtom)
{
  if (m_pCachedSel.isnull()) {
    if (!resolveReference())
      return false; // ERROR!!
  }
  if (m_pCachedSel.isnull()) {
    // ERROR!!
    return false;
  }
  
  return m_pCachedSel->isSelected(pAtom);
}

//////

bool SelNamesNode::matches(const LString &nam) const
{
  /*if (!m_regex.isEmpty()) {
    //
    // Matching with Regular expression 
    //
    qlib::LRegExpr rex;
    rex.setPattern(m_regex);

    // MB_DPRINTLN("sel regmatch: %s , %s", m_regex.c_str(), nam_uc.c_str());
#ifdef REXMATCH_ICASE
    return (rex.matchIgnoreCase(nam));
#else
    return (rex.match(nam));
#endif
  }
  else {*/

  //
  // Matching with plain string list
  //
  std::list<elem_type>::const_iterator iter = m_list.begin();
  std::list<elem_type>::const_iterator endi = m_list.end();

  if (nam.isEmpty()) {
    for ( ; iter!=endi; iter++) {
      if (iter->first.isEmpty()) {
	MB_DPRINTLN("matched empty string");
	return true;
      }
    }
    return false;
  }

  for ( ; iter!=endi; iter++) {
    if (iter->second==SNN_QSTR||iter->second==SNN_DQSTR) {
      // quoted string mode
      if ( nam.equals(iter->first) )
	return true;
    }
    else if (iter->second==SNN_REGEX) {
      // regexp-match mode
      qlib::LRegExpr rex;
      rex.setPattern(iter->first);
      MB_DPRINTLN("sel regmatch: %s , %s", iter->first.c_str(), nam.c_str());

#ifdef REXMATCH_ICASE
      if (rex.matchIgnoreCase(nam))
	return true;
#else
      if (rex.match(nam))
	return true;
#endif

    }
    else {
      // plain string mode
#ifdef STRMATCH_ICASE
      if ( nam.equalsIgnoreCase(iter->first) )
	return true;
#else
      if ( nam.equals(iter->first) )
	return true;
#endif
    }
  }
  //}

  return false;
}

bool SelNamesNode::altConfMatches(const LString &aName, char altconf) const
{
  LString nam = aName + ":";
  if (altconf)
    nam += altconf;

  std::list<elem_type>::const_iterator iter = m_list.begin();
  std::list<elem_type>::const_iterator endi = m_list.end();
  
  for ( ; iter!=endi; iter++) {
    if (iter->first.indexOf(':')<0) {
      // sel without altconf never matches
      continue;
    }
    // selection contains altconf specifier
    if ( nam.equalsIgnoreCase(iter->first) )
      return true;
  }
  return false;
}

/*
/// check '<-->* conversion
bool SelNamesNode::primeMatches(const LString &aName) const
{
  LString nam = aName;

  int nrepl = nam.replace('*', '\'');
  if (nrepl==0)
    return false;

  std::list<LString>::const_iterator iter = m_list.begin();
  std::list<LString>::const_iterator endi = m_list.end();
  
  for ( ; iter!=endi; iter++) {
    if ( nam.equalsIgnoreCase(*iter) )
      return true;
  }

  return false;
}
*/

/// Atom selection check
bool SelNamesNode::isAtomSelected(const LString &aName, char altconf) const
{
  if (matches(aName))
    return true;

  // check prime<->aster conversion
  LString pmnam = aName;
  int nrepl = pmnam.replace('*', '\'');
  if (nrepl!=0) {
    if (matches(aName))
      return true;
  }

  // check altconf
  if (altConfMatches(aName, altconf))
    return true;

  return false;
}

void SelNamesNode::dump() const
{
  /*
    if (!m_regex.isEmpty()) {
    MB_DPRINT("re/%s/", m_regex.c_str());
  }
  else {
  */

  //MB_DPRINT("size=%d,", m_list.size());
  std::list<elem_type>::const_iterator iter = m_list.begin();
  for ( ; iter!=m_list.end(); iter++) {
    LString name = iter->first;
    if (iter!=m_list.begin()) {
      MB_DPRINT(",");
    }
    MB_DPRINT("%s(%d)", name.c_str(), iter->second);
  }
  //}
}

int SelNamesNode::getType() const
{
  return SELNODE_NAMES;
}

SelSuperNode *SelNamesNode::clone() const
{
  SelNamesNode *pret = MB_NEW SelNamesNode();
  // pret->m_regex = m_regex;

  std::list<elem_type>::const_iterator iter = m_list.begin();
  for ( ; iter!=m_list.end(); iter++) {
    elem_type name = *iter;
    pret->m_list.push_back(name);
  }

  return pret;
}

LString SelNamesNode::toString() const
{
  /*if (!m_regex.isEmpty()) {
    return LString::format("/%s/", m_regex.c_str());
  }
  else {*/

  LString rval;
  std::list<elem_type>::const_iterator iter = m_list.begin();
  for ( ; iter!=m_list.end(); iter++) {
    if (iter!=m_list.begin())
      rval += ",";

    const LString &str = iter->first;
    if (iter->second==SNN_QSTR) {
      rval += "'"+str+"'";
    }
    else if (iter->second==SNN_DQSTR) {
      rval += '"'+str+'"';
    }
    else if (iter->second==SNN_REGEX) {
      rval += '/'+str+'/';
    }
    else {
      if (str.isEmpty())
	rval += "(empty)";
      else
	rval += str;
    }
  }
  return rval;

  //  }

}

//////

void SelRangesNode::dump() const
{
  /*if (m_list.isEmpty()) {
    MB_DPRINT("%s", m_insres.c_str());
    return;
    }*/
  RangeSet<int>::const_iterator iter = m_list.begin();
  int n=0;
  for ( ;iter!=m_list.end(); ++iter ) {
    int nstart = iter->nstart, nend = iter->nend;
    if (n>0) {
      MB_DPRINT(",");
    }
    MB_DPRINT("%d:%d",nstart,nend);
  }
}

int SelRangesNode::getType() const
{
  return SELNODE_RANGES;
}

SelSuperNode *SelRangesNode::clone() const
{
  return MB_NEW SelRangesNode(*this);
}

SelRangesNode::SelRangesNode(const SelRangesNode &src)
  : m_list(src.m_list) //, m_insres(src.m_insres)
{
}

LString SelRangesNode::toString() const
{
  /*if (m_list.isEmpty()) {
    return m_insres;
    }*/

  return qlib::rangeToString(m_list);
}

//////

SelResidNode::SelResidNode(int n1, char c1, int n2, char c2)
{
  append(n1, c1, n2, c2);
}

SelResidNode::SelResidNode(const SelResidNode &src)
  : m_list(src.m_list)
{
}

SelSuperNode *SelResidNode::clone() const
{
  return MB_NEW SelResidNode(*this);
}

int SelResidNode::getType() const
{
  return SELNODE_RESID;
}

void SelResidNode::append(int n1, char c1, int n2, char c2)
{
  ResidIndex r1, r2;

  if (n1<n2) {
    r1.first = n1;
    r1.second = c1;
    
    r2.first = n2;
    r2.second = c2+1;
  }
  else {
    r1.first = n2;
    r1.second = c2;
    
    r2.first = n1;
    r2.second = c1+1;
  }

  m_list.append(r1, r2);
}

void SelResidNode::dump() const
{
  MB_DPRINTLN("%s", toString().c_str());
}

LString SelResidNode::toString() const
{
  const RangeSet<ResidIndex> &range = m_list;
  LString rval;

  RangeSet<ResidIndex>::const_iterator ebegin = range.begin();
  RangeSet<ResidIndex>::const_iterator eend = range.end();
  RangeSet<ResidIndex>::const_iterator eiter = ebegin;
  for (; eiter!=eend; ++eiter) {
    if (eiter!=ebegin)
      rval += ",";
    
    int nstart = eiter->nstart.first, nend = eiter->nend.first;
    char cstart = eiter->nstart.second, cend = eiter->nend.second-1;

    if (!cstart)
      rval += LString::format("%d", nstart);
    else
      rval += LString::format("%d%c", nstart, cstart);

    if (nstart==nend && cstart==cend) {
      // single selection node
    }
    else {
      // range selection node
      rval += ":";
      if (!cend)
        rval += LString::format("%d", nend);
      else
        rval += LString::format("%d%c", nend, cend);
    }
  }
  
  return rval;
}


bool SelResidNode::isResidSelected(ResidIndex ind) const
{
  const RangeSet<ResidIndex> &rngs = getRangeSet();
  return rngs.contains(ind);
}

//////

SelTermNode::~SelTermNode()
{
  if (m_pn!=NULL)
    delete m_pn;
  if (m_pr!=NULL)
    delete m_pr;
  if (m_pr2!=NULL)
    delete m_pr2;
}

SelSuperNode *SelTermNode::clone() const
{
  SelTermNode *pret = MB_NEW SelTermNode();

  if (m_pn!=NULL)
    pret->m_pn = (SelNamesNode *) m_pn->clone();
  if (m_pr!=NULL)
    pret->m_pr = (SelRangesNode *) m_pr->clone();
  if (m_pr2!=NULL)
    pret->m_pr2 = (SelResidNode *) m_pr2->clone();

  pret->m_nmode = m_nmode;

  return pret;
}

int SelTermNode::getType() const
{
  return SELNODE_TERM;
}

LString SelTermNode::toString() const
{
  LString keyw;
  switch (m_nmode) {
  case ELEMENT: {
    keyw = "elem";
    break;
  }
  case ATOMNAME: {
    keyw = "name";
    break;
  }
  case RESIDNAME: {
    keyw = "resn";
    break;
  }
  case RESIDRANGE: {
    keyw = "resi";
    break;
  }
  case CHAINNAME: {
    keyw = "chain";
    break;
  }
  case AIDRANGE: {
    keyw = "aid";
    break;
  }
  case ALTCONF_NAME: {
    keyw = "alt";
    break;
  }
  default: {
    keyw = "<unknown>";
    break;
  }
  }

  LString rr;
  if (m_nmode==RESIDRANGE || m_nmode==AIDRANGE) {
    if (m_pr!=NULL) {
      rr = m_pr->toString();
    }
    else if (m_pr2!=NULL) {
      rr = m_pr2->toString();
    }
    else {
      MB_DPRINTLN("SelTermNode::toString() called for empty childnode!!");
      rr = "[?]";
    }
    return LString::format("%s %s", keyw.c_str(), rr.c_str());
  }

  if (m_pn==NULL) {
    MB_DPRINTLN("SelTermNode::toString() called for empty childnode!!");
    rr = "[?]";
  }
  else {
    rr = m_pn->toString();
  }
  return LString::format("%s %s", keyw.c_str(), rr.c_str());
}

bool SelTermNode::isSelected(MolAtomPtr pAtom)
{
  SelNamesNode *pd = getNamesNode();
  switch (getMode()) {
  case SelTermNode::ELEMENT: {
    MB_ASSERT(pd!=NULL);
    LString sym = pAtom->getElementName();
    return pd->matches(sym);
  }

  case SelTermNode::ATOMNAME: {
    MB_ASSERT(pd!=NULL);
    LString sym = pAtom->getName();
    return pd->isAtomSelected(sym, pAtom->getConfID());
  }

  case SelTermNode::ALTCONF_NAME: {
    MB_ASSERT(pd!=NULL);
    bool res;
    char cfid = pAtom->getConfID();
    if (cfid=='\0') {
      res = pd->matches("");
    }
    else {
      res = pd->matches(LString(cfid));
    }
    return res;
  }

  case SelTermNode::RESIDNAME: {
    MB_ASSERT(pd!=NULL);
    LString sym = pAtom->getResName();
    return pd->matches(sym);
  }

  case SelTermNode::CHAINNAME: {
    MB_ASSERT(pd!=NULL);
    LString sym = pAtom->getChainName();
    return pd->matches(sym);
  }

  case SelTermNode::RESIDRANGE: {
    SelResidNode *pr = getResidNode();
    MB_ASSERT(pr!=NULL);
    const ResidIndex &ind = pAtom->getResIndex();
    return pr->isResidSelected(ind);
    //return pr->getRangeSet().contains(ind,ind+1);
  }

  case SelTermNode::AIDRANGE: {
    SelRangesNode *pr = getRangesNode();
    MB_ASSERT(pr!=NULL);
    int ind = pAtom->getID();
    return pr->getRangeSet().contains(ind,ind+1);
  }

  default:
    MB_THROW(qlib::IllegalArgumentException, "Invalid code in SelTerm node");
    break;
  }
    
  return false;
}

//////

SelHierNode::~SelHierNode()
{
  if (m_pChains!=NULL)
    delete m_pChains;
  if (m_pResids!=NULL)
    delete m_pResids;
  if (m_pAtoms!=NULL)
    delete m_pAtoms;
}

int SelHierNode::getType() const
{
  return SELNODE_HIER;
}

SelSuperNode *SelHierNode::clone() const
{
  SelHierNode *pret = MB_NEW SelHierNode();
  
  if (m_pChains!=NULL)
    pret->m_pChains = (SelNamesNode *)m_pChains->clone();
  if (m_pResids!=NULL)
    pret->m_pResids = (SelResidNode *)m_pResids->clone();
  if (m_pAtoms!=NULL)
    pret->m_pAtoms = (SelNamesNode *)m_pAtoms->clone();

  return pret;
}

LString SelHierNode::toString() const
{
  LString sch, sri, sat;
  if (m_pChains!=NULL)
    sch = m_pChains->toString();
  else
    sch = "*";

  if (m_pResids!=NULL)
    sri = m_pResids->toString();
  else
    sri = "*";

  if (m_pAtoms!=NULL)
    sat = m_pAtoms->toString();
  else
    sat = "*";

  return sch+"."+sri+"."+sat;
}

bool SelHierNode::isSelected(MolAtomPtr pAtom)
{
  LString sym;

  // in all cases, null ptr means any values

  // Check chain term
  SelNamesNode *pCh = getChains();
  if (pCh!=NULL) {
    sym = pAtom->getChainName();
    if (!pCh->matches(sym))
      return false;
  }

  // check resid term
  SelResidNode *pRi = getResids();
  if (pRi!=NULL) {
    ResidIndex ind = pAtom->getResIndex();
    if ( !pRi->isResidSelected(ind) )
      return false;
  }

  // check aname term
  SelNamesNode *pAt = getAtoms();
  if (pAt!=NULL) {
    sym = pAtom->getName();
    if (!pAt->isAtomSelected(sym, pAtom->getConfID()))
      return false;
  }

  return true;
}

//////

SelCompNode::SelCompNode()
  : m_nmode(0), m_ncompop(0), m_dvalue(0.0)
{
}

SelCompNode::SelCompNode(const SelCompNode &r)
  : m_nmode(r.m_nmode), m_ncompop(r.m_ncompop), m_dvalue(r.m_dvalue)
{
}

SelCompNode::SelCompNode(int mode, int op, double dvalue)
  : m_nmode(mode), m_ncompop(op), m_dvalue(dvalue)
{
}

SelCompNode::~SelCompNode()
{
}

int SelCompNode::getType() const
{
  return SELNODE_COMP;
}

SelSuperNode *SelCompNode::clone() const
{
  return MB_NEW SelCompNode(*this);
}

LString SelCompNode::toString() const
{
  LString mode;
  if (m_nmode==COMP_BFAC)
    mode = "bfac";
  else
    mode = "occ";

  LString oper;
  if (m_ncompop==COMP_EQ)
    oper = "eq";
  else if (m_ncompop==COMP_GT)
    oper = "gt";
  else /*if (m_ncompop==COMP_GT)*/
    oper = "lt";

  return LString::format("%s %s %f", mode.c_str(), oper.c_str(), m_dvalue);
}

bool SelCompNode::isSelected(MolAtomPtr pAtom)
{
  double targ;

  if (m_nmode==COMP_BFAC)
    targ = pAtom->getBfac();
  else
    targ = pAtom->getOcc();
    
  double val = getValue();

  switch (getOp()) {
  case SelCompNode::COMP_EQ:
    return (targ==val);
  case SelCompNode::COMP_GT:
    return (targ>val);
  case SelCompNode::COMP_LT:
    return (targ<val);
  }

  return false;
}

//////

SelPropNode::SelPropNode()
  : m_nmode(0)
{
}

SelPropNode::SelPropNode(const SelPropNode &r)
  : m_nmode(r.m_nmode),
    m_propname(r.m_propname),
    m_propvalue(r.m_propvalue)
{
}

SelPropNode::SelPropNode(int mode, const char *name, const char *value)
  : m_nmode(mode),
    m_propname(name),
    m_propvalue(value)
{
}
  
SelPropNode::~SelPropNode()
{
}

int SelPropNode::getType() const
{
  return SELNODE_PROP;
}

SelSuperNode *SelPropNode::clone() const
{
  return MB_NEW SelPropNode(*this);
}

LString SelPropNode::toString() const
{
  LString mode;
  if (m_nmode==RPROP)
    mode = "rprop";
  else
    mode = "aprop";

  return LString::format("%s %s=%s", mode.c_str(), m_propname.c_str(), m_propvalue.c_str());
}

bool SelPropNode::isSelected(MolAtomPtr pAtom)
{
  if (getMode()==SelPropNode::APROP) {
    LOG_DPRINTLN("Warning: APROP not supported in current version!!");
    return false;
  }

  MolResiduePtr pres = pAtom->getParentResidue();
  if (pres.isnull()) {
    LOG_DPRINTLN("Warning: RPROP parent residue is NULL!!");
    return false;
  }

  LString value;
  if (m_propname.equals("type"))
    value = pres->getType();
  else if (!pres->getPropStr(m_propname, value))
    return false; // string property is not found
  
  return value.equals(getValue());
}

////////////////////////////////////////////////

#if 0

#include "IrInterp.hpp"
#include "IrHandle.hpp"

SelScriptNode::SelScriptNode()
     : m_pInterp(NULL), m_hSelProc(NULL)
{
	MB_ASSERT(false);
}

SelScriptNode::SelScriptNode(IrInterp *pin)
     : m_pInterp(pin), m_hSelProc(NULL)
{
}

SelScriptNode::SelScriptNode(IrInterp *pin, IrHandle *phscr)
{
  m_pInterp = pin;
  m_hSelProc = phscr;
  if (m_hSelProc!=NULL)
    m_pInterp->externAddRef(m_hSelProc);
}

SelScriptNode::SelScriptNode(const SelScriptNode &r)
{
  m_pInterp = r.m_pInterp;
  m_hSelProc = r.m_hSelProc;
  if (m_hSelProc!=NULL)
    m_pInterp->externAddRef(m_hSelProc);
}

SelScriptNode::~SelScriptNode()
{
  if (m_hSelProc!=NULL) {
    MB_ASSERT(m_pInterp!=NULL);
    m_pInterp->externRelease(m_hSelProc);
  }
}

int SelScriptNode::getType() const
{
  return SELNODE_SCRIPT;
}

SelSuperNode *SelScriptNode::clone() const
{
  return MB_NEW SelScriptNode(*this);
}

#endif

