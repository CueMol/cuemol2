#include <gtest/gtest.h>
#include <common.h>
#include "qlib/ExpatInStream.hpp"
#include "qlib/StringStream.hpp"

#include <string>

using qlib::LString;

namespace {

class CountingExpat : public qlib::ExpatInStream
{
public:
    int nstart = 0;
    int nend = 0;

    explicit CountingExpat(qlib::InStream &ins) : qlib::ExpatInStream(ins) {}

    void startElement(const LString &, const Attributes &) override { ++nstart; }
    void endElement(const LString &) override { ++nend; }
};

}  // namespace

// ExpatInStream reads the input in 2048-byte chunks. A document that is
// exactly one chunk long fills the first read; the second read reports EOF
// (-1), which used to be handed to XML_Parse() as the chunk length.
TEST(ExpatInStream, DocumentOfExactlyOneChunkParses)
{
    // 6 + 500*4 + 35 + 7 = 2048 bytes
    std::string xml = "<root>";
    for (int i = 0; i < 500; ++i) xml += "<a/>";
    xml += "<!--" + std::string(28, 'x') + "-->";
    xml += "</root>";
    ASSERT_EQ(xml.size(), 2048u);

    qlib::StrInStream ins(xml.data(), static_cast<int>(xml.size()));
    CountingExpat parser(ins);
    EXPECT_NO_THROW(parser.parse());
    EXPECT_EQ(parser.nstart, 501);
    EXPECT_EQ(parser.nend, 501);
}
