// -*-Mode: C++;-*-
//
// SelCommand : selection by construction
//
// $Id: SelCommand.cpp,v 1.15 2011/04/16 12:44:39 rishitani Exp $

#include <common.h>

#include "SelCommand.hpp"

#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "MolAtom.hpp"
#include "AtomIterator.hpp"
#include "SelCompiler.hpp"
#include "SelNodes.hpp"
#include "SelSimplifier.hpp"

#include <qsys/style/AutoStyleCtxt.hpp>

using namespace molstr;

bool Selection::isEmpty() const
{
  return false;
}

bool Selection::equals(Selection *pSel) const
{
  LString tmp = toString();

  if (pSel==NULL) {
    if (tmp.isEmpty())
      return true;
    else
      return false;
  }

  return (tmp.equals(pSel->toString()));
}

/////////////////////////////////////////////////////////////////
// constructors & destructor

SelCommand::SelCommand()
  : m_pSelRoot(NULL)
{
  //m_pCurClient = NULL;
}

SelCommand::SelCommand(const SelCommand &src)
{
  if (src.m_pSelRoot==NULL)
    m_pSelRoot = NULL;
  else
    m_pSelRoot = src.m_pSelRoot->clone();
  
  m_origcmd = src.m_origcmd;
  //m_pCurClient = NULL;
}

SelCommand::SelCommand(const LString &psz)
  : m_pSelRoot(NULL)
{
  if (psz.isEmpty()) return;
  bool res = compile(psz);
  if (!res) {
    // TO DO: error handling/throw exception
    MB_DPRINTLN("Cannot initialize SelCommand with %s", psz.c_str());
    return;
  }
  m_origcmd = psz;
}

SelCommand::SelCommand(SelSuperNode *pNode)
{
  m_pSelRoot = pNode->clone();
}

SelCommand::~SelCommand()
{
  if (m_pSelRoot!=NULL)
    delete m_pSelRoot;
}

/////////////////////////////////////////////////////////////////

bool SelCommand::compile(const LString &com, qlib::uid_t nCtxtID /*= qlib::invalid_uid*/)
{
  if (m_pSelRoot!=NULL)
    delete m_pSelRoot;
  m_pSelRoot = NULL;

  if (com.isEmpty())
    return true;

  SelSuperNode *pnode = NULL;

  // Enter new context
  qsys::AutoStyleCtxt ctxt(nCtxtID);
  SelCompiler::getInstance()->setErrorMsg("");
  pnode = SelCompiler::getInstance()->compile(com);
  m_errorMsg = SelCompiler::getInstance()->getErrorMsg();
  
  if (pnode==NULL) {
    return false;
  }

  m_pSelRoot = pnode;
  m_origcmd = com;
  //m_pCurClient = NULL;
  return true;
}

LString SelCommand::toString() const
{
  //LString ret;
  if (m_pSelRoot) {
    if (!m_origcmd.isEmpty())
      return m_origcmd;
    else
      return dumpNodes();
  }

  return LString("");
}

bool SelCommand::isStrConv() const
{
  return true;
}

bool SelCommand::isEmpty() const
{
  if (m_pSelRoot==NULL) return true;
  return false;
}

namespace {
  /// Scene a named reference in the tree was compiled in (the scope to
  /// compile a rewritten text in), or invalid_uid when there is none.
  qlib::uid_t refScope(SelSuperNode *p)
  {
    if (p == NULL)
      return qlib::invalid_uid;
    switch (p->getType()) {
    case SelSuperNode::SELNODE_REF:
      return static_cast<SelRefNode *>(p)->getTargSceneID();
    case SelSuperNode::SELNODE_UOP:
      return refScope(static_cast<SelOpNode *>(p)->getNode());
    case SelSuperNode::SELNODE_BINOP: {
      SelBinNode *pn = static_cast<SelBinNode *>(p);
      qlib::uid_t n = refScope(pn->getNode1());
      return n != qlib::invalid_uid ? n : refScope(pn->getNode2());
    }
    default:
      return qlib::invalid_uid;
    }
  }
}

LString SelCommand::rewriteChecked(int nEdit, double dist, bool bByres,
                                   const LString &fallback) const
{
  if (m_pSelRoot == NULL)
    return fallback;

  LString text;
  try {
    text = SelSimplifier::rewrite(m_pSelRoot, nEdit, dist, bByres);
  }
  catch (...) {
    LOG_DPRINTLN("SelCommand> simplify failed: %s", toString().c_str());
    return fallback;
  }

  // Use the text only if it compiles: a node written back wrongly must not
  // turn a valid selection into a broken one.
  SelCommand check;
  if (text.isEmpty() || !check.compile(text, refScope(m_pSelRoot))) {
    LOG_DPRINTLN("SelCommand> simplified text does not compile: %s", text.c_str());
    return fallback;
  }
  return text;
}

LString SelCommand::simplify() const
{
  return rewriteChecked(SelSimplifier::EDIT_NONE, 0.0, false, toString());
}

LString SelCommand::invertSimplified() const
{
  if (m_pSelRoot == NULL)
    return LString("*");
  return rewriteChecked(SelSimplifier::EDIT_INVERT, 0.0, false, "not (" + toString() + ")");
}

LString SelCommand::toggleSidechain() const
{
  return rewriteChecked(SelSimplifier::EDIT_TOGGLE_SIDECH, 0.0, false,
                        "bysidech (" + toString() + ")");
}

LString SelCommand::rewriteAround(double dist, bool bByres) const
{
  LString around = "(" + toString() + ") around " + SelSimplifier::formatNumber(dist);
  return rewriteChecked(SelSimplifier::EDIT_AROUND, dist, bByres,
                        bByres ? "byres (" + around + ")" : around);
}

LString SelCommand::dumpNodes() const
{
  if (m_pSelRoot)
    return m_pSelRoot->toString();

  return LString("(null)");
}

/////////////////////////////////////////////////////////////////

//static
Selection *Selection::fromStringS(const LString &src)
{
  if (!src.isEmpty()) {
    return MB_NEW SelCommand(src);
  }

  return MB_NEW SelCommand();
}


/////////////////////////////////////////////////////////////////

bool SelCommand::isSelected(MolAtomPtr patom)
{
  if (m_pSelRoot==NULL)
    return true;

  return m_pSelRoot->isSelected(patom);
}

int SelCommand::isSelectedMol(MolCoordPtr pmol)
{
  if (m_pSelRoot==NULL)
    return true;
  //if (!pobj->instanceOf<MolCoord>())
  //return SEL_NONE;
  //MolCoord *pmol = (MolCoord *)pobj;
  
  int nsel=0, npart=0, nchs=0;
  MolCoord::ChainIter iter = pmol->begin();
  for (; iter!=pmol->end(); ++iter) {
    MolChainPtr pCh = iter->second;
    const int nst = isSelectedChain(pCh);
    if (nst==SEL_ALL)
      nsel++;
    else if (nst==SEL_PART)
      npart++;
    nchs ++;
  }

  if (nsel==nchs)
    return SEL_ALL;
  else if (nsel==0 && npart==0)
    return SEL_NONE;
  else
    return SEL_PART;
}

int SelCommand::isSelectedChain(MolChainPtr pCh)
{
  if (m_pSelRoot==NULL)
    return true;

  MolChain::ResidCursor riter = pCh->begin();
  int nsel=0, npart=0, nresid=0;
  for ( ; riter!=pCh->end(); riter++) {
    MolResiduePtr pRes = *riter;
    if (pRes.isnull())
      continue;
      
    // SEL_PART is non-zero: it used to count as fully selected
    const int nst = isSelectedResid(pRes);
    if (nst==SEL_ALL)
      nsel++;
    else if (nst==SEL_PART)
      npart++;
    nresid++;
  }

  if (nsel==nresid)
    return SEL_ALL;
  else if (nsel==0 && npart==0)
    return SEL_NONE;
  else
    return SEL_PART;
}

int SelCommand::isSelectedResid(MolResiduePtr pRes)
{
  if (m_pSelRoot==NULL)
    return true;

  MolCoordPtr pmol = pRes->getParent();
  if (pmol.isnull()) {
    LOG_DPRINTLN("isSelectedResid: parent mol is NULL!!");
    return SEL_NONE;
  }

  MolResidue::AtomCursor iter = pRes->atomBegin();
  int nsel=0, natoms=0;

  // m_pCurClient = pRes->getParent();

  for ( ; iter!=pRes->atomEnd(); iter++) {
    MolAtomPtr pAtom = pmol->getAtom(iter->second);
    if (m_pSelRoot->isSelected(pAtom))
      nsel++;
    natoms++;
  }
  
  // m_pCurClient = NULL;

  if (nsel==natoms)
    return SEL_ALL;
  else if (nsel==0)
    return SEL_NONE;
  else
    return SEL_PART;
}

