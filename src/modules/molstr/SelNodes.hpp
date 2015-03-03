// -*-Mode: C++;-*-
//
// Parser's selection node classes
//
// $Id: SelNodes.hpp,v 1.19 2011/04/16 14:32:28 rishitani Exp $


#ifndef INTERP_SELECTION_NODES_H__
#define INTERP_SELECTION_NODES_H__

#include "molstr.hpp"
#include "Selection.hpp"

#include <qlib/LString.hpp>
#include <qlib/RangeSet.hpp>
#include <qlib/mcutils.hpp>

namespace molstr {

  using qlib::RangeSet;
  using qlib::LString;
  class IrInterp;
  class IrHandle;

  class SelSuperNode
  {
  public:
    enum {
      SELNODE_UOP,
      SELNODE_BINOP,
      SELNODE_ALL,
      SELNODE_TERM,
      SELNODE_COMP,
      SELNODE_PROP,
      SELNODE_HIER,
      SELNODE_NAMES,
      SELNODE_RANGES,
      SELNODE_SCRIPT,
      SELNODE_REF,
      SELNODE_RESID,
    };

    virtual ~SelSuperNode();

    virtual int getType() const =0;
    virtual SelSuperNode *clone() const =0;

    virtual LString toString() const =0;

    virtual bool isSelected(MolAtomPtr pAtom);
  };

  ///
  /// Unary operator node
  ///
  class SelOpNode : public SelSuperNode
  {
  private:

    SelSuperNode *m_p;

    int m_nmode;

    double m_dvalue;

    /// Target mol name of around op
    LString m_artarg;

  public:
    // /// cache data for selection evaluation
    //mutable LObject *m_pCacheData;

  public:
    enum { OP_NOT, OP_AROUND, OP_BYRES, OP_BYSIDECH, OP_BYMAINCH, OP_EXPAND, OP_NEIGHBOR, OP_EXTEND };

    /// default ctor
    SelOpNode()
      : m_p(NULL), m_nmode(OP_NOT), m_dvalue(0.0)
    {
    }

  private:
    /// copy ctor
    SelOpNode(const SelOpNode &arg)
      : m_p(arg.m_p), m_nmode(arg.m_nmode), m_dvalue(arg.m_dvalue), m_artarg(arg.m_artarg)
    {
    }

  public:
    /// specific ctor with opeator mode
    SelOpNode(SelSuperNode *p, int mode)
      : m_p(p), m_nmode(mode), m_dvalue(0.0)
    {
    }

    virtual ~SelOpNode();

    SelSuperNode *getNode() { return m_p; }
    int getMode() const { return m_nmode; }

    double getValue() const { return m_dvalue; }
    void setValue(double f) { m_dvalue = f; }

    LString getAroundTarget() const { return m_artarg; }
    void setAroundTarget(const char *s) { m_artarg = s; }

    virtual int getType() const;
    virtual SelSuperNode *clone() const;
    virtual LString toString() const;

    virtual bool isSelected(MolAtomPtr pAtom);

    //////////////////////
  private:
    /// OP_AROUND/OP_EXPAND implementation (in SelAroundImpl.cpp)
    bool chkAroundNode(MolAtomPtr patom, bool bExpn);
    
    bool chkByresNode(MolAtomPtr patom);
    bool chkMainSideChainNode(MolAtomPtr patom, bool);
  };

  /// Binary operator node
  class SelBinNode : public SelSuperNode
  {
  private:
    SelSuperNode *m_p1;

    SelSuperNode *m_p2;

    int m_nmode;

  public:
    enum { OP_AND, OP_OR };

    SelBinNode()
      : m_p1(NULL), m_p2(NULL), m_nmode(OP_AND)
    {
    }

    SelBinNode(SelSuperNode *p1, SelSuperNode *p2, int mode)
      : m_p1(p1), m_p2(p2), m_nmode(mode)
    {
    }

    virtual ~SelBinNode();

    SelSuperNode *getNode1() { return m_p1; }
    SelSuperNode *getNode2() { return m_p2; }
    int getMode() const { return m_nmode; }

    virtual int getType() const;
    virtual SelSuperNode *clone() const;
    virtual LString toString() const;

    virtual bool isSelected(MolAtomPtr pAtom);
  };

  /// All or none selection terminal node
  class SelAllNode : public SelSuperNode
  {
  private:
    //MCINFO: bool m_fall => all
    bool m_fall;

  public:
    SelAllNode(bool fall=true)
      : m_fall(fall)
    {
    }

    // ~SelAllNode() {}

    bool isAll() const { return m_fall; }
    bool isNone() const { return !m_fall; }

    virtual int getType() const;
    virtual SelSuperNode *clone() const;
    virtual LString toString() const;

    virtual bool isSelected(MolAtomPtr pAtom);
  };

  /// Macro reference terminal node
  class SelRefNode : public SelSuperNode
  {
  private:
    LString m_name;

    mutable SelectionPtr m_pCachedSel;

  public:
    SelRefNode()
    {
    }

    SelRefNode(const SelRefNode &arg)
      : m_name(arg.m_name)
    {
    }

    SelRefNode(const char *name)
      : m_name(name)
    {
    }

    // ~SelRefNode() {}

    void setName(const char *name);
    const LString &getName() const { return m_name; }

    virtual int getType() const;
    virtual SelSuperNode *clone() const;
    virtual LString toString() const;

    virtual bool isSelected(MolAtomPtr pAtom);

  private:
    bool resolveReference() const;
  };


  /**
     name-list construction node
  */
  class SelNamesNode : public SelSuperNode
  {
  private:
    typedef std::pair<LString,int> elem_type;
    typedef std::list<elem_type> list_t;

    list_t m_list;

    // LString m_regex;

  public:
    enum {
      SNN_STR,
      SNN_QSTR,
      SNN_DQSTR,
      SNN_REGEX,
    };

    SelNamesNode() {}
    SelNamesNode(const char *name) { append(name); }
    // ~SelNamesNode() {}

    void append(const char *name, int nmode = SNN_STR) {
      m_list.push_front(elem_type(LString(name), nmode));
    }

    void append_back(const char *name, int nmode = SNN_STR) {
      m_list.push_back(elem_type(LString(name), nmode));
    }

    LString pop_front() {
      LString ret = m_list.front().first;
      m_list.pop_front();
      return ret;
    }

    LString pop_back() {
      LString ret = m_list.back().first;
      m_list.pop_back();
      return ret;
    }

    // const std::list<LString> &getList() const { return m_list; }

    int size() const { return m_list.size(); }

    //////////

    /*
    void setRegEx(const char *name) {
      m_regex = name;
    }

    const LString &getRegEx() const {
      return m_regex;
    }
    */

    //////////

    /// simple textual match (including regexp)
    bool matches(const LString &nam) const;

    /// Atom selection check
    bool isAtomSelected(const LString &aName, char altconf) const;

    void dump() const;
    virtual int getType() const;
    virtual SelSuperNode *clone() const;

    virtual LString toString() const;
    // virtual bool isSelected(MolAtomPtr pAtom);

  private:
    /// check altconf specifier (for atom only)
    bool altConfMatches(const LString &aName, char altconf) const;

    // /// check '<-->* conversion (for atom only)
    // bool primeMatches(const LString &aName) const;

  };

  ///
  /// Numeric range list construction node
  ///
  class SelRangesNode : public SelSuperNode
  {
  private:
    /// Number ranges
    RangeSet<int> m_list;

  public:

    SelRangesNode() {}
    SelRangesNode(int n) { m_list.append(n,n+1); }
    SelRangesNode(int n1, int n2) { m_list.append(n1,n2+1); }
    SelRangesNode(const SelRangesNode &);

    ~SelRangesNode() {}

    void append(int n) { m_list.append(n,n+1); }

    void append(int nstart, int nend) {
      if (nstart<=nend)
        m_list.append(nstart, nend+1);
      else
        m_list.append(nend, nstart+1);
    }

    const RangeSet<int> &getRangeSet() const { return m_list; }

    void dump() const;

    virtual int getType() const;
    virtual SelSuperNode *clone() const;
    virtual LString toString() const;
  };

  ///
  /// Residue-index ranges
  ///
  class SelResidNode : public SelSuperNode
  {
  private:
    /// Number ranges
    RangeSet<ResidIndex> m_list;

  public:

    SelResidNode() {}
    SelResidNode(int n1, char c1, int n2, char c2);
    SelResidNode(const SelResidNode &);

    ~SelResidNode() {}

    void append(int n1, char c1, int n2, char c2);

    const RangeSet<ResidIndex> &getRangeSet() const { return m_list; }

    void dump() const;

    virtual int getType() const;
    virtual SelSuperNode *clone() const;
    virtual LString toString() const;

    bool isResidSelected(ResidIndex ind) const;

  };

  ///
  /// Hierarchical selection node
  ///
  class SelHierNode : public SelSuperNode
  {
  private:
    SelNamesNode *m_pChains;
    SelResidNode *m_pResids;
    SelNamesNode *m_pAtoms;
    
  public:
    SelHierNode()
      : m_pChains(NULL), m_pResids(NULL), m_pAtoms(NULL)
    {
    }
    
    SelHierNode(SelNamesNode *pCh, SelResidNode *pRi, SelNamesNode *pAt)
      : m_pChains(pCh), m_pResids(pRi), m_pAtoms(pAt)
    {
    }
    
    virtual ~SelHierNode();
    
    SelNamesNode *getChains() { return m_pChains; }
    SelResidNode *getResids() { return m_pResids; }
    SelNamesNode *getAtoms() { return m_pAtoms; }
    
    virtual int getType() const;
    virtual SelSuperNode *clone() const;
    virtual LString toString() const;
    virtual bool isSelected(MolAtomPtr pAtom);
  };


  /**
     terminal node
  */
  class SelTermNode : public SelSuperNode
  {
  private:
    SelNamesNode *m_pn;

    SelRangesNode *m_pr;

    SelResidNode *m_pr2;

    int m_nmode;

  public:
    enum {
      ELEMENT,
      ATOMNAME,
      RESIDNAME,
      RESIDRANGE,
      CHAINNAME,
      AIDRANGE,
      ALTCONF_NAME
    };

    SelTermNode()
      : m_pn(NULL), m_pr(NULL), m_pr2(NULL), m_nmode(ELEMENT)
    {
    }
    
    /*
    SelTermNode(const SelTermNode &arg)
         : m_pn(arg.m_pn), m_pr(arg.m_pr), m_pr2(arg.m_pr2), m_nmode(arg.m_nmode)
    {
    }
     */

    SelTermNode(SelNamesNode *p, int mode)
      : m_pn(p), m_pr(NULL), m_pr2(NULL), m_nmode(mode)
    {
    }

    SelTermNode(SelRangesNode *p, int mode)
      : m_pn(NULL), m_pr(p), m_pr2(NULL), m_nmode(mode)
    {
    }

    SelTermNode(SelResidNode *p, int mode)
      : m_pn(NULL), m_pr(NULL), m_pr2(p), m_nmode(mode)
    {
    }

    virtual ~SelTermNode();

    SelRangesNode *getRangesNode() { return m_pr; }
    SelResidNode *getResidNode() { return m_pr2; }
    SelNamesNode *getNamesNode() { return m_pn; }
    int getMode() const { return m_nmode; }

    virtual int getType() const;
    virtual SelSuperNode *clone() const;
    virtual LString toString() const;

    virtual bool isSelected(MolAtomPtr pAtom);
  };

  /**
     bfac/occ comparison node
  */
  class SelCompNode : public SelSuperNode
  {
  private:
    int m_nmode;

    int m_ncompop;

    double m_dvalue;

  public:
    enum { COMP_BFAC, COMP_OCC,
	   COMP_EQ, COMP_GT, COMP_LT};

    SelCompNode();
    SelCompNode(const SelCompNode &);
    SelCompNode(int mode, int op, double dvalue);
    virtual ~SelCompNode();

    int getMode() const { return m_nmode; }
    int getOp() const { return m_ncompop; }
    double getValue() const { return m_dvalue; }

    virtual int getType() const;
    virtual SelSuperNode *clone() const;

    virtual LString toString() const;
    virtual bool isSelected(MolAtomPtr pAtom);
  };

  /**
     property check node
  */
  //MCINFO: class qs::SelPropNode extends (qs::SelSuperNode)
  class SelPropNode : public SelSuperNode
  {
  private:
    int m_nmode;

    LString m_propname;

    LString m_propvalue;

  public:
    enum {
      RPROP=0,
      APROP=1
    };

    SelPropNode();
    SelPropNode(const SelPropNode &r);
    SelPropNode(int mode, const char *name, const char *value);
  
    virtual ~SelPropNode();

    int getMode() const { return m_nmode; }
    const LString &getName() const { return m_propname; }
    const LString &getValue() const { return m_propvalue; }

    virtual int getType() const;
    virtual SelSuperNode *clone() const;

    virtual LString toString() const;
    virtual bool isSelected(MolAtomPtr pAtom);
  };

#if 0
  /**
     Selection by QScript
  */
  //MCINFO: class qs::SelScriptNode extends (qs::SelSuperNode)
  class SelScriptNode : public SelSuperNode
  {
    //MCINFO: option dynamic
    MC_DYNCLASS;

    //MCINFO: option persistent
    MC_PERSCLASS;

  private:
    IrInterp *m_pInterp;
    IrHandle *m_hSelProc;


  public:
    SelScriptNode();
    SelScriptNode(IrInterp *);
    SelScriptNode(const SelScriptNode &r);
    SelScriptNode(IrInterp *, IrHandle *phscr);
  
    virtual ~SelScriptNode();

    IrHandle *getScript() const { return m_hSelProc; }

    virtual int getType() const;
    virtual SelSuperNode *clone() const;
    virtual bool isSelected(MolAtomPtr pAtom);
  };
#endif

}

#endif // INTERP_SELECTION_NODES_H__
