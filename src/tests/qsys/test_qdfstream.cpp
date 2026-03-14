#include <gtest/gtest.h>
#include <common.h>
#include "qsys/QdfStream.hpp"
#include <qlib/StringStream.hpp>

using namespace qsys;
using qlib::LString;

// --- QdfDataType::getSize ---

TEST(QdfDataTypeTest, GetSizeFloat32)
{
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_FLOAT32), (int)sizeof(qfloat32));
}

TEST(QdfDataTypeTest, GetSizeFloat64)
{
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_FLOAT64), (int)sizeof(qfloat64));
}

TEST(QdfDataTypeTest, GetSizeInt32)
{
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_INT32), (int)sizeof(qint32));
}

TEST(QdfDataTypeTest, GetSizeUInt32)
{
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_UINT32), (int)sizeof(qint32));
}

TEST(QdfDataTypeTest, GetSizeInt8)
{
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_INT8), (int)sizeof(qint8));
}

TEST(QdfDataTypeTest, GetSizeUInt8)
{
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_UINT8), (int)sizeof(qint8));
}

TEST(QdfDataTypeTest, GetSizeVec3)
{
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_VEC3), (int)(sizeof(qfloat32) * 3));
}

TEST(QdfDataTypeTest, GetSizeVec4)
{
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_VEC4), (int)(sizeof(qfloat32) * 4));
}

TEST(QdfDataTypeTest, GetSizeRGB)
{
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_RGB), (int)(sizeof(quint8) * 3));
}

TEST(QdfDataTypeTest, GetSizeRGBA)
{
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_RGBA), (int)(sizeof(quint8) * 4));
}

TEST(QdfDataTypeTest, GetSizeUTF8STRInFixedMode)
{
    // fixed=true: returns sizeof(qint32) as a length field placeholder
    EXPECT_EQ(QdfDataType::getSize(QdfDataType::QDF_TYPE_UTF8STR, true), (int)sizeof(qint32));
}

// --- QdfDataType::createVerString ---

TEST(QdfDataTypeTest, CreateVerStringVer0)
{
    EXPECT_EQ(QdfDataType::createVerString(0), LString("QDF0"));
}

TEST(QdfDataTypeTest, CreateVerStringVer1)
{
    EXPECT_EQ(QdfDataType::createVerString(1), LString("QDF1"));
}

TEST(QdfDataTypeTest, CreateVerStringVer0x10)
{
    // nver >= 0x10 uses "QD" prefix
    EXPECT_EQ(QdfDataType::createVerString(0x10), LString("QD10"));
}

TEST(QdfDataTypeTest, CreateVerStringVer0x100)
{
    // nver >= 0x100 uses "Q" prefix
    EXPECT_EQ(QdfDataType::createVerString(0x100), LString("Q100"));
}

// --- QdfDataType::parseVerString ---

TEST(QdfDataTypeTest, ParseVerStringQDF0)
{
    EXPECT_EQ(QdfDataType::parseVerString("QDF0"), 0);
}

TEST(QdfDataTypeTest, ParseVerStringQDF1)
{
    EXPECT_EQ(QdfDataType::parseVerString("QDF1"), 1);
}

TEST(QdfDataTypeTest, ParseVerStringQD10)
{
    EXPECT_EQ(QdfDataType::parseVerString("QD10"), 0x10);
}

TEST(QdfDataTypeTest, ParseVerStringQ100)
{
    EXPECT_EQ(QdfDataType::parseVerString("Q100"), 0x100);
}

// createVerString and parseVerString are inverses of each other
TEST(QdfDataTypeTest, CreateParseRoundTrip)
{
    const int versions[] = {0, 1, 2, 0xf, 0x10, 0x11, 0xff};
    for (int v : versions) {
        EXPECT_EQ(QdfDataType::parseVerString(QdfDataType::createVerString(v)), v)
            << "round-trip failed for version " << v;
    }
}

// --- QdfOutStream / QdfInStream round-trip ---

TEST(QdfStreamTest, RoundTripInt32AndString)
{
    // Write
    qlib::StrOutStream sos;
    {
        QdfOutStream qos(sos);
        qos.setVersion(0);
        qos.start();
        qos.writeFileType("TEST");
        qos.defData("data", 1);
        qos.defInt32("ival");
        qos.defStr("sval");
        qos.startData();
        qos.startRecord();
        qos.writeInt32("ival", 42);
        qos.writeStr("sval", "hello");
        qos.endRecord();
        qos.endData();
        qos.end();
    }

    // Read back
    int nsize;
    char *buf = sos.getData(nsize);
    qlib::StrInStream sis(buf, nsize);
    {
        QdfInStream qis(sis);
        qis.start();
        EXPECT_EQ(qis.getFileType(), LString("TEST"));
        int nrec = qis.readDataDef("data");
        EXPECT_EQ(nrec, 1);
        qis.readRecordDef();
        qis.startRecord();
        qint32 ival = qis.readInt32("ival");
        LString sval = qis.readStr("sval");
        qis.endRecord();
        qis.end();
        EXPECT_EQ(ival, 42);
        EXPECT_EQ(sval, LString("hello"));
    }
}

TEST(QdfStreamTest, RoundTripFloat32)
{
    qlib::StrOutStream sos;
    {
        QdfOutStream qos(sos);
        qos.setVersion(0);
        qos.start();
        qos.writeFileType("FLT");
        qos.defData("fdata", 1);
        qos.defFloat32("fval");
        qos.startData();
        qos.startRecord();
        qos.writeFloat32("fval", 3.14f);
        qos.endRecord();
        qos.endData();
        qos.end();
    }

    int nsize;
    char *buf = sos.getData(nsize);
    qlib::StrInStream sis(buf, nsize);
    {
        QdfInStream qis(sis);
        qis.start();
        qis.readDataDef("fdata");
        qis.readRecordDef();
        qis.startRecord();
        qfloat32 fval = qis.readFloat32("fval");
        qis.endRecord();
        qis.end();
        EXPECT_NEAR(fval, 3.14f, 1e-5f);
    }
}
