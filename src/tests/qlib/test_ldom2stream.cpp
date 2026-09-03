#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LDOM2Tree.hpp"
#include "qlib/LDOM2Stream.hpp"
#include "qlib/PipeStream.hpp"

#include <string>

using qlib::LDom2Node;
using qlib::LDom2Tree;
using qlib::LDom2OutStream;
using qlib::LDom2InStream;
using qlib::PipeStreamImpl;
using qlib::PipeInStream;
using qlib::PipeOutStream;
using qlib::LString;

// ── Helpers ──────────────────────────────────────────────────────────────────

static std::string drainPipe(PipeStreamImpl &impl)
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

// Serialize a tree to XML string via PipeStreamImpl.
static std::string writeTree(LDom2Tree &tree)
{
    auto impl = qlib::sp<PipeStreamImpl>(new PipeStreamImpl());
    PipeOutStream raw_out;
    raw_out.setImpl(impl);
    LDom2OutStream out(raw_out);
    out.write(&tree);
    impl->o_close();
    return drainPipe(*impl);
}

// Parse an XML string into a tree via PipeStreamImpl.
// ChunkFilterImpl uses a 33-byte lookahead buffer, so the input must be longer
// than the END_OF_XML_MARKER (32 bytes + newline). Prepend the XML declaration
// to guarantee that without requiring each test to worry about length.
static void parseXML(const std::string &xml, LDom2Tree &tree)
{
    const std::string full = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" + xml;
    auto impl = qlib::sp<PipeStreamImpl>(new PipeStreamImpl());
    impl->write(full.c_str(), 0, static_cast<int>(full.size()));
    impl->o_close();
    PipeInStream raw_in;
    raw_in.setImpl(impl);
    LDom2InStream in(raw_in);
    in.read(tree);
}

// ── LDom2Tree ─────────────────────────────────────────────────────────────────

TEST(LDom2Tree, DefaultConstructTopNotNull)
{
    LDom2Tree tree;
    EXPECT_NE(tree.top(), nullptr);
    EXPECT_EQ(tree.current(), tree.top());
}

TEST(LDom2Tree, ConstructWithTopName)
{
    LDom2Tree tree("root");
    EXPECT_TRUE(tree.top()->getTagName().equals("root"));
    EXPECT_EQ(tree.top(), tree.current());
}

TEST(LDom2Tree, CopyConstructorDeepCopy)
{
    LDom2Tree orig("parent");
    orig.top()->setStrAttr("key", "value");

    LDom2Tree copy(orig);
    EXPECT_NE(copy.top(), orig.top());
    EXPECT_TRUE(copy.top()->getTagName().equals("parent"));
    EXPECT_TRUE(copy.top()->getStrAttr("key").equals("value"));
}

TEST(LDom2Tree, CopyIsIndependentOfOriginal)
{
    LDom2Tree orig("root");
    orig.top()->setStrAttr("k", "original");

    LDom2Tree copy(orig);
    copy.top()->setStrAttr("k", "modified");

    EXPECT_TRUE(orig.top()->getStrAttr("k").equals("original"));
    EXPECT_TRUE(copy.top()->getStrAttr("k").equals("modified"));
}

TEST(LDom2Tree, TraverseToChild)
{
    LDom2Tree tree("root");
    // appendChild() leaves m_cur_child pointing at the new node
    LDom2Node *child = tree.top()->appendChild("child");
    ASSERT_TRUE(tree.top()->hasMoreChild());

    tree.traverse();
    EXPECT_EQ(tree.current(), child);
}

TEST(LDom2Tree, PopNodeRestoresCurrent)
{
    LDom2Tree tree("root");
    tree.top()->appendChild("child");

    tree.traverse();
    EXPECT_NE(tree.current(), tree.top());

    tree.popNode();
    EXPECT_EQ(tree.current(), tree.top());
}

TEST(LDom2Tree, TraverseMultipleLevels)
{
    LDom2Tree tree("root");
    LDom2Node *child = tree.top()->appendChild("child");
    tree.traverse();

    LDom2Node *grandchild = child->appendChild("grandchild");
    tree.traverse();
    EXPECT_EQ(tree.current(), grandchild);

    tree.popNode();
    EXPECT_EQ(tree.current(), child);

    tree.popNode();
    EXPECT_EQ(tree.current(), tree.top());
}

TEST(LDom2Tree, TraverseNoChildThrows)
{
    LDom2Tree tree("root");
    // firstChild() must be called to initialize m_cur_child before hasMoreChild()
    tree.top()->firstChild();
    // No children → traverse should throw
    EXPECT_ANY_THROW(tree.traverse());
}

TEST(LDom2Tree, DetachReturnsTopNode)
{
    LDom2Tree tree("root");
    LDom2Node *pTop = tree.top();

    LDom2Node *detached = tree.detach();
    EXPECT_EQ(detached, pTop);
    delete detached;
}

// ── LDom2OutStream ────────────────────────────────────────────────────────────

TEST(LDom2OutStream, WriteXMLDeclaration)
{
    LDom2Tree tree("root");
    std::string xml = writeTree(tree);

    EXPECT_NE(xml.find("<?xml"), std::string::npos);
    EXPECT_NE(xml.find("utf-8"), std::string::npos);
}

TEST(LDom2OutStream, WriteTopTagName)
{
    LDom2Tree tree("scene");
    std::string xml = writeTree(tree);

    EXPECT_NE(xml.find("<scene"), std::string::npos);
}

TEST(LDom2OutStream, WriteEmptyNodeSelfClosingTag)
{
    LDom2Tree tree("empty");
    std::string xml = writeTree(tree);

    // No children, no value → self-closing tag; no separate end tag
    EXPECT_NE(xml.find("<empty/>"), std::string::npos);
    EXPECT_EQ(xml.find("</empty>"), std::string::npos);
}

TEST(LDom2OutStream, WriteStringAttribute)
{
    LDom2Tree tree("root");
    tree.top()->setStrAttr("name", "myobj");

    std::string xml = writeTree(tree);
    EXPECT_NE(xml.find("name=\"myobj\""), std::string::npos);
}

TEST(LDom2OutStream, WriteTypeAttribute)
{
    LDom2Tree tree("obj");
    tree.top()->setTypeName("MyClass");

    std::string xml = writeTree(tree);
    EXPECT_NE(xml.find("type=\"MyClass\""), std::string::npos);
}

TEST(LDom2OutStream, WriteValueAttribute)
{
    LDom2Tree tree("root");
    tree.top()->setValue("42");

    std::string xml = writeTree(tree);
    EXPECT_NE(xml.find("value=\"42\""), std::string::npos);
}

TEST(LDom2OutStream, WriteChildElement)
{
    LDom2Tree tree("root");
    LDom2Node *child = tree.top()->appendChild("child");
    child->setDefaultFlag(false);

    std::string xml = writeTree(tree);
    EXPECT_NE(xml.find("<child"), std::string::npos);
    EXPECT_NE(xml.find("</root>"), std::string::npos);
}

TEST(LDom2OutStream, DefaultChildSkipped)
{
    LDom2Tree tree("root");
    LDom2Node *child = tree.top()->appendChild("defaultprop");
    child->setDefaultFlag(true);

    std::string xml = writeTree(tree);
    EXPECT_EQ(xml.find("defaultprop"), std::string::npos);
}

TEST(LDom2OutStream, EscapeAmpersandInAttrValue)
{
    LDom2Tree tree("root");
    tree.top()->setStrAttr("data", "a&b");

    std::string xml = writeTree(tree);
    EXPECT_NE(xml.find("&amp;"), std::string::npos);
    EXPECT_EQ(xml.find("a&b"), std::string::npos);  // raw & must not appear
}

TEST(LDom2OutStream, EscapeLtGtInAttrValue)
{
    LDom2Tree tree("root");
    tree.top()->setStrAttr("data", "a<b>c");

    std::string xml = writeTree(tree);
    EXPECT_NE(xml.find("&lt;"), std::string::npos);
    EXPECT_NE(xml.find("&gt;"), std::string::npos);
}

TEST(LDom2OutStream, EscapeDoubleQuoteInAttrValue)
{
    LDom2Tree tree("root");
    tree.top()->setStrAttr("data", "say \"hello\"");

    std::string xml = writeTree(tree);
    EXPECT_NE(xml.find("&quot;"), std::string::npos);
}

TEST(LDom2OutStream, EscapeSingleQuoteInAttrValue)
{
    LDom2Tree tree("root");
    tree.top()->setStrAttr("data", "it's");

    std::string xml = writeTree(tree);
    EXPECT_NE(xml.find("&apos;"), std::string::npos);
}

TEST(LDom2OutStream, WriteContentsAsCDATA)
{
    LDom2Tree tree("root");
    tree.top()->setContents("raw content here");

    std::string xml = writeTree(tree);
    EXPECT_NE(xml.find("<![CDATA["), std::string::npos);
    EXPECT_NE(xml.find("raw content here"), std::string::npos);
    EXPECT_NE(xml.find("]]>"), std::string::npos);
}

TEST(LDom2OutStream, WriteMultipleAttributes)
{
    LDom2Tree tree("root");
    tree.top()->setStrAttr("a", "1");
    tree.top()->setStrAttr("b", "2");
    tree.top()->setStrAttr("c", "3");

    std::string xml = writeTree(tree);
    EXPECT_NE(xml.find("a=\"1\""), std::string::npos);
    EXPECT_NE(xml.find("b=\"2\""), std::string::npos);
    EXPECT_NE(xml.find("c=\"3\""), std::string::npos);
}

// ── LDom2InStream ────────────────────────────────────────────────────────────

TEST(LDom2InStream, ParseSimpleElement)
{
    LDom2Tree tree;
    parseXML("<root/>", tree);
    EXPECT_TRUE(tree.top()->getTagName().equals("root"));
}

TEST(LDom2InStream, ParseElementWithAttribute)
{
    LDom2Tree tree;
    parseXML("<root name=\"hello\"/>", tree);
    EXPECT_TRUE(tree.top()->getStrAttr("name").equals("hello"));
}

TEST(LDom2InStream, ParseValueAttribute)
{
    // "value" attr is stored via setValue(), not as a string-attr child
    LDom2Tree tree;
    parseXML("<root value=\"123\"/>", tree);
    EXPECT_TRUE(tree.top()->getValue().equals("123"));
}

TEST(LDom2InStream, ParseTypeAttribute)
{
    // "type" attr is stored both in typeName and in strAttr
    LDom2Tree tree;
    parseXML("<obj type=\"MyType\"/>", tree);
    EXPECT_TRUE(tree.top()->getTypeName().equals("MyType"));
    EXPECT_TRUE(tree.top()->getStrAttr("type").equals("MyType"));
}

TEST(LDom2InStream, ParseChildElements)
{
    LDom2Tree tree;
    parseXML("<root><a value=\"1\"/><b value=\"2\"/></root>", tree);

    EXPECT_EQ(tree.top()->getChildCount(), 2);
    ASSERT_NE(tree.top()->findChild("a"), nullptr);
    ASSERT_NE(tree.top()->findChild("b"), nullptr);
}

TEST(LDom2InStream, ParseNestedChildren)
{
    LDom2Tree tree;
    parseXML("<root><parent><child value=\"deep\"/></parent></root>", tree);

    LDom2Node *parent = tree.top()->findChild("parent");
    ASSERT_NE(parent, nullptr);
    LDom2Node *child = parent->findChild("child");
    ASSERT_NE(child, nullptr);
    EXPECT_TRUE(child->getValue().equals("deep"));
}

TEST(LDom2InStream, ParseChildValueAttribute)
{
    LDom2Tree tree;
    parseXML("<root><child value=\"hello\"/></root>", tree);

    LDom2Node *child = tree.top()->findChild("child");
    ASSERT_NE(child, nullptr);
    EXPECT_TRUE(child->getValue().equals("hello"));
}

TEST(LDom2InStream, ParseWithTagAndAttribute)
{
    // Verifies tag name and attribute are both parsed correctly together
    LDom2Tree tree;
    parseXML("<root name=\"test\"/>", tree);

    EXPECT_TRUE(tree.top()->getTagName().equals("root"));
    EXPECT_TRUE(tree.top()->getStrAttr("name").equals("test"));
}

TEST(LDom2InStream, ParseMultipleAttributes)
{
    LDom2Tree tree;
    parseXML("<root a=\"1\" b=\"2\" c=\"3\"/>", tree);

    EXPECT_TRUE(tree.top()->getStrAttr("a").equals("1"));
    EXPECT_TRUE(tree.top()->getStrAttr("b").equals("2"));
    EXPECT_TRUE(tree.top()->getStrAttr("c").equals("3"));
}

// Parse XML that already has its own declaration (e.g. output of writeTree()).
static void parseRawXML(const std::string &xml, LDom2Tree &tree)
{
    auto impl = qlib::sp<PipeStreamImpl>(new PipeStreamImpl());
    impl->write(xml.c_str(), 0, static_cast<int>(xml.size()));
    impl->o_close();
    PipeInStream raw_in;
    raw_in.setImpl(impl);
    LDom2InStream in(raw_in);
    in.read(tree);
}

// ── Round-trip tests ─────────────────────────────────────────────────────────

TEST(LDom2Stream, RoundTripTopTagName)
{
    LDom2Tree orig("scene");
    std::string xml = writeTree(orig);

    LDom2Tree result;
    parseRawXML(xml, result);
    EXPECT_TRUE(result.top()->getTagName().equals("scene"));
}

TEST(LDom2Stream, RoundTripStringAttribute)
{
    LDom2Tree orig("root");
    orig.top()->setStrAttr("alpha", "hello");
    orig.top()->setStrAttr("beta", "world");

    std::string xml = writeTree(orig);
    LDom2Tree result;
    parseRawXML(xml, result);

    EXPECT_TRUE(result.top()->getStrAttr("alpha").equals("hello"));
    EXPECT_TRUE(result.top()->getStrAttr("beta").equals("world"));
}

TEST(LDom2Stream, RoundTripChildElement)
{
    LDom2Tree orig("root");
    LDom2Node *child = orig.top()->appendChild("child");
    child->setDefaultFlag(false);
    child->setStrAttr("x", "10");

    std::string xml = writeTree(orig);
    LDom2Tree result;
    parseRawXML(xml, result);

    LDom2Node *rchild = result.top()->findChild("child");
    ASSERT_NE(rchild, nullptr);
    EXPECT_TRUE(rchild->getStrAttr("x").equals("10"));
}

TEST(LDom2Stream, RoundTripTypeAttribute)
{
    LDom2Tree orig("obj");
    orig.top()->setTypeName("MyType");

    std::string xml = writeTree(orig);
    LDom2Tree result;
    parseRawXML(xml, result);

    EXPECT_TRUE(result.top()->getTypeName().equals("MyType"));
}

TEST(LDom2Stream, RoundTripValueAttribute)
{
    LDom2Tree orig("node");
    orig.top()->setValue("3.14");

    std::string xml = writeTree(orig);
    LDom2Tree result;
    parseRawXML(xml, result);

    EXPECT_TRUE(result.top()->getValue().equals("3.14"));
}

TEST(LDom2Stream, RoundTripMultipleChildren)
{
    LDom2Tree orig("root");
    for (int i = 0; i < 3; ++i) {
        LString tag = LString::format("child%d", i);
        LDom2Node *c = orig.top()->appendChild(tag);
        c->setDefaultFlag(false);
        c->setValue(LString::format("%d", i * 10));
    }

    std::string xml = writeTree(orig);
    LDom2Tree result;
    parseRawXML(xml, result);

    EXPECT_EQ(result.top()->getChildCount(), 3);
    for (int i = 0; i < 3; ++i) {
        LString tag = LString::format("child%d", i);
        LDom2Node *c = result.top()->findChild(tag);
        ASSERT_NE(c, nullptr) << "child not found: " << tag.c_str();
        EXPECT_TRUE(c->getValue().equals(LString::format("%d", i * 10)));
    }
}

// Attribute values holding LF / CR / TAB must come back bit-identical: the
// writer emits them as character references, since an XML parser normalizes
// literal whitespace control chars inside an attribute value to spaces.
TEST(LDom2OutStream, EscapeNewlineInAttrValueRoundTrip)
{
    LDom2Tree orig("root");
    const LString text("a\nb\tc\r\nd");
    orig.top()->setStrAttr("spec", text);

    std::string xml = writeTree(orig);
    EXPECT_NE(xml.find("&#10;"), std::string::npos);
    EXPECT_NE(xml.find("&#9;"), std::string::npos);
    EXPECT_NE(xml.find("&#13;"), std::string::npos);
    // no raw newline may appear inside the quoted attribute value
    const size_t attr = xml.find("spec=\"");
    ASSERT_NE(attr, std::string::npos);
    const size_t close = xml.find('"', attr + 6);
    ASSERT_NE(close, std::string::npos);
    EXPECT_EQ(xml.substr(attr, close - attr).find('\n'), std::string::npos);

    LDom2Tree result;
    parseRawXML(xml, result);
    EXPECT_TRUE(result.top()->getStrAttr("spec").equals(text));
}
