// -*-Mode: C++;-*-
//
// Mmcif map reader
//

#include <common.h>

#include "MmcifMapReader.hpp"

#include <boost/math/special_functions/fpclassify.hpp>
#include <complex>
#include <modules/symm/CrystalInfo.hpp>
#include <modules/symm/SymOpDB.hpp>
#include <qlib/LineStream.hpp>

#include "CifParser.hpp"
#include "DensityMap.hpp"
#include "MTZ2MapReader.hpp"
#include "MapFFT.hpp"

namespace xtal {

MmcifMapReader::MmcifMapReader() : m_pMap(NULL), m_lineno(0)
{
    m_nSG = 0;
    m_grid = 0.33;
    m_mapr = -1.0;  // auto (calc from max F)
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

    CifParser parser(this);
    parser.read(lin);

    int nrefln = m_data.size();
    if (nrefln <= 0) {
        auto msg2 = LString("no reflections read");
        MB_THROW(qlib::FileFormatException, msg2);
        return false;
    }
    MB_DPRINTLN("CifMap> read %d reflns", nrefln);

    const int ncol = 5;
    qlib::Array<float> data(nrefln * ncol * sizeof(float));
    for (int i = 0; i < nrefln; ++i) {
        data[i * 5] = m_data[i].h;
        data[i * 5 + 1] = m_data[i].k;
        data[i * 5 + 2] = m_data[i].l;
        data[i * 5 + 3] = m_data[i].fwt;
        data[i * 5 + 4] = m_data[i].phwt;
    }

    MapFFT mapfft;
    mapfft.setTarget(m_pMap);
    mapfft.setParams(m_cella, m_cellb, m_cellc, m_alpha, m_beta, m_gamma, m_nSG, m_grid,
                     m_mapr);
    mapfft.setData(nrefln, ncol, data.data(), 0, 1, 2, 3, 4, -1);
    mapfft.doFFT();

    return true;
}

void MmcifMapReader::error(const LString &msg) const
{
    auto msg2 = msg + LString::format(", at line %d (%s)", m_lineno, m_recbuf.c_str());
    MB_THROW(qlib::FileFormatException, msg2);
}

void MmcifMapReader::warning(const LString &msg) const
{
    auto msg2 = msg + LString::format(", at line %d (%s)", m_lineno, m_recbuf.c_str());
    LOG_DPRINTLN("mmCIF> Warning: %s", msg2.c_str());
}

void MmcifMapReader::readDataItem(CifParser &parser)
{
    if (parser.getCatName().equals("_cell"))
        readCellLine(parser);
    else if (parser.getCatName().equals("_symmetry"))
        readSymmLine(parser);
    else if (parser.getCatName().equals("_refln"))
        readReflnLine(parser);
}

void MmcifMapReader::readCellLine(CifParser &parser)
{
    parser.setupLoopDefs();

    int nLenAID = parser.findDataItem("length_a");
    if (nLenAID < 0) {
        error("_cell.length_a not found in _cell");
        return;
    }

    int nLenBID = parser.findDataItem("length_b");
    if (nLenBID < 0) {
        error("_cell.length_b not found in _cell");
        return;
    }

    int nLenCID = parser.findDataItem("length_c");
    if (nLenCID < 0) {
        error("_cell.length_c not found in _cell");
        return;
    }

    int nAngAID = parser.findDataItem("angle_alpha");
    if (nAngAID < 0) {
        error("_cell.angle_alpha not found in _cell");
        return;
    }
    int nAngBID = parser.findDataItem("angle_beta");
    if (nAngBID < 0) {
        error("_cell.angle_beta not found in _cell");
        return;
    }
    int nAngGID = parser.findDataItem("angle_gamma");
    if (nAngGID < 0) {
        error("_cell.angle_gamma not found in _cell");
        return;
    }

    parser.setLoopDefsOK(true);

    if (!parser.tokenizeLine()) return;

    double len_a, len_b, len_c;
    double ang_a, ang_b, ang_g;

    if (!parser.getToken(nLenAID).toDouble(&len_a)) {
        warning("invalid mmCIF format");
        return;
    }
    if (!parser.getToken(nLenBID).toDouble(&len_b)) {
        warning("invalid mmCIF format");
        return;
    }
    if (!parser.getToken(nLenCID).toDouble(&len_c)) {
        warning("invalid mmCIF format");
        return;
    }

    if (!parser.getToken(nAngAID).toDouble(&ang_a)) {
        warning("invalid mmCIF format");
        return;
    }
    if (!parser.getToken(nAngBID).toDouble(&ang_b)) {
        warning("invalid mmCIF format");
        return;
    }
    if (!parser.getToken(nAngGID).toDouble(&ang_g)) {
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

    MB_DPRINT("CifMap> unit cell a=%.2fA, b=%.2fA, c=%.2fA,\n", m_cella, m_cellb,
              m_cellc);
    MB_DPRINT("CifMap>  alpha=%.2fdeg, beta=%.2fdeg, gamma=%.2fdeg,\n", m_alpha, m_beta,
              m_gamma);
}

void MmcifMapReader::readSymmLine(CifParser &parser)
{
    parser.setupLoopDefs();

    int nSgNameID = parser.findDataItem("space_group_name_H-M");
    int nSgID = parser.findDataItem("Int_Tables_number");

    parser.setLoopDefsOK(true);

    if (!parser.tokenizeLine()) return;

    LString sgname = parser.getToken(nSgNameID);
    int nSG;
    if (!parser.getToken(nSgID).toInt(&nSG)) {
        warning("Int_Tables_number not found");
        return;
    }

    // symm::CrystalInfoPtr pci = m_pMol->getCreateExtData("CrystalInfo");
    // pci->setSGByName(sgname);
    m_nSG = nSG;
    MB_DPRINTLN("CifMap> Space group no: %d", m_nSG);
}

void MmcifMapReader::readReflnLine(CifParser &parser)
{
    parser.setupLoopDefs();

    int nIndHID = parser.findDataItem("index_h");
    if (nIndHID < 0) {
        error("_refln.index_h not found");
        return;
    }
    int nIndKID = parser.findDataItem("index_k");
    if (nIndKID < 0) {
        error("_refln.index_k not found");
        return;
    }
    int nIndLID = parser.findDataItem("index_l");
    if (nIndLID < 0) {
        error("_refln.index_l not found");
        return;
    }
    int nFwtID = parser.findDataItem("pdbx_FWT");
    if (nFwtID < 0) {
        error("_refln.pdbx_FWT not found");
        return;
    }
    int nPhwtID = parser.findDataItem("pdbx_PHWT");
    if (nPhwtID < 0) {
        error("_refln.pdbx_PHWT not found");
        return;
    }

    parser.setLoopDefsOK(true);

    if (!parser.tokenizeLine()) return;

    int ind_h, ind_k, ind_l;
    double fwt, phwt;
    if (!parser.getToken(nIndHID).toInt(&ind_h)) {
        warning("cannot convert index_h to integer");
        return;
    }
    if (!parser.getToken(nIndKID).toInt(&ind_k)) {
        warning("cannot convert index_k to integer");
        return;
    }
    if (!parser.getToken(nIndLID).toInt(&ind_l)) {
        warning("cannot convert index_l to integer");
        return;
    }
    if (!parser.getToken(nFwtID).toDouble(&fwt)) {
        warning("cannot convert pdbx_FWT to double");
        return;
    }
    if (!parser.getToken(nPhwtID).toDouble(&phwt)) {
        warning("cannot convert pdbx_PHWT to double");
        return;
    }

    // MB_DPRINT("refln: %d %d %d, FWT=%.2f, PHWT=%.2f\n", ind_h, ind_k, ind_l, fwt,
    // phwt);

    m_data.push_back({ind_h, ind_k, ind_l, float(fwt), float(phwt)});
    return;
}

}  // namespace xtal
