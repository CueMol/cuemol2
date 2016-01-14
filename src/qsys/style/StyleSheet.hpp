// -*-Mode: C++;-*-
//
// Style sheet class
//

#ifndef QSYS_STYLE_SHEET_HPP_INCLUDED
#define QSYS_STYLE_SHEET_HPP_INCLUDED

#include <qsys/qsys.hpp>

namespace qlib {
  class PrintStream;
  class InStream;
  class OutStream;
  class LDom2Node;
}

namespace qsys {

  using qlib::LString;
  using qlib::LDom2Node;

  ///
  /// Stylesheet implementation class
  ///
  class QSYS_API StyleSheet
  {
  private:
    typedef std::list<LString> data_t;

    /// List of names of styles
    data_t m_styl;

    /// scope of this style sheet
    qlib::uid_t m_nScopeID;

  public:
    StyleSheet() : m_nScopeID(qlib::invalid_uid) {}

    void setScopeID(qlib::uid_t id) { m_nScopeID = id; }

    void setStyleNames(const LString &s);

    LString getStyleNames() const;

    bool contains(const LString &name) const
    {
      return std::find(m_styl.begin(), m_styl.end(), name)!=m_styl.end();
    }

    bool append(const LString &name)
    {
      if (!m_styl.empty()) {
        data_t::iterator iter = std::find(m_styl.begin(), m_styl.end(), name);
        if (iter==m_styl.begin())
          return false;
        if (iter!=m_styl.end())
          m_styl.erase(iter);
      }
      m_styl.push_front(name);
      return true;
    }

    bool removeByRe(const LString &name);

    bool isEmpty() const {
      return m_styl.empty();
    }

    void applyStyle(qlib::LScriptable *pthat);

    LDom2Node *resolveStyleSheet(const LString &keyname);

    bool resolveStyleSheet2(const LString &keyname, qlib::LVariant &variant);

    static bool resolve3(const LString &keyname, qlib::LScrObjBase *pThat, qlib::LVariant &variant);

  private:
    void applyStyleHelper(const LString &parent_name, qlib::LScriptable *pthat);

    LDom2Node *resolveSSHelper(const LString &keyname, LDom2Node *pSty);

    // void applyStyle(const LString &name, qlib::LScriptable *pthat);
    //void applyStyleHelper(LDom2Node *pNode, qlib::LScriptable *pthat, bool bTopNode);
  };

}

#endif
