//
// ElePotMap memory / arithmetic fixes and SymOpDB table parsing.
//

#include <gtest/gtest.h>
#include <common.h>

#include "surface/ElePotMap.hpp"
#include "symm/SymOpDB.hpp"

#include <qlib/LString.hpp>
#include <qlib/Vector4D.hpp>

#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

using qlib::LString;
using qlib::Vector4D;
using surface::ElePotMap;

namespace {

void setConstMap(ElePotMap &map, int n, float value)
{
    std::vector<float> buf(static_cast<size_t>(n) * n * n, value);
    map.setMapFloatArray(buf.data(), n, n, n, 1.0, 1.0, 1.0, Vector4D());
}

}  // namespace

// The map is allocated with scalar new but was freed with delete [] when a
// second array was set on the same object (the dtor uses delete).
TEST(ElePotMapFixes, SettingTheArrayTwiceKeepsTheHeapIntact)
{
    ElePotMap map;
    setConstMap(map, 2, 1.0f);
    setConstMap(map, 3, 2.0f);
    EXPECT_EQ(map.getColNo(), 3);
    EXPECT_FLOAT_EQ(map.atFloat(1, 1, 1), 2.0f);
}

// A constant map has no level range; atByte() divided by zero and cast the
// NaN to unsigned char.
TEST(ElePotMapFixes, ConstantMapMapsToByteZero)
{
    ElePotMap map;
    setConstMap(map, 2, 5.0f);
    EXPECT_DOUBLE_EQ(map.atFloat(0, 0, 0), 5.0);
    EXPECT_EQ(map.atByte(0, 0, 0), 0);
    EXPECT_EQ(map.atByte(1, 1, 1), 0);
}

// The box filter used the window [-m, m) but divided by 2m+1, so the result
// leaned to the low-index side.
TEST(ElePotMapFixes, SmoothingWindowIsSymmetric)
{
    ElePotMap map;
    std::vector<float> buf(7, 0.0f);
    buf[3] = 27.0f;  // impulse; three passes each divide by 3
    map.setMapFloatArray(buf.data(), 7, 1, 1, 1.0, 1.0, 1.0, Vector4D());
    map.smooth2(1.0);

    EXPECT_NEAR(map.atFloat(3, 0, 0), 1.0, 1e-5);
    EXPECT_NEAR(map.atFloat(2, 0, 0), 1.0, 1e-5);
    EXPECT_NEAR(map.atFloat(4, 0, 0), 1.0, 1e-5);
    EXPECT_NEAR(map.atFloat(1, 0, 0), 0.0, 1e-5);
    EXPECT_NEAR(map.atFloat(5, 0, 0), 0.0, 1e-5);
}

namespace {

struct TempSymopFile
{
    std::filesystem::path path;
    explicit TempSymopFile(const std::string &body)
        : path(std::filesystem::temp_directory_path() / "cuemol_symop_fixes_test.dat")
    {
        std::ofstream ofs(path);
        ofs << body;
    }
    ~TempSymopFile()
    {
        std::error_code ec;
        std::filesystem::remove(path, ec);
    }
};

const char *const IDENT_OP =
    "X,Y,Z\n"
    "1,0,0,0,1\n"
    "0,1,0,0,1\n"
    "0,0,1,0,1\n";

const char *const INV_OP =
    "-X,-Y,-Z\n"
    "-1,0,0,0,1\n"
    "0,-1,0,0,1\n"
    "0,0,-1,0,1\n";

}  // namespace

// A group that lists more operators than its ASU count wrote pOps[nasym];
// a second definition of the same number leaked a Group.
TEST(SymOpDBFixes, ExtraOperatorAndDuplicateGroupAreIgnored)
{
    std::string body;
    body += ">900,1,Q1,Q 1,TRICLINIC\n";
    body += IDENT_OP;
    body += "\n";
    body += INV_OP;  // one more than nasym=1
    body += "\n";
    body += ">900,2,QDUP,Q DUP,TRICLINIC\n";  // duplicate number
    body += IDENT_OP;
    body += "\n";
    body += INV_OP;
    body += "\n";
    body += ">901,1,Q2,Q 2,TRICLINIC\n";
    body += IDENT_OP;
    body += "\n";
    TempSymopFile f(body);

    symm::SymOpDB db;  // a private table: the singleton needs symm::init()
    symm::SymOpDB *pdb = &db;
    pdb->setSymLibFile(LString(f.path.string().c_str()));

    ASSERT_NE(pdb->getCName(900), nullptr);
    EXPECT_STREQ(pdb->getCName(900), "Q 1");
    EXPECT_EQ(pdb->getAsymNum(900), 1);
    ASSERT_NE(pdb->getCName(901), nullptr);
    EXPECT_STREQ(pdb->getCName(901), "Q 2");
    EXPECT_EQ(pdb->getCName(902), nullptr);
}
