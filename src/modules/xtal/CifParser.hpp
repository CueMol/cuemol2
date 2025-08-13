// -*-Mode: C++;-*-
//
// mmCIF format macromolecule structure reader class
//

#pragma once

#include "xtal.hpp"

namespace qlib {
class LineStream;
}

namespace xtal {

using qlib::LString;

class CifParser;

class XTAL_API CifParserClient
{
public:
    virtual void readDataItem(CifParser &) = 0;
};

class XTAL_API CifParser
{
private:
    /// Line input buffer
    LString m_recbuf;
    int m_lineno;

    CifParserClient *m_pClient;

public:
    CifParser(CifParserClient *pclient);

    virtual ~CifParser();

    bool read(qlib::LineStream &lin);

    LString getCatName() const
    {
        return m_strCatName;
    }

    bool isLoopDefsOK() const
    {
        return m_bLoopDefsOK;
    }
    void setLoopDefsOK(bool value)
    {
        m_bLoopDefsOK = value;
    }

    void setupLoopDefs()
    {
        m_recStPos.resize(m_loopDefs.size());
        m_recEnPos.resize(m_loopDefs.size());
    }

    int findDataItem(const char *key) const
    {
        std::deque<LString>::const_iterator i = m_loopDefs.begin();
        std::deque<LString>::const_iterator iend = m_loopDefs.end();
        for (int j = 0; i != iend; ++i, ++j) {
            if (i->equals(key)) return j;
        }
        return -1;
    }

    bool tokenizeLine(bool bChk = true);

    LString getToken(int n) const
    {
        LString tok = getRawToken(n);
        if (tok.length() <= 2) return tok;
        if (tok.getAt(0) == '\'')
            return tok.substr(1, tok.length() - 2);
        else if (tok.getAt(0) == '\"')
            return tok.substr(1, tok.length() - 2);
        else
            return tok;
    }

    LString getLine() const { return m_recbuf; }

private:
    bool readRecord(qlib::LineStream &ins);

    void readDataLine();

    void appendDataItem();

    void readLoopDataItem();

    int m_nState;

    LString m_strCatName;

    static const int CIF_INIT = 0;
    static const int CIF_DATA = 1;
    static const int CIF_LOOPDEF = 2;
    static const int CIF_LOOPDATA = 3;

    void resetLoopDef();

    std::deque<LString> m_loopDefs;
    std::list<LString> m_values;

    void emulateSingleDataLoop();

    bool m_bLoopDefsOK;

    std::vector<int> m_recStPos;
    std::vector<int> m_recEnPos;

    static const int TOK_FIND_START = 0;
    static const int TOK_FIND_END = 1;
    static const int TOK_FIND_QUOTEND = 2;
    static const int TOK_FIND_DQUOTEND = 3;

    LString m_prevline;

    bool isTokAvail(int n) const
    {
        if (n < 0 || n >= m_recStPos.size()) return false;
        int ist = m_recStPos[n];
        int ien = m_recEnPos[n];
        if (0 <= ist && ist <= m_recbuf.length() && 0 <= ien &&
            ien <= m_recbuf.length())
            return true;
        return false;
    }

    LString getRawToken(int n) const
    {
        if (!isTokAvail(n)) {
            error(LString::format("mmCIF data item (%d) not found", n));
            return LString();
        }
        int ist = m_recStPos[n];
        int ien = m_recEnPos[n];
        return m_recbuf.substr(ist, ien - ist);
    }

    void error(const LString &msg) const;
    void warning(const LString &msg) const;
};

}  // namespace xtal
