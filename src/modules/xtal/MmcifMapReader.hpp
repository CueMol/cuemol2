// -*-Mode: C++;-*-
//
// mmCIF format macromolecule map reader class
//

#pragma once

#include <qlib/LExceptions.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/Matrix3D.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/mcutils.hpp>
#include <qsys/ObjReader.hpp>

#include "CifParser.hpp"
#include "xtal.hpp"

namespace qlib {
class LineStream;
}

// class MTZ2MapReader_wrap;

namespace xtal {

class DensityMap;

//
///   mmCIF map reader class
//
class XTAL_API MmcifMapReader : public qsys::ObjReader, CifParserClient
{
    MC_SCRIPTABLE;

public:
private:
    /// target map object
    DensityMap *m_pMap;

    /// Line input buffer
    LString m_recbuf;
    int m_lineno;

    /// Unit cell dimension parameters
    double m_cella, m_cellb, m_cellc;
    double m_alpha, m_beta, m_gamma;

    /// Space group no.
    int m_nSG;

public:
    //////////////////////////////////////////////
    // properties

public:
    MmcifMapReader();

    virtual ~MmcifMapReader();

    //////////////////////////////////////////////
    // Read/build methods

    ///
    /// Read from the input stream ins, and build the attached object.
    ///
    virtual bool read(qlib::InStream &ins);

    //////////////////////////////////////////////
    // Information query methods

    /// get the nickname of this reader (referred from script interface)
    virtual const char *getName() const;

    /// get file-type description
    virtual const char *getTypeDescr() const;

    /// get file extension
    virtual const char *getFileExt() const;

    /// create default object for this reader
    virtual qsys::ObjectPtr createDefaultObj() const;

    // virtual int isSupportedFile(const char *fname, qlib::InStream *pins);

    //////////////////////////////////////////////

    virtual void readDataItem(CifParser &parser);

private:
    /*
    bool readRecord(qlib::LineStream &ins);

    void readDataLine();

    void appendDataItem();

    void readLoopDataItem();

    int m_nState;

    LString m_strCatName;

    static const int MMCIF_INIT = 0;
    static const int MMCIF_DATA = 1;
    static const int MMCIF_LOOPDEF = 2;
    static const int MMCIF_LOOPDATA = 3;

    void resetLoopDef();

    std::deque<LString> m_loopDefs;
    std::list<LString> m_values;

    void emulateSingleDataLoop();

    bool m_bLoopDefsOK;

    std::vector<int> m_recStPos;
    std::vector<int> m_recEnPos;

    int findDataItem(const char *key) const
    {
        std::deque<LString>::const_iterator i = m_loopDefs.begin();
        std::deque<LString>::const_iterator iend = m_loopDefs.end();
        for (int j = 0; i != iend; ++i, ++j) {
            if (i->equals(key)) return j;
        }
        return -1;
    }

    static const int TOK_FIND_START = 0;
    static const int TOK_FIND_END = 1;
    static const int TOK_FIND_QUOTEND = 2;
    static const int TOK_FIND_DQUOTEND = 3;

    LString m_prevline;

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
    */
    void readCellLine(CifParser &parser);
    void readSymmLine(CifParser &parser);
    void readReflnLine(CifParser &parser);

    void error(const LString &msg) const;
    void warning(const LString &msg) const;
};

}  // namespace xtal
