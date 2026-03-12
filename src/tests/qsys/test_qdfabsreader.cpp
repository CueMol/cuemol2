#include <gtest/gtest.h>
#include <common.h>
#include "qsys/QdfAbsReader.hpp"

namespace {

class MinimalQdfReader : public qsys::QdfAbsReader {
public:
    bool read(qlib::InStream &) override { return true; }
    qsys::ObjectPtr createDefaultObj() const override { return qsys::ObjectPtr(); }
    const char *getName() const override { return "minimal_qdf"; }
    const char *getTypeDescr() const override { return "Minimal QDF reader"; }
    const char *getFileExt() const override { return "*.qdf"; }
};

}  // namespace

TEST(QdfAbsReaderTest, ConstructAndDestruct)
{
    MinimalQdfReader r;
    // construction and destruction with m_pQdfIn=NULL must not crash
}
