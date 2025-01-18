// -*-Mode: C++;-*-
//
// PDB coordinate reader
//

#include <common.h>

#include <boost/math/special_functions/fpclassify.hpp>
#include <complex>
#include <modules/symm/SymOpDB.hpp>
#include <qlib/LineStream.hpp>

#include "DensityMap.hpp"
#include "MTZ2MapReader.hpp"
#ifdef HAVE_FFTW3_H
#include <fftw3.h>
#endif

#include <modules/symm/CrystalInfo.hpp>
#include <modules/symm/SymOpDB.hpp>
#include <qlib/LineStream.hpp>

#include "MmcifMapReader.hpp"

using namespace xtal;

// Ignore anomalous scattering ( F(+)==F(-) )
#define HERMIT

MmcifMapReader::MmcifMapReader() : m_pMap(NULL), m_lineno(0), m_bLoopDefsOK(false)
{
    m_nSG = 0;
}

MmcifMapReader::~MmcifMapReader()
{
    MB_DPRINTLN("MmcifMapReader destructed (%p)", this);
}

/////////////

const char *MmcifMapReader::getName() const
{
    return "mmcifmap";
}

const char *MmcifMapReader::getTypeDescr() const
{
    return "mmCIF Map Coeff (*.cif;*.cif.gz)";
}

const char *MmcifMapReader::getFileExt() const
{
    return "*.cif; *.cif.gz";
}

qsys::ObjectPtr MmcifMapReader::createDefaultObj() const
{
    return qsys::ObjectPtr(new DensityMap());
}

/////////

bool MmcifMapReader::read(qlib::InStream &ins)
{
    m_pMap = getTarget<DensityMap>();
    if (m_pMap == NULL) return false;

    qlib::LineStream lin(ins);

    m_nState = MMCIF_INIT;

    for (;;) {
        if (!readRecord(lin)) break;

        // Skip empty lines
        if (m_recbuf.isEmpty()) continue;

        if (m_recbuf.startsWith("#")) continue;

        switch (m_nState) {
            case MMCIF_INIT:
                if (m_recbuf.startsWith("data_")) {
                    m_nState = MMCIF_DATA;
                }
                break;
            case MMCIF_DATA:
                if (m_recbuf.startsWith("_")) {
                    readDataLine();
                } else if (m_recbuf.startsWith("loop_")) {
                    // new data table begins (end of data line)
                    emulateSingleDataLoop();
                    m_nState = MMCIF_LOOPDEF;
                    resetLoopDef();
                }
                break;

            case MMCIF_LOOPDEF:
                if (m_recbuf.startsWith("_")) {
                    appendDataItem();
                } else {
                    m_nState = MMCIF_LOOPDATA;
                    readLoopDataItem();
                }
                break;

            case MMCIF_LOOPDATA:
                if (m_recbuf.startsWith("_")) {
                    // new data line begins (end of loop)
                    m_nState = MMCIF_DATA;
                    resetLoopDef();
                    readDataLine();
                } else if (m_recbuf.startsWith("loop_")) {
                    // new data table begins (end of loop)
                    m_nState = MMCIF_LOOPDEF;
                    resetLoopDef();
                } else {
                    readLoopDataItem();
                }
                break;
        }  // switch
    }

    return true;
}

void MmcifMapReader::error(const LString &msg) const
{
    LString msg2 =
        msg + LString::format(", cat <%s>, at line %d (%s)", m_strCatName.c_str(),
                              m_lineno, m_recbuf.c_str());
    MB_THROW(qlib::FileFormatException, msg2);
}

void MmcifMapReader::warning(const LString &msg) const
{
    LString msg2 =
        msg + LString::format(", cat <%s>, at line %d (%s)", m_strCatName.c_str(),
                              m_lineno, m_recbuf.c_str());
    LOG_DPRINTLN("mmCIF> Warning: %s", msg2.c_str());
}

bool MmcifMapReader::readRecord(qlib::LineStream &ins)
{
    LString str = ins.readLine();
    if (str.isEmpty()) return false;

    m_recbuf = str.chomp();

    if (!m_prevline.isEmpty()) {
        if (m_recbuf.startsWith("loop_"))
            warning("Unexpected loop_ directive, data lost: \"" + m_prevline + "\"");
        else
            m_recbuf = m_prevline + " " + m_recbuf;
        m_prevline = "";
    }

    // m_recbuf = m_recbuf.toUpperCase();
    m_lineno = ins.getLineNo();
    return true;
}

void MmcifMapReader::readDataLine()
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

void MmcifMapReader::emulateSingleDataLoop()
{
    m_recbuf = LString::join(" ", m_values);
    m_recbuf = m_recbuf.trim();
    m_values.clear();
    readLoopDataItem();
    resetLoopDef();
}

void MmcifMapReader::resetLoopDef()
{
    m_strCatName = "";
    m_loopDefs.clear();
    m_recStPos.clear();
    m_recEnPos.clear();
    m_bLoopDefsOK = false;
}

void MmcifMapReader::appendDataItem()
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

bool MmcifMapReader::tokenizeLine(bool bChk)
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

void MmcifMapReader::readLoopDataItem()
{
    // MB_DPRINTLN("mmCIF> loop line : %s", m_recbuf.c_str());

    // if (m_strCatName.equals("_atom_site"))
    //     readAtomLine();
    // else if (m_bLoadAnisoU && m_strCatName.equals("_atom_site_anisotrop"))
    //     readAnisoULine();
    // // else if (m_bLoadSecstr && m_strCatName.equals("_struct_conf"))
    // else if (m_strCatName.equals("_struct_conf"))
    //     readHelixLine();
    // // else if (m_bLoadSecstr && m_strCatName.equals("_struct_sheet_range"))
    // else if (m_strCatName.equals("_struct_sheet_range"))
    //     readSheetLine();
    // else if (m_strCatName.equals("_struct_conn"))
    //     readConnLine();

    if (m_strCatName.equals("_cell"))
        readCellLine();
    else if (m_strCatName.equals("_symmetry"))
        readSymmLine();
    else if (m_strCatName.equals("_refln"))
        readReflnLine();
}

void MmcifMapReader::readCellLine()
{
    m_recStPos.resize(m_loopDefs.size());
    m_recEnPos.resize(m_loopDefs.size());

    int nLenAID = findDataItem("length_a");
    if (nLenAID < 0) {
        error("_cell.length_a not found in _cell");
        return;
    }

    int nLenBID = findDataItem("length_b");
    if (nLenBID < 0) {
        error("_cell.length_b not found in _cell");
        return;
    }

    int nLenCID = findDataItem("length_c");
    if (nLenCID < 0) {
        error("_cell.length_c not found in _cell");
        return;
    }

    int nAngAID = findDataItem("angle_alpha");
    if (nAngAID < 0) {
        error("_cell.angle_alpha not found in _cell");
        return;
    }
    int nAngBID = findDataItem("angle_beta");
    if (nAngBID < 0) {
        error("_cell.angle_beta not found in _cell");
        return;
    }
    int nAngGID = findDataItem("angle_gamma");
    if (nAngGID < 0) {
        error("_cell.angle_gamma not found in _cell");
        return;
    }

    m_bLoopDefsOK = true;

    if (!tokenizeLine()) return;

    double len_a, len_b, len_c;
    double ang_a, ang_b, ang_g;

    if (!getToken(nLenAID).toDouble(&len_a)) {
        warning("invalid mmCIF format");
        return;
    }
    if (!getToken(nLenBID).toDouble(&len_b)) {
        warning("invalid mmCIF format");
        return;
    }
    if (!getToken(nLenCID).toDouble(&len_c)) {
        warning("invalid mmCIF format");
        return;
    }

    if (!getToken(nAngAID).toDouble(&ang_a)) {
        warning("invalid mmCIF format");
        return;
    }
    if (!getToken(nAngBID).toDouble(&ang_b)) {
        warning("invalid mmCIF format");
        return;
    }
    if (!getToken(nAngGID).toDouble(&ang_g)) {
        warning("invalid mmCIF format");
        return;
    }

    // symm::CrystalInfoPtr pci = m_pMol->getCreateExtData("CrystalInfo");
    // pci->setCellDimension(len_a, len_b, len_c, ang_a, ang_b, ang_g);
    m_cella = len_a;
    m_cellb = len_b;
    m_cellc = len_c;
    m_alpha = ang_a;
    m_beta = ang_b;
    m_gamma = ang_g;

    MB_DPRINT("  unit cell a=%.2fA, b=%.2fA, c=%.2fA,\n", m_cella, m_cellb, m_cellc);
    MB_DPRINT("            alpha=%.2fdeg, beta=%.2fdeg, gamma=%.2fdeg,\n", m_alpha,
              m_beta, m_gamma);
}

void MmcifMapReader::readSymmLine()
{
    m_recStPos.resize(m_loopDefs.size());
    m_recEnPos.resize(m_loopDefs.size());

    int nSgNameID = findDataItem("space_group_name_H-M");

    m_bLoopDefsOK = true;

    if (!tokenizeLine()) return;

    LString sgname = getToken(nSgNameID);

    // symm::CrystalInfoPtr pci = m_pMol->getCreateExtData("CrystalInfo");
    // pci->setSGByName(sgname);
}

void MmcifMapReader::readReflnLine()
{
    m_recStPos.resize(m_loopDefs.size());
    m_recEnPos.resize(m_loopDefs.size());
}
