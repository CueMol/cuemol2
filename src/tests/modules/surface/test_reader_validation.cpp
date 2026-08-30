//
// Input validation of the surface readers: corrupt files must be rejected
// with a FileFormatException instead of being stored and indexed later.
//

#include <gtest/gtest.h>
#include <common.h>

#include "surface/MSMSFileReader.hpp"
#include "surface/QdfSurfReader.hpp"
#include "surface/QdfSurfWriter.hpp"
#include "surface/OpenDXPotReader.hpp"
#include "surface/MolSurfObj.hpp"
#include "surface/ElePotMap.hpp"
#include "symm/PDBCryst1Handler.hpp"
#include "symm/symm.hpp"
#include "symm/CrystalInfo.hpp"
#include "symm/SymOpDB.hpp"
#include "molstr/MolCoord.hpp"

#include <qsys/QdfAbsWriter.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/PipeStream.hpp>
#include <qlib/StringStream.hpp>
#include <qlib/Vector4D.hpp>

#include <filesystem>
#include <fstream>
#include <string>

using qlib::LString;
using qlib::Vector4D;
using qlib::StrInStream;
using qsys::ObjectPtr;
using surface::MolSurfObj;

namespace {

std::string drainPipe(qlib::PipeStreamImpl &impl)
{
    std::string result;
    char buf[256];
    while (impl.ready()) {
        int n = impl.read(buf, 0, sizeof buf);
        if (n <= 0) break;
        result.append(buf, static_cast<size_t>(n));
    }
    return result;
}

// Serialize pObj with the given qdf writer and return the bytes.
std::string writeQdf(qsys::ObjWriter &writer, const ObjectPtr &pObj)
{
    auto impl = qlib::sp<qlib::PipeStreamImpl>(new qlib::PipeStreamImpl());
    qlib::PipeOutStream out;
    out.setImpl(impl);
    writer.attach(pObj);
    writer.write(out);
    writer.detach();
    impl->o_close();
    return drainPipe(*impl);
}

// A surface with three vertices and one face (id1, id2, id3).
ObjectPtr makeSurf(int id1, int id2, int id3)
{
    MolSurfObj *pSurf = new MolSurfObj();
    ObjectPtr pObj(pSurf);
    pSurf->setVertSize(3);
    pSurf->setVertex(0, Vector4D(0, 0, 0), Vector4D(0, 0, 1));
    pSurf->setVertex(1, Vector4D(1, 0, 0), Vector4D(0, 0, 1));
    pSurf->setVertex(2, Vector4D(0, 1, 0), Vector4D(0, 0, 1));
    pSurf->setFaceSize(1);
    pSurf->setFace(0, id1, id2, id3);
    return pObj;
}

// Writes "SRF1" whose vert records carry one float more than MSVert holds.
class OversizedVertQdfWriter : public qsys::QdfAbsWriter
{
public:
    bool write(qlib::OutStream &outs) override
    {
        start(outs);
        getStream().writeFileType("SRF1");

        defineData("vert", 1);
        for (const char *nm : {"x", "y", "z", "nx", "ny", "nz", "extra"})
            defineRecord(nm, QDF_TYPE_FLOAT32);
        defineRecord("id", QDF_TYPE_UTF8STR);
        startData();
        startRecord();
        for (const char *nm : {"x", "y", "z", "nx", "ny", "nz", "extra"})
            setRecValFloat32(nm, 1.0f);
        setRecValStr("id", LString());
        endRecord();
        endData();

        defineData("face", 1);
        defineRecord("id1", QDF_TYPE_INT32);
        defineRecord("id2", QDF_TYPE_INT32);
        defineRecord("id3", QDF_TYPE_INT32);
        startData();
        startRecord();
        setRecValInt32("id1", 0);
        setRecValInt32("id2", 0);
        setRecValInt32("id3", 0);
        endRecord();
        endData();

        end();
        return true;
    }
    const char *getName() const override { return "oversized_vert_qdf"; }
    const char *getTypeDescr() const override { return "test"; }
    const char *getFileExt() const override { return "*.qdf"; }
    bool canHandle(ObjectPtr) const override { return true; }
};

ObjectPtr readQdfSurf(const std::string &bytes)
{
    StrInStream ins(bytes.data(), static_cast<int>(bytes.size()));
    surface::QdfSurfReader reader;
    return reader.load(ins);
}

// MSMS reads the vertices from a side file named through the "vert" path.
struct TempVertFile
{
    std::filesystem::path path;
    explicit TempVertFile(const std::string &body)
        : path(std::filesystem::temp_directory_path() / "cuemol_reader_validation_test.vert")
    {
        std::ofstream ofs(path);
        ofs << body;
    }
    ~TempVertFile()
    {
        std::error_code ec;
        std::filesystem::remove(path, ec);
    }
};

const char *const MSMS_VERT =
    "# MSMS solvent excluded surface vertices\n"
    "#vertex #sphere density probe_r\n"
    "      3    3  1.00  1.50\n"
    "    0.000     0.000     0.000     0.000     0.000     1.000\n"
    "    1.000     0.000     0.000     0.000     0.000     1.000\n"
    "    0.000     1.000     0.000     0.000     0.000     1.000\n";

ObjectPtr readMSMS(const std::string &faceBody)
{
    TempVertFile vert(MSMS_VERT);
    surface::MSMSFileReader reader;
    reader.setPath("vert", LString(vert.path.string().c_str()));
    StrInStream ins(faceBody.data(), static_cast<int>(faceBody.size()));
    return reader.load(ins);
}

}  // namespace

// ----------------------------------------------------------------------
// MSMS face file
// ----------------------------------------------------------------------

TEST(MSMSFileReaderValidation, ValidFaceIsStoredZeroBased)
{
    ObjectPtr pObj = readMSMS(
        "# MSMS solvent excluded surface faces\n"
        "#faces  #sphere density probe_r\n"
        "      1    3  1.00  1.50\n"
        "     1      2      3\n");
    MolSurfObj *pSurf = dynamic_cast<MolSurfObj *>(pObj.get());
    ASSERT_NE(pSurf, nullptr);
    ASSERT_EQ(pSurf->getFaceSize(), 1);
    EXPECT_EQ(pSurf->getFaceAt(0).id1, 0u);
    EXPECT_EQ(pSurf->getFaceAt(0).id3, 2u);
}

TEST(MSMSFileReaderValidation, FaceIndexOutOfRangeIsRejected)
{
    // 9 > 3 vertices; the renderer would index the vertex array with it
    EXPECT_THROW(readMSMS(
        "# MSMS solvent excluded surface faces\n"
        "#faces  #sphere density probe_r\n"
        "      1    3  1.00  1.50\n"
        "     1      2      9\n"), qlib::FileFormatException);
    // 0 would become 0xFFFFFFFF after the 1-based conversion
    EXPECT_THROW(readMSMS(
        "# MSMS solvent excluded surface faces\n"
        "#faces  #sphere density probe_r\n"
        "      1    3  1.00  1.50\n"
        "     0      2      3\n"), qlib::FileFormatException);
}

// ----------------------------------------------------------------------
// QDF surface file
// ----------------------------------------------------------------------

TEST(QdfSurfReaderValidation, RoundTripKeepsFaces)
{
    surface::QdfSurfWriter writer;
    std::string bytes = writeQdf(writer, makeSurf(0, 1, 2));
    ObjectPtr pObj = readQdfSurf(bytes);
    MolSurfObj *pSurf = dynamic_cast<MolSurfObj *>(pObj.get());
    ASSERT_NE(pSurf, nullptr);
    ASSERT_EQ(pSurf->getVertSize(), 3);
    ASSERT_EQ(pSurf->getFaceSize(), 1);
    EXPECT_EQ(pSurf->getFaceAt(0).id2, 1u);
    EXPECT_FLOAT_EQ(pSurf->getVertAt(1).x, 1.0f);
}

TEST(QdfSurfReaderValidation, FaceIndexOutOfRangeIsRejected)
{
    surface::QdfSurfWriter writer;
    std::string bytes = writeQdf(writer, makeSurf(0, 1, 99));
    EXPECT_THROW(readQdfSurf(bytes), qlib::FileFormatException);
}

TEST(QdfSurfReaderValidation, VertRecordSizeMismatchIsRejected)
{
    // the fixed-record path copies the records straight into the MSVert
    // array; a different layout used to overrun it (only an assert in debug)
    OversizedVertQdfWriter writer;
    std::string bytes = writeQdf(writer, makeSurf(0, 1, 2));
    EXPECT_THROW(readQdfSurf(bytes), qlib::FileFormatException);
}

// ----------------------------------------------------------------------
// OpenDX potential map
// ----------------------------------------------------------------------

namespace {

std::string dxHeader(const char *counts)
{
    std::string s;
    s += "object 1 class gridpositions counts ";
    s += counts;
    s += "\norigin 0 0 0\ndelta 1 0 0\ndelta 0 1 0\ndelta 0 0 1\n";
    s += "object 2 class gridconnections counts ";
    s += counts;
    s += "\nobject 3 class array type double rank 0 items 1 data follows\n";
    return s;
}

ObjectPtr readDX(const std::string &body)
{
    StrInStream ins(body.data(), static_cast<int>(body.size()));
    surface::OpenDXPotReader reader;
    return reader.load(ins);
}

}  // namespace

TEST(OpenDXPotReaderValidation, ValidTinyMapLoads)
{
    ObjectPtr pObj = readDX(dxHeader("1 1 2") + "0.5 1.5\n");
    surface::ElePotMap *pMap = dynamic_cast<surface::ElePotMap *>(pObj.get());
    ASSERT_NE(pMap, nullptr);
    EXPECT_EQ(pMap->getColNo(), 1);
    EXPECT_EQ(pMap->getSecNo(), 2);
}

TEST(OpenDXPotReaderValidation, ZeroSizedMapIsRejected)
{
    EXPECT_THROW(readDX(dxHeader("0 0 0") + "\n"), qlib::FileFormatException);
}

TEST(OpenDXPotReaderValidation, OverflowingMapSizeIsRejected)
{
    // 1626^3 wraps to about 4M in int: the old code allocated that and then
    // wrote 4.3G values into it
    EXPECT_THROW(readDX(dxHeader("1626 1626 1626") + "0 0 0 0\n"),
                 qlib::FileFormatException);
}

// ----------------------------------------------------------------------
// CRYST1 writer with an unknown space group number
// ----------------------------------------------------------------------

TEST(PDBCryst1HandlerValidation, UnknownSpaceGroupSkipsTheRecord)
{
    // the pre-install sysconfig points the symop table at an install-only
    // path; use the source-tree copy next to sysconfig.xml
    std::filesystem::path symop =
        std::filesystem::path(CUEMOL2_SYSCONFIG_PATH).parent_path() / "symop.dat";
    symm::SymOpDB::getInstance()->setSymLibFile(LString(symop.string().c_str()));

    molstr::MolCoordPtr pMol(new molstr::MolCoord());
    symm::CrystalInfoPtr pci = pMol->getCreateExtData("CrystalInfo");
    ASSERT_FALSE(pci.isnull());
    pci->setCellDimension(10.0, 10.0, 10.0, 90.0, 90.0, 90.0);

    symm::PDBCryst1Handler handler;
    LString record;

    pci->setSG(1);  // P 1: the table is loaded and the record is written
    ASSERT_TRUE(handler.write(record, pMol.get()));
    EXPECT_TRUE(record.startsWith("CRYST1"));

    record = LString();
    pci->setSG(99999);  // writable from scripts; no such group
    EXPECT_FALSE(handler.write(record, pMol.get()));
    EXPECT_TRUE(record.isEmpty());
}
