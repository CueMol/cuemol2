#include <gtest/gtest.h>
#include <common.h>
#include "qsys/SysConfig.hpp"

using qsys::SysConfig;

// ---- SysConfig::Section (standalone, no singleton needed) ----

TEST(SysConfigSectionTest, DefaultConstruction)
{
    SysConfig::Section sec;
    EXPECT_TRUE(sec.isPersistent());
    EXPECT_FALSE(sec.isConst());
    EXPECT_FALSE(sec.hasData());
    EXPECT_EQ(sec.size(), 0);
}

TEST(SysConfigSectionTest, NamedConstruction)
{
    SysConfig::Section sec("mySec");
    EXPECT_EQ(sec.getName(), "mySec");
}

TEST(SysConfigSectionTest, SetGetFlags)
{
    SysConfig::Section sec;
    sec.setPersistent(false);
    EXPECT_FALSE(sec.isPersistent());
    sec.setConst(true);
    EXPECT_TRUE(sec.isConst());
}

TEST(SysConfigSectionTest, SetGetStringData)
{
    SysConfig::Section sec;
    EXPECT_FALSE(sec.hasData());
    qlib::LVariant v("hello");
    sec.setRawData(v);
    EXPECT_TRUE(sec.hasData());
    EXPECT_EQ(sec.getStringData(), "hello");
}

TEST(SysConfigSectionTest, ChildrenPushAndFind)
{
    SysConfig::Section parent;
    SysConfig::Section *child1 = new SysConfig::Section("alpha");
    SysConfig::Section *child2 = new SysConfig::Section("beta");
    parent.push_back(child1);
    parent.push_back(child2);
    EXPECT_EQ(parent.size(), 2);

    auto it = parent.findName(parent.begin(), "alpha");
    EXPECT_NE(it, parent.end());
    EXPECT_EQ((*it)->getName(), "alpha");

    it = parent.findName(parent.begin(), "gamma");
    EXPECT_EQ(it, parent.end());
}

// ---- SysConfig singleton (initialized via qsys::init("")) ----

TEST(SysConfigTest, PutAndGet)
{
    SysConfig *pConf = SysConfig::getInstance();
    ASSERT_NE(pConf, nullptr);

    pConf->put("test_key", "test_value");
    EXPECT_EQ(pConf->get("test_key"), "test_value");
}

TEST(SysConfigTest, GetMissingKeyReturnsEmpty)
{
    SysConfig *pConf = SysConfig::getInstance();
    ASSERT_NE(pConf, nullptr);
    EXPECT_TRUE(pConf->get("no_such_key_xyz").isEmpty());
}

TEST(SysConfigTest, GetSectionCreatesHierarchy)
{
    SysConfig *pConf = SysConfig::getInstance();
    ASSERT_NE(pConf, nullptr);

    SysConfig::Section *pSec = pConf->getSection("a:b:c", true);
    ASSERT_NE(pSec, nullptr);

    // same path returns the same node
    SysConfig::Section *pSec2 = pConf->getSection("a:b:c", false);
    EXPECT_EQ(pSec, pSec2);
}

TEST(SysConfigTest, GetSectionMissingReturnsNull)
{
    SysConfig *pConf = SysConfig::getInstance();
    ASSERT_NE(pConf, nullptr);

    SysConfig::Section *pSec = pConf->getSection("no:such:path", false);
    EXPECT_EQ(pSec, nullptr);
}

TEST(SysConfigTest, ConvPathNameNoDirective)
{
    SysConfig *pConf = SysConfig::getInstance();
    ASSERT_NE(pConf, nullptr);

    // path without any directive is returned unchanged
    EXPECT_EQ(pConf->convPathName("/usr/local/bin"), "/usr/local/bin");
}

TEST(SysConfigTest, ConvPathNameConfDir)
{
    SysConfig *pConf = SysConfig::getInstance();
    ASSERT_NE(pConf, nullptr);

    pConf->put("config_dir", "/etc/cuemol");
    EXPECT_EQ(pConf->convPathName("%%CONFDIR%%/data"), "/etc/cuemol/data");
    EXPECT_EQ(pConf->convPathName("%%CONFDIR%%"), "/etc/cuemol");
}
