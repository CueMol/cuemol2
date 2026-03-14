#include <gtest/gtest.h>
#include <common.h>
#include "qsys/QdfAbsWriter.hpp"

namespace {

class MinimalQdfWriter : public qsys::QdfAbsWriter {
public:
    bool write(qlib::OutStream &) override { return true; }
    const char *getName() const override { return "minimal_qdf"; }
    const char *getTypeDescr() const override { return "Minimal QDF writer"; }
    const char *getFileExt() const override { return "*.qdf"; }
    bool canHandle(qsys::ObjectPtr) const override { return false; }
};

}  // namespace

TEST(QdfAbsWriterTest, ConstructAndDestruct)
{
    MinimalQdfWriter w;
    // construction and destruction with m_pOut=NULL must not crash
}

TEST(QdfAbsWriterTest, SetVersion)
{
    MinimalQdfWriter w;
    w.setVersion(2);
    // no getter exposed; verify no crash
}

TEST(QdfAbsWriterTest, SetEncType)
{
    MinimalQdfWriter w;
    w.setEncType("00");
    w.setEncType("11");
    // verify no crash
}
