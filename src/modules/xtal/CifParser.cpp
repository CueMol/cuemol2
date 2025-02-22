// -*-Mode: C++;-*-
//
// CIF parser
//

#include <common.h>

#include "CifParser.hpp"

#include <qlib/LineStream.hpp>
#include <qlib/LExceptions.hpp>

namespace xtal {

CifParser::CifParser(CifParserClient *pclient) : m_pClient(pclient)
{
    m_nState = CIF_INIT;
    m_lineno = 0;
    m_bLoopDefsOK = false;
}

CifParser::~CifParser() {}

void CifParser::error(const LString &msg) const
{
    LString msg2 =
        msg + LString::format(", cat <%s>, at line %d (%s)", m_strCatName.c_str(),
                              m_lineno, m_recbuf.c_str());
    MB_THROW(qlib::FileFormatException, msg2);
}

void CifParser::warning(const LString &msg) const
{
    LString msg2 =
        msg + LString::format(", cat <%s>, at line %d (%s)", m_strCatName.c_str(),
                              m_lineno, m_recbuf.c_str());
    LOG_DPRINTLN("mmCIF> Warning: %s", msg2.c_str());
}

bool CifParser::read(qlib::LineStream &lin)
{
    m_nState = CIF_INIT;

    for (;;) {
        if (!readRecord(lin)) break;

        // Skip empty lines
        if (m_recbuf.isEmpty()) continue;

        if (m_recbuf.startsWith("#")) continue;

        switch (m_nState) {
            case CIF_INIT:
                if (m_recbuf.startsWith("data_")) {
                    m_nState = CIF_DATA;
                }
                break;

            case CIF_DATA:
                if (m_recbuf.startsWith("_")) {
                    readDataLine();
                } else if (m_recbuf.startsWith("loop_")) {
                    // new data table begins (end of data line)
                    emulateSingleDataLoop();
                    m_nState = CIF_LOOPDEF;
                    resetLoopDef();
                }
                break;

            case CIF_LOOPDEF:
                if (m_recbuf.startsWith("_")) {
                    appendDataItem();
                } else {
                    m_nState = CIF_LOOPDATA;
                    readLoopDataItem();
                }
                break;

            case CIF_LOOPDATA:
                if (m_recbuf.startsWith("_")) {
                    // new data line begins (end of loop)
                    m_nState = CIF_DATA;
                    resetLoopDef();
                    readDataLine();
                } else if (m_recbuf.startsWith("loop_")) {
                    // new data table begins (end of loop)
                    m_nState = CIF_LOOPDEF;
                    resetLoopDef();
                } else {
                    readLoopDataItem();
                }
                break;
        }
    }

    return true;
}

bool CifParser::readRecord(qlib::LineStream &ins)
{
    LString str = ins.readLine();
    if (str.isEmpty()) return false;

    m_recbuf = str.chomp();
    MB_DPRINTLN("CifParser> readRecord: %s", m_recbuf.c_str());

    if (!m_prevline.isEmpty()) {
        if (m_recbuf.startsWith("loop_"))
            warning("Unexpected loop_ directive, data lost: \"" + m_prevline + "\"");
        else
            m_recbuf = m_prevline + " " + m_recbuf;
        m_prevline = "";
    }

    m_lineno = ins.getLineNo();
    return true;
}

void CifParser::readDataLine()
{
    MB_DPRINTLN("mmCIF> data line : %s", m_recbuf.c_str());

    // data line contains 2 elements (name and value)
    m_recStPos.resize(2);
    m_recEnPos.resize(2);

    tokenizeLine(false);

    LString name = getToken(0);
    LString value = "\'\'";
    if (isTokAvail(1)) value = getRawToken(1);

    int dotpos = name.indexOf('.');
    LString catname = name.substr(0, dotpos);
    LString item = name.substr(dotpos + 1);

    if (m_strCatName.equals(catname)) {
        // the same category name as the previous line
        m_loopDefs.push_back(item.trim());
        m_values.push_back(value);
    } else if (m_strCatName.isEmpty()) {
        // new category name in the file
        m_loopDefs.push_back(item.trim());
        m_values.push_back(value);
        m_strCatName = catname;
    } else {
        // new category line begins
        emulateSingleDataLoop();
        m_loopDefs.push_back(item.trim());
        m_values.push_back(value);
        m_strCatName = catname;
    }
}

void CifParser::emulateSingleDataLoop()
{
    m_recbuf = LString::join(" ", m_values);
    m_recbuf = m_recbuf.trim();
    m_values.clear();
    readLoopDataItem();
    resetLoopDef();
}

void CifParser::resetLoopDef()
{
    m_strCatName = "";
    m_loopDefs.clear();
    m_recStPos.clear();
    m_recEnPos.clear();
    m_bLoopDefsOK = false;
}

void CifParser::appendDataItem()
{
    MB_DPRINTLN("mmCIF> loop def : %s", m_recbuf.c_str());

    int dotpos = m_recbuf.indexOf('.');
    LString catname = m_recbuf.substr(0, dotpos);
    if (m_strCatName.isEmpty()) {
        m_strCatName = catname;
    } else if (!m_strCatName.equals(catname)) {
        // ERROR!!
        LString msg = LString::format(
            "invalid mmCIF format, catname mismatch (%s!=%s) in loopdef",
            m_strCatName.c_str(), catname.c_str());
        error(msg);
        return;
    }

    LString item = m_recbuf.substr(dotpos + 1);
    // remove white spaces
    m_loopDefs.push_back(item.trim());
}

bool CifParser::tokenizeLine(bool bChk)
{
    int nState = TOK_FIND_START;
    const int nsize = m_recbuf.length();
    const int nmaxtok = m_recStPos.size();
    int i, j;

    for (i = 0, j = 0; i < nsize && j < nmaxtok; ++i) {
        char c = m_recbuf.getAt(i);
        if (nState == TOK_FIND_START) {
            if (c != ' ') {
                if (c == '\'') {
                    m_recStPos[j] = i;
                    nState = TOK_FIND_QUOTEND;
                } else if (c == '\"') {
                    m_recStPos[j] = i;
                    nState = TOK_FIND_DQUOTEND;
                } else {
                    m_recStPos[j] = i;
                    nState = TOK_FIND_END;
                }
            }
        } else if (nState == TOK_FIND_END) {
            if (c == ' ') {
                m_recEnPos[j] = i;
                nState = TOK_FIND_START;
                ++j;
            }
        } else if (nState == TOK_FIND_QUOTEND) {
            if (c == '\'') {
                m_recEnPos[j] = i + 1;
                nState = TOK_FIND_START;
                ++j;
            }
        } else if (nState == TOK_FIND_DQUOTEND) {
            if (c == '\"') {
                m_recEnPos[j] = i + 1;
                nState = TOK_FIND_START;
                ++j;
            }
        }
    }

    if (nState == TOK_FIND_END) {
        m_recEnPos[j] = i;
        ++j;
    }

    if (!bChk) return true;

    int ndefs = m_loopDefs.size();
    if (j < ndefs) {
        // try concat with next line...
        // LOG_DPRINTLN("Cat: %s, num of token(%d) is smaller than defs(%d): <%s>",
        // m_strCatName.c_str(), j, ndefs, m_recbuf.c_str());
        m_prevline = m_recbuf;
        return false;
    }

    return true;
}

void CifParser::readLoopDataItem()
{
    m_pClient->readDataItem(*this);
}

}  // namespace xtal
