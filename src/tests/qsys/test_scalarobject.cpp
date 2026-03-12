#include <gtest/gtest.h>
#include <common.h>
#include "qsys/ScalarObject.hpp"
#include <qlib/Vector4D.hpp>

using qlib::Vector4D;

namespace {

// Concrete ScalarObject: a uniform 4x4x4 grid with value 1.0
class UniformScalarObject : public qsys::ScalarObject {
public:
    // Grid dimensions
    int getColNo() const override { return 4; }
    int getRowNo() const override { return 4; }
    int getSecNo() const override { return 4; }

    int getStartCol() const override { return 0; }
    int getStartRow() const override { return 0; }
    int getStartSec() const override { return 0; }

    double getColGridSize() const override { return 1.0; }
    double getRowGridSize() const override { return 1.0; }
    double getSecGridSize() const override { return 1.0; }

    // Density stats for a uniform field with value 1.0
    double getMinDensity() const override { return 0.5; }
    double getMaxDensity() const override { return 1.5; }
    double getMeanDensity() const override { return 1.0; }
    double getRmsdDensity() const override { return 0.1; }

    double getLevelBase() const override { return 0.0; }
    double getLevelStep() const override { return 0.1; }

    // Geometry
    Vector4D getCenter() const override { return Vector4D(2.0, 2.0, 2.0); }
    Vector4D getOrigin() const override { return Vector4D(0.0, 0.0, 0.0); }

    // Value access
    double getValueAt(const Vector4D &) const override { return 1.0; }
    bool isInRange(const Vector4D &) const override { return true; }

    bool isInBoundary(int i, int j, int k) const override
    {
        return i >= 0 && i < 4 && j >= 0 && j < 4 && k >= 0 && k < 4;
    }
    unsigned char atByte(int, int, int) const override { return 128; }
    double atFloat(int, int, int) const override { return 1.0; }

    Vector4D convToOrth(const Vector4D &idx) const override { return idx; }
};

}  // namespace

TEST(ScalarObjectTest, GetHistogramJSONContainsHistoKey)
{
    UniformScalarObject obj;
    qlib::LString json = obj.getHistogramJSON(0.5, 1.5, 10);
    EXPECT_NE(strstr(json.c_str(), "histo"), nullptr);
}

TEST(ScalarObjectTest, GetHistogramJSONContainsMinMax)
{
    UniformScalarObject obj;
    qlib::LString json = obj.getHistogramJSON(0.5, 1.5, 10);
    EXPECT_NE(strstr(json.c_str(), "min"), nullptr);
    EXPECT_NE(strstr(json.c_str(), "max"), nullptr);
}

TEST(ScalarObjectTest, GetHistogramJSONDifferentNbins)
{
    UniformScalarObject obj;
    qlib::LString json5 = obj.getHistogramJSON(0.5, 1.5, 5);
    qlib::LString json20 = obj.getHistogramJSON(0.5, 1.5, 20);
    EXPECT_NE(strstr(json5.c_str(), "histo"), nullptr);
    EXPECT_NE(strstr(json20.c_str(), "histo"), nullptr);
}
