// -*-Mode: C++;-*-
//
// Tests for MultiGradient::setNodesJSON undo integration.
//
// setNodesJSON delegates to copyFrom(), which is the only MultiGradient
// mutation path that records undo info and fires the prop-changed event.
// These tests pin that inheritance through a scene-attached MapRenderer
// (multi_grad property lives on MapRenderer/MolSurfRenderer, so this
// cannot be tested in the qsys-only test binary).
//

#include <gtest/gtest.h>
#include <common.h>
#include <qsys/SceneManager.hpp>
#include <qsys/Scene.hpp>
#include <qsys/MultiGradient.hpp>
#include "xtal/DensityMap.hpp"
#include "xtal/MapSurfRenderer.hpp"

using qsys::MultiGradientPtr;

namespace {

class MultiGradUndoTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_pScene;
    qsys::ObjectPtr m_pObj;
    qsys::RendererPtr m_pRend;
    MultiGradientPtr m_pGrad;

    void SetUp() override
    {
        m_pScene = qsys::SceneManager::getInstance()->createScene();
        m_pObj = qsys::ObjectPtr(MB_NEW xtal::DensityMap());
        m_pObj->setName("testmap");
        m_pScene->addObject(m_pObj);
        m_pRend = m_pObj->createRenderer("isosurf");

        xtal::MapRenderer *pMapRend =
            dynamic_cast<xtal::MapRenderer *>(m_pRend.get());
        ASSERT_NE(pMapRend, nullptr);
        m_pGrad = pMapRend->getMultiGrad();
        ASSERT_FALSE(m_pGrad.isnull());
    }

    void TearDown() override
    {
        qsys::SceneManager::getInstance()->destroyScene(m_pScene->getUID());
    }
};

}  // namespace

TEST_F(MultiGradUndoTest, SetNodesJSONInTxnIsUndoable)
{
    m_pGrad->setNodesJSON(
        "[{\"value\":0.0,\"color\":\"#FF0000\"},"
        "{\"value\":1.0,\"color\":\"#0000FF\"}]");
    ASSERT_EQ(m_pGrad->getSize(), 2);

    m_pScene->startUndoTxn("Change multi gradient");
    m_pGrad->setNodesJSON("[{\"value\":0.5,\"color\":\"#00FF00\"}]");
    m_pScene->commitUndoTxn();

    ASSERT_EQ(m_pGrad->getSize(), 1);
    EXPECT_DOUBLE_EQ(m_pGrad->getValueAt(0), 0.5);
    ASSERT_TRUE(m_pScene->isUndoable());

    // undo restores the previous node set
    m_pScene->undo(0);
    ASSERT_EQ(m_pGrad->getSize(), 2);
    EXPECT_DOUBLE_EQ(m_pGrad->getValueAt(0), 0.0);
    EXPECT_DOUBLE_EQ(m_pGrad->getValueAt(1), 1.0);
    EXPECT_EQ(m_pGrad->getColorAt(0)->r(), 255);

    // redo re-applies the new node set
    ASSERT_TRUE(m_pScene->isRedoable());
    m_pScene->redo(0);
    ASSERT_EQ(m_pGrad->getSize(), 1);
    EXPECT_DOUBLE_EQ(m_pGrad->getValueAt(0), 0.5);
    EXPECT_EQ(m_pGrad->getColorAt(0)->g(), 255);
}

TEST_F(MultiGradUndoTest, SetNodesJSONOutsideTxnIsNotRecorded)
{
    // outside a txn (live preview path): applied but no undo entry
    m_pGrad->setNodesJSON("[{\"value\":0.25,\"color\":\"#FFFFFF\"}]");
    ASSERT_EQ(m_pGrad->getSize(), 1);
    EXPECT_FALSE(m_pScene->isUndoable());
}
