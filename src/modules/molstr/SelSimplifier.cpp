// -*-Mode: C++;-*-
//
// SelSimplifier: rewrite a compiled selection into an equivalent, shorter
// expression
//

#include <common.h>

#include "SelSimplifier.hpp"
#include "SelNodes.hpp"
#include "ResidIndex.hpp"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <memory>
#include <vector>

using namespace molstr;
using qlib::RangeSet;

namespace {

  struct Expr;
  typedef std::shared_ptr<Expr> ExprP;

  /// n-ary form of a selection tree
  struct Expr
  {
    enum Kind {
      ALL, NONE,
      AND, OR,
      NOT,
      /// unary operator other than not (around, byres, ...)
      UOP,
      /// elem / name / resn / chain / alt name list
      NAMES,
      /// aid ranges
      AID,
      /// resi ranges
      RESI,
      /// chain.resid.atom
      HIER,
      /// anything else, kept as text (named reference, bfac/occ, rprop)
      LEAF,
    };

    Kind kind;

    /// AND / OR: operands; NOT / UOP: kids[0]
    std::vector<ExprP> kids;

    /// UOP: SelOpNode::OP_*, distance and around target
    int op = 0;
    double value = 0.0;
    LString artarg;

    /// NAMES: SelTermNode mode and names
    int termMode = 0;
    SelNamesNode::list_t names;

    /// AID
    RangeSet<int> aids;

    /// RESI, and HIER when hasResids
    bool hasResids = false;
    RangeSet<ResidIndex> resids;

    /// HIER parts; a part that is absent stands for "*"
    bool hasChains = false;
    SelNamesNode::list_t chains;
    bool hasAtoms = false;
    SelNamesNode::list_t atoms;

    /// LEAF
    LString text;

    explicit Expr(Kind k) : kind(k) {}
  };

  ExprP mk(Expr::Kind k) { return std::make_shared<Expr>(k); }

  ExprP mkOp(Expr::Kind k, const std::vector<ExprP> &kids)
  {
    ExprP e = mk(k);
    e->kids = kids;
    return e;
  }

  ExprP mkNot(const ExprP &x) { return mkOp(Expr::NOT, {x}); }

  ExprP mkUop(int op, const ExprP &x, double value = 0.0, const LString &artarg = LString())
  {
    ExprP e = mkOp(Expr::UOP, {x});
    e->op = op;
    e->value = value;
    e->artarg = artarg;
    return e;
  }

  ////////////////////////////////////////////////////////////
  // text

  LString namesText(const SelNamesNode::list_t &names)
  {
    LString rval;
    bool first = true;
    for (const auto &elem : names) {
      if (!first)
        rval += ",";
      first = false;
      const LString &str = elem.first;
      switch (elem.second) {
      case SelNamesNode::SNN_QSTR:
        rval += "'" + str + "'";
        break;
      case SelNamesNode::SNN_DQSTR:
        rval += "\"" + str + "\"";
        break;
      case SelNamesNode::SNN_REGEX:
        rval += "/" + str + "/";
        break;
      default:
        rval += str.isEmpty() ? LString("null") : str;
        break;
      }
    }
    return rval;
  }

  LString residText(const RangeSet<ResidIndex> &range)
  {
    LString rval;
    for (auto iter = range.begin(); iter != range.end(); ++iter) {
      if (iter != range.begin())
        rval += ",";
      const int nstart = iter->nstart.first, nend = iter->nend.first;
      const char cstart = iter->nstart.second, cend = iter->nend.second - 1;
      rval += cstart ? LString::format("%d%c", nstart, cstart) : LString::format("%d", nstart);
      if (nstart == nend && cstart == cend)
        continue;
      rval += ":";
      rval += cend ? LString::format("%d%c", nend, cend) : LString::format("%d", nend);
    }
    return rval;
  }

  const char *termKeyword(int mode)
  {
    switch (mode) {
    case SelTermNode::ELEMENT: return "elem";
    case SelTermNode::ATOMNAME: return "name";
    case SelTermNode::RESIDNAME: return "resn";
    case SelTermNode::CHAINNAME: return "chain";
    case SelTermNode::ALTCONF_NAME: return "alt";
    default: return "<unknown>";
    }
  }

  const char *uopKeyword(int op)
  {
    switch (op) {
    case SelOpNode::OP_AROUND: return "around";
    case SelOpNode::OP_EXPAND: return "expand";
    case SelOpNode::OP_NEIGHBOR: return "neighbor";
    case SelOpNode::OP_EXTEND: return "extend";
    case SelOpNode::OP_BYRES: return "byres";
    case SelOpNode::OP_BYMAINCH: return "bymainch";
    case SelOpNode::OP_BYSIDECH: return "bysidech";
    default: return "<unknown>";
    }
  }

  bool isPrefixOp(int op)
  {
    return op == SelOpNode::OP_BYRES || op == SelOpNode::OP_BYMAINCH || op == SelOpNode::OP_BYSIDECH;
  }

  bool isCompound(const ExprP &e)
  {
    return e->kind == Expr::AND || e->kind == Expr::OR || e->kind == Expr::NOT || e->kind == Expr::UOP;
  }

  LString write(const ExprP &e);

  /// An operand, parenthesized unless it is a single term.
  LString operand(const ExprP &e)
  {
    return isCompound(e) ? "(" + write(e) + ")" : write(e);
  }

  LString write(const ExprP &e)
  {
    switch (e->kind) {
    case Expr::ALL:
      return "*";
    case Expr::NONE:
      return "none";
    case Expr::AND:
    case Expr::OR: {
      LString rval;
      const char *sep = e->kind == Expr::AND ? " and " : " or ";
      for (size_t i = 0; i < e->kids.size(); ++i) {
        if (i > 0)
          rval += sep;
        // "not X" binds tighter than and / or, so it needs no parentheses
        const ExprP &k = e->kids[i];
        rval += k->kind == Expr::NOT ? write(k) : operand(k);
      }
      return rval;
    }
    case Expr::NOT:
      return "not " + operand(e->kids[0]);
    case Expr::UOP: {
      if (isPrefixOp(e->op))
        return LString(uopKeyword(e->op)) + " " + operand(e->kids[0]);
      LString rval = "(" + write(e->kids[0]) + ") " + uopKeyword(e->op) + " " +
                     SelSimplifier::formatNumber(e->value);
      if (!e->artarg.isEmpty())
        rval += " [" + SelSimplifier::quoteName(e->artarg) + "]";
      return rval;
    }
    case Expr::NAMES:
      return LString(termKeyword(e->termMode)) + " " + namesText(e->names);
    case Expr::AID:
      return "aid " + qlib::rangeToString(e->aids);
    case Expr::RESI:
      return "resi " + residText(e->resids);
    case Expr::HIER:
      return (e->hasChains ? namesText(e->chains) : LString("*")) + "." +
             (e->hasResids ? residText(e->resids) : LString("*")) + "." +
             (e->hasAtoms ? namesText(e->atoms) : LString("*"));
    case Expr::LEAF:
      return e->text;
    }
    return LString();
  }

  ////////////////////////////////////////////////////////////
  // identity

  LString exactNumber(double v) { return LString::format("%a", v); }

  /// Names in a fixed order, each with its quoting mode.
  LString namesKey(const SelNamesNode::list_t &names)
  {
    std::vector<LString> keys;
    for (const auto &elem : names)
      keys.push_back(LString::format("%d/", elem.second) + elem.first);
    std::sort(keys.begin(), keys.end());
    LString rval;
    for (const auto &k : keys)
      rval += k + "\x1f";
    return rval;
  }

  /// Identity of a subtree: equal keys mean the same expression, whatever
  /// the order of the operands of and / or. Unlike the written text, no
  /// value is rounded.
  LString key(const ExprP &e)
  {
    switch (e->kind) {
    case Expr::ALL:
      return "*";
    case Expr::NONE:
      return "0";
    case Expr::AND:
    case Expr::OR: {
      std::vector<LString> keys;
      for (const auto &k : e->kids)
        keys.push_back(key(k));
      std::sort(keys.begin(), keys.end());
      LString rval = e->kind == Expr::AND ? "&(" : "|(";
      for (const auto &k : keys)
        rval += k + ";";
      return rval + ")";
    }
    case Expr::NOT:
      return "!(" + key(e->kids[0]) + ")";
    case Expr::UOP:
      return LString::format("u%d:", e->op) + exactNumber(e->value) + ":" + e->artarg + "(" +
             key(e->kids[0]) + ")";
    case Expr::NAMES:
      return LString::format("n%d:", e->termMode) + namesKey(e->names);
    case Expr::AID:
      return "a:" + qlib::rangeToString(e->aids);
    case Expr::RESI:
      return "r:" + residText(e->resids);
    case Expr::HIER:
      return "h:" + (e->hasChains ? namesKey(e->chains) : LString("*")) + "." +
             (e->hasResids ? residText(e->resids) : LString("*")) + "." +
             (e->hasAtoms ? namesKey(e->atoms) : LString("*"));
    case Expr::LEAF:
      return "l:" + e->text;
    }
    return LString();
  }

  /// Key of the complement of e.
  LString complementKey(const ExprP &e)
  {
    return e->kind == Expr::NOT ? key(e->kids[0]) : "!(" + key(e) + ")";
  }

  ////////////////////////////////////////////////////////////
  // reading the tree

  ExprP build(SelSuperNode *p)
  {
    if (p == NULL)
      return mk(Expr::NONE);

    switch (p->getType()) {
    case SelSuperNode::SELNODE_UOP: {
      SelOpNode *pn = static_cast<SelOpNode *>(p);
      ExprP kid = build(pn->getNode());
      if (pn->getMode() == SelOpNode::OP_NOT)
        return mkNot(kid);
      return mkUop(pn->getMode(), kid, pn->getValue(), pn->getAroundTarget());
    }
    case SelSuperNode::SELNODE_BINOP: {
      SelBinNode *pn = static_cast<SelBinNode *>(p);
      return mkOp(pn->getMode() == SelBinNode::OP_AND ? Expr::AND : Expr::OR,
                  {build(pn->getNode1()), build(pn->getNode2())});
    }
    case SelSuperNode::SELNODE_ALL:
      return mk(static_cast<SelAllNode *>(p)->isAll() ? Expr::ALL : Expr::NONE);
    case SelSuperNode::SELNODE_TERM: {
      SelTermNode *pn = static_cast<SelTermNode *>(p);
      if (pn->getMode() == SelTermNode::RESIDRANGE && pn->getResidNode() != NULL) {
        ExprP e = mk(Expr::RESI);
        e->hasResids = true;
        e->resids = pn->getResidNode()->getRangeSet();
        return e;
      }
      if (pn->getMode() == SelTermNode::AIDRANGE && pn->getRangesNode() != NULL) {
        ExprP e = mk(Expr::AID);
        e->aids = pn->getRangesNode()->getRangeSet();
        return e;
      }
      if (pn->getNamesNode() != NULL) {
        ExprP e = mk(Expr::NAMES);
        e->termMode = pn->getMode();
        e->names = pn->getNamesNode()->getList();
        return e;
      }
      break;
    }
    case SelSuperNode::SELNODE_HIER: {
      SelHierNode *pn = static_cast<SelHierNode *>(p);
      ExprP e = mk(Expr::HIER);
      if (pn->getChains() != NULL) {
        e->hasChains = true;
        e->chains = pn->getChains()->getList();
      }
      if (pn->getResids() != NULL) {
        e->hasResids = true;
        e->resids = pn->getResids()->getRangeSet();
      }
      if (pn->getAtoms() != NULL) {
        e->hasAtoms = true;
        e->atoms = pn->getAtoms()->getList();
      }
      return e;
    }
    default:
      break;
    }

    // named reference, bfac / occ, rprop: a leaf written by the node itself
    ExprP e = mk(Expr::LEAF);
    e->text = p->toString();
    return e;
  }

  ////////////////////////////////////////////////////////////
  // rewriting

  /// Operands of e seen as the operands of an op-kind node.
  std::vector<ExprP> operandsAs(const ExprP &e, Expr::Kind kind)
  {
    if (e->kind == kind)
      return e->kids;
    return {e};
  }

  ExprP collapse(Expr::Kind kind, const std::vector<ExprP> &kids)
  {
    if (kids.empty())
      return mk(kind == Expr::AND ? Expr::ALL : Expr::NONE);
    if (kids.size() == 1)
      return kids[0];
    return mkOp(kind, kids);
  }

  void appendNames(SelNamesNode::list_t &to, const SelNamesNode::list_t &from)
  {
    for (const auto &elem : from) {
      if (std::find(to.begin(), to.end(), elem) == to.end())
        to.push_back(elem);
    }
  }

  template <class T>
  void appendRanges(RangeSet<T> &to, const RangeSet<T> &from)
  {
    for (auto iter = from.begin(); iter != from.end(); ++iter)
      to.append(iter->nstart, iter->nend);
  }

  /// Rule 8: leaves of one kind under "or" become one leaf. Each name, aid
  /// or residue range matches on its own, so the union of the lists selects
  /// what the "or" of the leaves did. Residue ranges are joined as ranges
  /// of ResidIndex, never by adjacent numbers: 12:13 would also take 12A.
  std::vector<ExprP> mergeLeaves(const std::vector<ExprP> &kids)
  {
    std::vector<ExprP> out;
    for (const ExprP &k : kids) {
      ExprP into;
      for (const ExprP &o : out) {
        if (o->kind != k->kind)
          continue;
        if (k->kind == Expr::NAMES && o->termMode == k->termMode)
          into = o;
        else if (k->kind == Expr::AID || k->kind == Expr::RESI)
          into = o;
        else if (k->kind == Expr::HIER && o->hasChains == k->hasChains &&
                 o->hasAtoms == k->hasAtoms &&
                 (!k->hasChains || namesKey(o->chains) == namesKey(k->chains)) &&
                 (!k->hasAtoms || namesKey(o->atoms) == namesKey(k->atoms)))
          into = o;
        if (into)
          break;
      }
      if (!into) {
        // copy, so that merging never changes a subtree shared elsewhere
        out.push_back(std::make_shared<Expr>(*k));
        continue;
      }
      switch (k->kind) {
      case Expr::NAMES:
        appendNames(into->names, k->names);
        break;
      case Expr::AID:
        appendRanges(into->aids, k->aids);
        break;
      case Expr::RESI:
        appendRanges(into->resids, k->resids);
        break;
      case Expr::HIER:
        // an absent residue part is "*": the union is "*" too
        if (!into->hasResids || !k->hasResids) {
          into->hasResids = false;
          into->resids = RangeSet<ResidIndex>();
        }
        else {
          appendRanges(into->resids, k->resids);
        }
        break;
      default:
        break;
      }
    }
    return out;
  }

  ExprP simp(const ExprP &e);

  ExprP simpNary(const ExprP &e)
  {
    const Expr::Kind kind = e->kind;
    const Expr::Kind dual = kind == Expr::AND ? Expr::OR : Expr::AND;
    // the constant that decides the whole node, and the one that is neutral
    const Expr::Kind zero = kind == Expr::AND ? Expr::NONE : Expr::ALL;
    const Expr::Kind unit = kind == Expr::AND ? Expr::ALL : Expr::NONE;

    // rule 1: flatten; rule 2: constants
    std::vector<ExprP> kids;
    for (const ExprP &k0 : e->kids) {
      ExprP k = simp(k0);
      for (const ExprP &kk : operandsAs(k, kind)) {
        if (kk->kind == zero)
          return mk(zero);
        if (kk->kind != unit)
          kids.push_back(kk);
      }
    }

    // rule 3: duplicates
    {
      std::vector<ExprP> uniq;
      std::vector<LString> seen;
      for (const ExprP &k : kids) {
        LString kk = key(k);
        if (std::find(seen.begin(), seen.end(), kk) != seen.end())
          continue;
        seen.push_back(kk);
        uniq.push_back(k);
      }
      kids.swap(uniq);
    }

    // rule 4: complement
    {
      std::vector<LString> keys;
      for (const ExprP &k : kids)
        keys.push_back(key(k));
      for (const ExprP &k : kids) {
        if (std::find(keys.begin(), keys.end(), complementKey(k)) != keys.end())
          return mk(zero);
      }
    }

    // keys of the operands other than the i-th
    auto othersHave = [&kids](size_t i, const LString &kk) {
      for (size_t j = 0; j < kids.size(); ++j) {
        if (j != i && key(kids[j]) == kk)
          return true;
      }
      return false;
    };

    // rule 5: absorption, A or (A and B) -> A (and the dual)
    for (size_t i = 0; i < kids.size();) {
      bool absorbed = false;
      if (kids[i]->kind == dual) {
        for (const ExprP &f : kids[i]->kids) {
          if (othersHave(i, key(f))) {
            absorbed = true;
            break;
          }
        }
      }
      if (absorbed)
        kids.erase(kids.begin() + i);
      else
        ++i;
    }

    // rule 6: absorption with a complement, B or (A and not B) -> B or A
    // (and the dual)
    for (size_t i = 0; i < kids.size(); ++i) {
      if (kids[i]->kind != dual)
        continue;
      std::vector<ExprP> kept;
      for (const ExprP &f : kids[i]->kids) {
        if (!othersHave(i, complementKey(f)))
          kept.push_back(f);
      }
      if (kept.size() != kids[i]->kids.size())
        kids[i] = collapse(dual, kept);
    }

    // rule 7: (R and not S) or (R and S) -> R (and the dual)
    for (bool merged = true; merged;) {
      merged = false;
      for (size_t i = 0; i < kids.size() && !merged; ++i) {
        std::vector<ExprP> fi = operandsAs(kids[i], dual);
        for (size_t j = i + 1; j < kids.size() && !merged; ++j) {
          std::vector<ExprP> fj = operandsAs(kids[j], dual);
          if (fi.size() != fj.size())
            continue;
          // the factors of i not in j, and of j not in i
          std::vector<LString> kj;
          for (const ExprP &f : fj)
            kj.push_back(key(f));
          std::vector<ExprP> onlyI, common;
          for (const ExprP &f : fi) {
            auto it = std::find(kj.begin(), kj.end(), key(f));
            if (it == kj.end()) {
              onlyI.push_back(f);
            }
            else {
              common.push_back(f);
              kj.erase(it);
            }
          }
          if (onlyI.size() != 1 || kj.size() != 1 || !complementKey(onlyI[0]).equals(kj[0]))
            continue;
          kids[i] = collapse(dual, common);
          kids.erase(kids.begin() + j);
          merged = true;
        }
      }
    }

    // rule 8: leaves of one kind (under "or" only)
    if (kind == Expr::OR)
      kids = mergeLeaves(kids);

    return collapse(kind, kids);
  }

  ExprP simp(const ExprP &e)
  {
    switch (e->kind) {
    case Expr::NOT: {
      // rule 2
      ExprP k = simp(e->kids[0]);
      if (k->kind == Expr::NOT)
        return k->kids[0];
      if (k->kind == Expr::ALL)
        return mk(Expr::NONE);
      if (k->kind == Expr::NONE)
        return mk(Expr::ALL);
      return mkNot(k);
    }
    case Expr::UOP: {
      ExprP k = simp(e->kids[0]);
      // rule 9: byres / bymainch / bysidech of the same are idempotent
      if (isPrefixOp(e->op) && k->kind == Expr::UOP && k->op == e->op)
        return k;
      return mkUop(e->op, k, e->value, e->artarg);
    }
    case Expr::AND:
    case Expr::OR:
      return simpNary(e);
    default:
      return e;
    }
  }

  ExprP simplifyFully(ExprP e)
  {
    // every rule shortens the expression, so this ends; the bound is a guard
    for (int i = 0; i < 64; ++i) {
      const LString before = key(e);
      e = simp(e);
      if (key(e) == before)
        break;
    }
    return e;
  }

  ExprP applyEdit(const ExprP &root, int nEdit, double dist, bool bByres)
  {
    switch (nEdit) {
    case SelSimplifier::EDIT_INVERT:
      return mkNot(root);
    case SelSimplifier::EDIT_TOGGLE_SIDECH:
      if (root->kind == Expr::UOP && root->op == SelOpNode::OP_BYSIDECH)
        return root->kids[0];
      return mkUop(SelOpNode::OP_BYSIDECH, root);
    case SelSimplifier::EDIT_AROUND: {
      // replace an around already at the root (also under byres)
      ExprP base = root;
      if (base->kind == Expr::UOP && base->op == SelOpNode::OP_BYRES &&
          base->kids[0]->kind == Expr::UOP && base->kids[0]->op == SelOpNode::OP_AROUND)
        base = base->kids[0]->kids[0];
      else if (base->kind == Expr::UOP && base->op == SelOpNode::OP_AROUND)
        base = base->kids[0];
      ExprP around = mkUop(SelOpNode::OP_AROUND, base, dist);
      return bByres ? mkUop(SelOpNode::OP_BYRES, around) : around;
    }
    default:
      return root;
    }
  }

}  // namespace

LString SelSimplifier::rewrite(SelSuperNode *pRoot, int nEdit, double dist, bool bByres)
{
  if (pRoot == NULL)
    return LString();
  ExprP e = applyEdit(build(pRoot), nEdit, dist, bByres);
  return write(simplifyFully(e));
}

LString SelSimplifier::formatNumber(double value)
{
  // at least one decimal: the scanner reads a number without one as an int
  for (int prec = 1; prec <= 17; ++prec) {
    LString s = LString::format("%.*f", prec, value);
    if (std::strtod(s.c_str(), NULL) == value)
      return s;
  }
  return LString::format("%.17f", value);
}

LString SelSimplifier::quoteValue(const LString &value)
{
  // A value the scanner reads back as the same word is written bare (as it
  // was typed, mostly): a word starting with a letter or "_", or a small
  // integer. Anything else is quoted. The scanner keeps a backslash escape
  // as it is, so the quote used is one the value does not contain.
  const char *p = value.c_str();
  const int n = value.length();
  bool bWord = n > 0 && (std::isalpha((unsigned char)p[0]) || p[0] == '_');
  for (int i = 1; bWord && i < n; ++i) {
    const unsigned char c = (unsigned char)p[i];
    bWord = std::isalnum(c) || c == '_' || c == '\'' || c == '*';
  }
  if (bWord)
    return value;

  int i = (n > 0 && p[0] == '-') ? 1 : 0;
  const int ndig = n - i;
  bool bInt = ndig > 0 && ndig <= 9 && (p[i] != '0' || ndig == 1);
  for (; bInt && i < n; ++i)
    bInt = std::isdigit((unsigned char)p[i]);
  if (bInt)
    return value;

  if (value.indexOf('"') < 0)
    return "\"" + value + "\"";
  return "'" + value + "'";
}

LString SelSimplifier::quoteName(const LString &name)
{
  if (name.indexOf('"') < 0)
    return "\"" + name + "\"";
  return "'" + name + "'";
}
