// -*-Mode: C++;-*-
//
// LRegExpr.hpp
//   Regular expression class using PCRE
//
// $Id: LRegExpr.cpp,v 1.4 2009/08/27 08:42:07 rishitani Exp $

#include <common.h>

#include "LRegExpr.hpp"

#include <pcre/pcre.h>

using qlib::LRegExpr;
using qlib::LString;
using qlib::detail::ReData;

ReData::~ReData()
{
    if (m_pdata != NULL) {
        // MB_DPRINTLN("PCRE data is freed");
        pcre_free_data((pcre *)m_pdata);
        m_pdata = NULL;
    }

    if (m_pextra != NULL) {
        pcre_free_extra((pcre_extra *)m_pextra);
        m_pextra = NULL;
    }
}

LRegExpr::~LRegExpr() {}

void LRegExpr::cleanup()
{
    if (!m_pdat.isnull()) m_pdat = sp<ReData>();
}

void LRegExpr::setPattern(const LString &pattern)
{
    cleanup();
    m_pat = pattern;
}

bool LRegExpr::matchImpl(const LString &subj, bool bIcase)
{
    int rc;

    if (!m_pdat.isnull()) {
        if (m_pdat->m_bicase != bIcase) m_pdat = sp<ReData>();
    }

    if (m_pdat.isnull()) {
        pcre *re;
        const char *error;
        int erroffset;
        int options = 0;
        if (bIcase) options |= PCRE_CASELESS;
        re = pcre_compile(m_pat, options, &error, &erroffset, NULL);
        if (re == NULL) {
            LString msg = LString::format("RE compilation failed at offset %d: %s",
                                          erroffset, error);
            LOG_DPRINTLN(msg);
            MB_THROW(qlib::InvalidREPatternException, msg);
            return false;
        }
        m_pdat = sp<ReData>(MB_NEW ReData);
        m_pdat->m_pdata = re;
        m_pdat->m_bicase = bIcase;
        // MB_DPRINTLN("RE /%s/ was compiled", m_pat.c_str());
    }

    m_subj = subj;
    pcre *re = (pcre *)(m_pdat->m_pdata);
    rc = pcre_exec(re,                /* the compiled pattern */
                   NULL,              /* no extra data - we didn't study the pattern */
                   subj.c_str(),      /* the subject string */
                   subj.length(),     /* the length of the subject */
                   0,                 /* start at offset 0 in the subject */
                   0,                 /* default options */
                   &m_ovector[0],     /* output vector for substring information */
                   m_ovector.size()); /* number of elements in the output vector */

    if (rc == PCRE_ERROR_NOMATCH) {
        m_nSubstr = 0;
        return false;
    }

    if (rc < 0) {
        LString msg = LString::format("Matching error %d", rc);
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::PatternMatchException, msg);
        return false;
    }

    // MB_DPRINTLN("Match succeeded at offset %d", m_ovector[0]);

    if (rc > 0)
        m_nSubstr = rc;
    else
        m_nSubstr = m_ovector.size() / 3;

    return true;
}

LString LRegExpr::getSubstr(int index)
{
    if (index < 0 || index >= m_nSubstr) {
        LString msg = LString::format("Invalid substring index: %d", index);
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::SubstrNotFoundException, msg);
        return LString();
    }

    int nstart = m_ovector[2 * index];
    int nsize = m_ovector[2 * index + 1] - m_ovector[2 * index];

    return m_subj.substr(nstart, nsize);
}

LString LRegExpr::getNamedSubstr(const LString &name)
{
    if (m_pdat.isnull()) {
        LString msg("Pattern matching haven't performed");
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::SubstrNotFoundException, msg);
        return LString();
    }

    pcre *re = (pcre *)(m_pdat->m_pdata);
    int ind = pcre_get_stringnumber(re, name.c_str());

    if (ind < 1 || ind > m_nSubstr) {
        LString msg = LString::format("Invalid substring name: %s", name.c_str());
        LOG_DPRINTLN(msg);
        MB_THROW(qlib::SubstrNotFoundException, msg);
        return LString();
    }

    return getSubstr(ind);
}

bool LRegExpr::isStrConv() const
{
    return true;
}

// static
LRegExpr *LRegExpr::fromStringS(const LString &src)
{
    return MB_NEW LRegExpr(src);
}

LString LRegExpr::toString() const
{
    return m_pat;
    // return "/"+m_pat+"/";
}
