#include <gtest/gtest.h>
#include <common.h>
#include <memory>
#include <type_traits>
#include <utility>
#include "qlib/LExceptions.hpp"
#include "qlib/LVariant.hpp"
#include "qlib/LVarList.hpp"
#include "qlib/LVarDict.hpp"

using qlib::LString;
using qlib::LVarDict;
using qlib::LVariant;
using qlib::LVarList;

namespace {

// Builds ["a", 1, [2.5]] as a heap-allocated, element-owning list.
LVarList *makeNestedList()
{
    LVarList *pList = new LVarList();
    pList->push_back(new LVariant(LString("a")));
    pList->push_back(new LVariant(1));
    LVarList *pInner = new LVarList();
    pInner->push_back(new LVariant(2.5));
    pList->push_back(new LVariant(pInner));
    return pList;
}

}  // namespace

// A LVariant* is never a value. It used to convert to LVariant(bool) and
// store true, which silently broke LVarDict::set(key, LVariant*).
static_assert(!std::is_constructible<LVariant, LVariant *>::value,
              "LVariant must not be constructible from LVariant*");

// ---- LVarList ------------------------------------------------------------

TEST(LVarList, CopyIsDeep)
{
    LVarList *pOrig = makeNestedList();
    LVarList copy(*pOrig);

    ASSERT_EQ(copy.size(), 3u);
    EXPECT_NE(copy.at(0), pOrig->at(0));
    EXPECT_NE(copy.getList(2), pOrig->getList(2));

    // Destroying the original must leave the copy intact.
    delete pOrig;
    EXPECT_STREQ(copy.getString(0).c_str(), "a");
    EXPECT_EQ(copy.getInt(1), 1);
    EXPECT_DOUBLE_EQ(copy.getList(2)->getReal(0), 2.5);
}

TEST(LVarList, AssignmentIsDeepAndReplacesOldElements)
{
    LVarList dest;
    dest.push_back(new LVariant(LString("old")));

    LVarList *pSrc = makeNestedList();
    dest = *pSrc;
    delete pSrc;

    ASSERT_EQ(dest.size(), 3u);
    EXPECT_STREQ(dest.getString(0).c_str(), "a");
    EXPECT_DOUBLE_EQ(dest.getList(2)->getReal(0), 2.5);
}

TEST(LVarList, ClearAndDeleteEmptiesTheList)
{
    std::unique_ptr<LVarList> pSrc(makeNestedList());
    LVarList list(*pSrc);
    list.clearAndDelete();
    EXPECT_TRUE(list.empty());
}

// ---- LVariant ------------------------------------------------------------

TEST(LVariant, ListValueCopyIsIndependent)
{
    LVariant v(makeNestedList());
    LVariant w(v);
    EXPECT_NE(v.getListPtr(), w.getListPtr());

    v.setNull();
    ASSERT_TRUE(w.isList());
    EXPECT_STREQ(w.getListPtr()->getString(0).c_str(), "a");
}

TEST(LVariant, MoveTransfersOwnership)
{
    LVariant v(makeNestedList());
    LVarList *pList = v.getListPtr();

    LVariant w(std::move(v));
    EXPECT_TRUE(v.isNull());
    EXPECT_EQ(w.getListPtr(), pList);

    LVariant x(LString("replaced"));
    x = std::move(w);
    EXPECT_TRUE(w.isNull());
    ASSERT_TRUE(x.isList());
    EXPECT_EQ(x.getListPtr(), pList);
}

// ---- LVarDict ------------------------------------------------------------

TEST(LVarDict, SetByMoveAndGetListReturnsStoredPointer)
{
    LVarDict dict;
    LVariant val(makeNestedList());
    LVarList *pList = val.getListPtr();

    EXPECT_TRUE(dict.set("names", std::move(val)));
    EXPECT_TRUE(val.isNull());

    // No copy on lookup, and the pointer stays stable across calls.
    EXPECT_EQ(dict.getList("names"), pList);
    EXPECT_EQ(dict.getList("names"), pList);
    EXPECT_STREQ(dict.getList("names")->getString(0).c_str(), "a");

    // set() keeps the first value for a duplicate key and leaves the
    // rejected value untouched.
    LVariant dup(2);
    EXPECT_FALSE(dict.set("names", std::move(dup)));
    EXPECT_EQ(dict.getList("names"), pList);
    ASSERT_TRUE(dup.isInt());
    EXPECT_EQ(dup.getIntValue(), 2);
}

TEST(LVarDict, ScalarGettersAndMissingKeys)
{
    LVarDict dict;
    dict.set("i", LVariant(7));
    dict.set("r", LVariant(1.5));
    dict.set("s", LVariant(LString("str")));

    EXPECT_EQ(dict.getInt("i"), 7);
    EXPECT_DOUBLE_EQ(dict.getReal("r"), 1.5);
    EXPECT_DOUBLE_EQ(dict.getReal("i"), 7.0);
    EXPECT_STREQ(dict.getString("s").c_str(), "str");

    EXPECT_EQ(dict.lookup("missing"), nullptr);
    EXPECT_THROW(dict.getInt("missing"), qlib::RuntimeException);
    EXPECT_THROW(dict.getInt("s"), qlib::RuntimeException);
    EXPECT_THROW(dict.getList("s"), qlib::RuntimeException);
}

TEST(LVarDict, CopyIsDeep)
{
    LVarDict *pDict = new LVarDict();
    pDict->set("names", LVariant(makeNestedList()));

    LVarDict copy(*pDict);
    EXPECT_NE(copy.getList("names"), pDict->getList("names"));

    delete pDict;
    EXPECT_STREQ(copy.getList("names")->getString(0).c_str(), "a");
}
