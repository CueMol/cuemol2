#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LDOM2Tree.hpp"

using qlib::LDom2Node;
using qlib::LString;

// Helper: create a node with a given tag and string value as a child attr
static LDom2Node *makeAttrNode(const LString &tag, const LString &val)
{
    LDom2Node *p = new LDom2Node();
    p->setTagName(tag);
    p->setValue(val);
    p->setAttrFlag(true);
    return p;
}

TEST(LDom2Node, DefaultConstruct)
{
    LDom2Node n;
    EXPECT_EQ(n.getChildCount(), 0);
    EXPECT_TRUE(n.getTagName().isEmpty());
    EXPECT_TRUE(n.getValue().isEmpty());
    EXPECT_FALSE(n.isConsumed());
}

TEST(LDom2Node, AppendChildAndCount)
{
    LDom2Node parent;
    parent.appendChild(makeAttrNode("a", "1"));
    parent.appendChild(makeAttrNode("b", "2"));
    EXPECT_EQ(parent.getChildCount(), 2);
}

TEST(LDom2Node, FindChildFound)
{
    LDom2Node parent;
    parent.appendChild(makeAttrNode("alpha", "hello"));
    parent.appendChild(makeAttrNode("beta", "world"));

    LDom2Node *p = parent.findChild("beta");
    ASSERT_NE(p, nullptr);
    EXPECT_TRUE(p->getTagName().equals("beta"));
}

TEST(LDom2Node, FindChildNotFound)
{
    LDom2Node parent;
    parent.appendChild(makeAttrNode("alpha", "hello"));

    EXPECT_EQ(parent.findChild("nonexistent"), nullptr);
}

TEST(LDom2Node, FindChildEmpty)
{
    LDom2Node parent;
    EXPECT_EQ(parent.findChild("anything"), nullptr);
}

TEST(LDom2Node, GetStrAttr)
{
    LDom2Node parent;
    parent.appendChild(makeAttrNode("name", "foo"));
    parent.appendChild(makeAttrNode("value", "42"));

    EXPECT_TRUE(parent.getStrAttr("name").equals("foo"));
    EXPECT_TRUE(parent.getStrAttr("value").equals("42"));
}

TEST(LDom2Node, GetStrAttrMissing)
{
    LDom2Node parent;
    parent.appendChild(makeAttrNode("name", "foo"));
    EXPECT_TRUE(parent.getStrAttr("missing").isEmpty());
}

TEST(LDom2Node, GetStrAttrEmptyValue)
{
    // A child with a non-empty tag but empty value should not be returned
    LDom2Node parent;
    LDom2Node *child = new LDom2Node();
    child->setTagName("empty");
    // value stays empty
    parent.appendChild(child);
    EXPECT_TRUE(parent.getStrAttr("empty").isEmpty());
}

TEST(LDom2Node, GetBoolAttr)
{
    LDom2Node parent;
    parent.appendChild(makeAttrNode("flag", "true"));
    parent.appendChild(makeAttrNode("nope", "false"));
    EXPECT_TRUE(parent.getBoolAttr("flag"));
    EXPECT_FALSE(parent.getBoolAttr("nope"));
}

TEST(LDom2Node, CopyConstructorDeepCopiesChildren)
{
    LDom2Node orig;
    orig.appendChild(makeAttrNode("x", "10"));
    orig.appendChild(makeAttrNode("y", "20"));

    LDom2Node copy(orig);
    EXPECT_EQ(copy.getChildCount(), 2);

    // Verify tags are preserved
    ASSERT_NE(copy.findChild("x"), nullptr);
    ASSERT_NE(copy.findChild("y"), nullptr);
    EXPECT_TRUE(copy.getStrAttr("x").equals("10"));
    EXPECT_TRUE(copy.getStrAttr("y").equals("20"));
}

TEST(LDom2Node, CopyConstructorIsIndependent)
{
    LDom2Node orig;
    orig.appendChild(makeAttrNode("k", "v"));

    LDom2Node copy(orig);
    // Modifying the copy's child should not affect orig
    copy.findChild("k")->setValue("modified");
    EXPECT_TRUE(orig.getStrAttr("k").equals("v"));
}

TEST(LDom2Node, CopyConstructorEmptyChildren)
{
    LDom2Node orig;
    orig.setTagName("root");
    LDom2Node copy(orig);
    EXPECT_EQ(copy.getChildCount(), 0);
    EXPECT_TRUE(copy.getTagName().equals("root"));
}

TEST(LDom2Node, RemoveChild)
{
    LDom2Node parent;
    parent.appendChild(makeAttrNode("a", "1"));
    parent.appendChild(makeAttrNode("b", "2"));

    EXPECT_TRUE(parent.removeChild("a"));
    EXPECT_EQ(parent.getChildCount(), 1);
    EXPECT_EQ(parent.findChild("a"), nullptr);
    EXPECT_NE(parent.findChild("b"), nullptr);
}

TEST(LDom2Node, RemoveChildNotFound)
{
    LDom2Node parent;
    parent.appendChild(makeAttrNode("a", "1"));
    EXPECT_FALSE(parent.removeChild("nonexistent"));
    EXPECT_EQ(parent.getChildCount(), 1);
}

TEST(LDom2Node, IsChildrenConsumedAllConsumed)
{
    LDom2Node parent;
    LDom2Node *c1 = makeAttrNode("a", "1");
    LDom2Node *c2 = makeAttrNode("b", "2");
    c1->setConsumed(true);
    c2->setConsumed(true);
    parent.appendChild(c1);
    parent.appendChild(c2);
    EXPECT_TRUE(parent.isChildrenConsumed());
}

TEST(LDom2Node, IsChildrenConsumedOneNotConsumed)
{
    LDom2Node parent;
    LDom2Node *c1 = makeAttrNode("a", "1");
    LDom2Node *c2 = makeAttrNode("b", "2");
    c1->setConsumed(true);
    c2->setConsumed(false);
    parent.appendChild(c1);
    parent.appendChild(c2);
    EXPECT_FALSE(parent.isChildrenConsumed());
}

TEST(LDom2Node, IsChildrenConsumedEmpty)
{
    LDom2Node parent;
    // No children → vacuously all consumed
    EXPECT_TRUE(parent.isChildrenConsumed());
}

TEST(LDom2Node, GetErrorMsgsFromChildren)
{
    LDom2Node parent;
    LDom2Node *child = new LDom2Node();
    child->setTagName("child");
    child->appendErrMsg("error in child");
    parent.appendChild(child);

    LString msgs = parent.getErrorMsgs();
    EXPECT_GE(msgs.indexOf(LString("error in child")), 0);
}

TEST(LDom2Node, GetErrorMsgsEmpty)
{
    LDom2Node parent;
    parent.appendChild(makeAttrNode("a", "1"));
    EXPECT_TRUE(parent.getErrorMsgs().isEmpty());
}

TEST(LDom2Node, SetStrAttrOverwrite)
{
    LDom2Node parent;
    parent.setStrAttr("key", "first");
    parent.setStrAttr("key", "second");
    // Only one child for this key, value overwritten
    EXPECT_TRUE(parent.getStrAttr("key").equals("second"));
    EXPECT_EQ(parent.getChildCount(), 1);
}
