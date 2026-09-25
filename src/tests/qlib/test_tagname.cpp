#include <gtest/gtest.h>
#include <common.h>
#include "qlib/TagName.hpp"

#include <thread>
#include <vector>

using qlib::LString;
using qlib::TagName;

// The same string always maps to the same ID, and the ID gives the string back.
TEST(TagName, InternIsStableAndRoundTrips)
{
    TagName a("CA");
    TagName b(LString("CA"));
    TagName c("CB");
    EXPECT_EQ(a.getID(), b.getID());
    EXPECT_NE(a.getID(), c.getID());
    EXPECT_TRUE(a.str().equals("CA"));
    EXPECT_TRUE(TagName::lookup(c.getID()).equals("CB"));
    const LString &ref = a;
    EXPECT_EQ(&ref, &b.str());

    // The empty string is TAG_NULL and a default TagName.
    EXPECT_EQ(TagName("").getID(), TagName::TAG_NULL);
    EXPECT_TRUE(TagName().str().isEmpty());
    EXPECT_TRUE(TagName().isEmpty());

    // compare() orders by string, not by registration order.
    TagName z("zz_tagname_test");
    TagName y("yy_tagname_test");
    EXPECT_GT(z.compare(y), 0);
}

// Concurrent registration of an overlapping set of strings gives one ID per
// string, and every thread sees the same ID for it.
TEST(TagName, ConcurrentInternGivesUniqueIDs)
{
    const int kThreads = 8;
    const int kNames = 5000;  // crosses a chunk boundary of the table
    std::vector<std::vector<qlib::TagID>> ids(kThreads, std::vector<qlib::TagID>(kNames));
    std::vector<std::thread> threads;
    for (int t = 0; t < kThreads; ++t) {
        threads.emplace_back([t, &ids]() {
            for (int i = 0; i < kNames; ++i) {
                const int k = (t % 2 == 0) ? i : kNames - 1 - i;
                ids[t][k] = TagName(LString::format("concurrent_%d", k)).getID();
            }
        });
    }
    for (auto &th : threads) th.join();

    for (int i = 0; i < kNames; ++i) {
        for (int t = 1; t < kThreads; ++t) ASSERT_EQ(ids[t][i], ids[0][i]);
        EXPECT_TRUE(TagName::lookup(ids[0][i]).equals(LString::format("concurrent_%d", i)));
    }
    std::vector<qlib::TagID> sorted = ids[0];
    std::sort(sorted.begin(), sorted.end());
    EXPECT_EQ(std::unique(sorted.begin(), sorted.end()), sorted.end());
}
