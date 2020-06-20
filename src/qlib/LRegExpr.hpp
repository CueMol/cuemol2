// -*-Mode: C++;-*-
//
// LRegExpr.hpp
//   Regular expression class using PCRE
//
// $Id: LRegExpr.hpp,v 1.6 2009/08/27 08:42:07 rishitani Exp $

#ifndef L_REG_EXPR_HPP_INCLUDED_
#define L_REG_EXPR_HPP_INCLUDED_

#include "LExceptions.hpp"
#include "LScrObjects.hpp"
#include "LScrSmartPtr.hpp"
#include "SmartPtr.hpp"
#include "mcutils.hpp"
#include "qlib.hpp"

namespace qlib {

MB_DECL_EXCPT_CLASS(QLIB_API, InvalidREPatternException, RuntimeException);
MB_DECL_EXCPT_CLASS(QLIB_API, PatternMatchException, RuntimeException);
MB_DECL_EXCPT_CLASS(QLIB_API, SubstrNotFoundException, RuntimeException);

namespace detail {
struct ReData
{
public:
    bool m_bicase;
    void *m_pdata;
    void *m_pextra;
    ReData() : m_bicase(false), m_pdata(NULL), m_pextra(NULL) {}
    ~ReData();
};
}  // namespace detail

class QLIB_API LRegExpr : public LSimpleCopyScrObject
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    //////////
private:
    /** pattern string */
    LString m_pat;

    /** subject string */
    LString m_subj;

    //////////
private:
    /** internal data */
    sp<detail::ReData> m_pdat;

    /** result vector */
    std::vector<int> m_ovector;

    static const int OVECCOUNT = 60;

    int m_nSubstr;

public:
    LRegExpr() : m_pdat(), m_ovector(OVECCOUNT), m_nSubstr(0) {}

    LRegExpr(const LRegExpr &a)
        : m_pat(a.m_pat),
          m_subj(a.m_subj),
          m_pdat(a.m_pdat),
          m_ovector(a.m_ovector),
          m_nSubstr(a.m_nSubstr)
    {
    }

    LRegExpr(int nsize) : m_pdat(), m_ovector(nsize), m_nSubstr(0) {}

    LRegExpr(const LString &pattern)
        : m_pat(pattern), m_pdat(), m_ovector(OVECCOUNT), m_nSubstr(0)
    {
    }

    /** copy operator */
    const LRegExpr &operator=(const LRegExpr &a)
    {
        if (&a != this) {
            m_pat = (a.m_pat);
            m_subj = (a.m_subj);
            m_pdat = (a.m_pdat);
            m_ovector = (a.m_ovector);
            m_nSubstr = (a.m_nSubstr);
        }
        return *this;
    }

    virtual ~LRegExpr();

    void cleanup();

    const LString &getSubj() const
    {
        return m_subj;
    }

    void setPattern(const LString &pattern);
    const LString &getPattern() const
    {
        return m_pat;
    }

    bool match(const LString &subj)
    {
        return matchImpl(subj, false);
    }

    bool matchIgnoreCase(const LString &subj)
    {
        return matchImpl(subj, true);
    }

    int getSubstrCount() const
    {
        return m_nSubstr;
    }
    LString getSubstr(int index);
    LString getNamedSubstr(const LString &name);

    virtual bool isStrConv() const;
    virtual LString toString() const;

    typedef boost::true_type has_fromString;
    static LRegExpr *fromStringS(const LString &src);

private:
    bool matchImpl(const LString &pattern, bool bIcase);
};

}  // namespace qlib

#endif  // L_REG_EXPR_HPP_INCLUDED_
