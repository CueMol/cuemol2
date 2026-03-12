#include <gtest/gtest.h>
#include <common.h>
#include "qsys/RendererFactory.hpp"
#include "qsys/Renderer.hpp"
#include "qsys/Object.hpp"
#include <qlib/LExceptions.hpp>

using qlib::LString;
using qsys::RendererFactory;
using qsys::RendererPtr;
using qsys::ObjectPtr;

// RendererFactory singleton is created by qsys::init() via QsysEnvironment.
// After init, "rendgroup" renderer (*group type) is registered via pRF->regist<RendGroup>().

TEST(RendererFactoryTest, SingletonIsNotNull)
{
    EXPECT_NE(RendererFactory::getInstance(), nullptr);
}

TEST(RendererFactoryTest, CreateRendGroupReturnsValidRenderer)
{
    RendererPtr pRend = RendererFactory::getInstance()->create("*group");
    EXPECT_FALSE(pRend.isnull());
}

TEST(RendererFactoryTest, CreateRendGroupHasCorrectTypeName)
{
    RendererPtr pRend = RendererFactory::getInstance()->create("*group");
    ASSERT_FALSE(pRend.isnull());
    EXPECT_STREQ(pRend->getTypeName(), "*group");
}

TEST(RendererFactoryTest, CreateUnknownRendererThrows)
{
    EXPECT_THROW(
        RendererFactory::getInstance()->create("__no_such_renderer__"),
        qlib::RuntimeException
    );
}

TEST(RendererFactoryTest, SearchCompatibleWithNullObjectIncludesRendGroup)
{
    // RendGroup::isCompatibleObj always returns true regardless of object,
    // so passing a null ObjectPtr still counts as compatible.
    std::list<LString> result;
    int n = RendererFactory::getInstance()->searchCompatibleRenderers(ObjectPtr(), result);
    EXPECT_GE(n, 1);
    EXPECT_FALSE(result.empty());
    // "*group" should be among the compatible renderers
    bool found = std::find(result.begin(), result.end(), LString("*group")) != result.end();
    EXPECT_TRUE(found);
}

TEST(RendererFactoryTest, TwoCreatedRenderersHaveDifferentUIDs)
{
    RendererPtr r1 = RendererFactory::getInstance()->create("*group");
    RendererPtr r2 = RendererFactory::getInstance()->create("*group");
    EXPECT_NE(r1->getUID(), r2->getUID());
}
