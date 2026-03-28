#include <gtest/gtest.h>
#include <common.h>
#include "qsys/ShaderObjMgr.hpp"
#include "qsys/SceneEvent.hpp"
#include "qsys/SceneManager.hpp"
#include <gfx/ShaderObject.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/Matrix3D.hpp>

using qlib::LString;
using qsys::SceneManager;
using qsys::ScenePtr;
using qsys::ShaderObjMgr;

// Minimal mock ShaderObject that does not require OpenGL
class MockShaderObject : public gfx::ShaderObject
{
public:
    bool m_deleted = false;

    ~MockShaderObject() override { m_deleted = true; }

    bool loadShaders(const qlib::MapTable<qlib::LString> &) override { return true; }
    void enable() override {}
    void disable() override {}

    void setUniform(const LString &, int) override {}
    void setUniform(const LString &, int, int) override {}
    void setUniform(const LString &, int, int, int) override {}
    void setUniform(const LString &, int, int, int, int) override {}
    void setUniformF(const LString &, float) override {}
    void setUniformF(const LString &, float, float) override {}
    void setUniformF(const LString &, float, float, float) override {}
    void setUniformF(const LString &, float, float, float, float) override {}
    void setMatrix(const LString &, const qlib::Matrix4D &) override {}
    void setMatrix(const LString &, const qlib::Matrix3D &) override {}
    int getAttribLocation(const char *) override { return -1; }
    void setupFog(gfx::DisplayContext *) override {}
    void setupMat(gfx::DisplayContext *) override {}
};

class ShaderObjMgrTest : public ::testing::Test
{
protected:
    ScenePtr m_pScene;
    qlib::uid_t m_sceneID = qlib::invalid_uid;

    void SetUp() override
    {
        m_pScene = SceneManager::getInstance()->createScene();
        m_sceneID = m_pScene->getUID();
    }

    void TearDown() override
    {
        if (!m_pScene.isnull()) {
            qlib::uid_t uid = m_pScene->getUID();
            m_pScene = ScenePtr();
            SceneManager::getInstance()->destroyScene(uid);
        }
        SceneManager::getInstance()->destroyAllScenes();
    }
};

TEST_F(ShaderObjMgrTest, RegisterAndGetShaderObject)
{
    auto *pMock = new MockShaderObject();
    ShaderObjMgr *pMgr = ShaderObjMgr::getInstance();

    bool ok = pMgr->registerShaderObject("testShader", m_sceneID, pMock);
    EXPECT_TRUE(ok);

    gfx::ShaderObject *pFound = pMgr->getShaderObject("testShader", m_sceneID);
    EXPECT_EQ(pFound, pMock);
}

TEST_F(ShaderObjMgrTest, GetNonexistentKeyReturnsNull)
{
    ShaderObjMgr *pMgr = ShaderObjMgr::getInstance();
    gfx::ShaderObject *pFound = pMgr->getShaderObject("noSuchShader", m_sceneID);
    EXPECT_EQ(pFound, nullptr);
}

TEST_F(ShaderObjMgrTest, RegisterWithInvalidSceneReturnsFalse)
{
    auto *pMock = new MockShaderObject();
    ShaderObjMgr *pMgr = ShaderObjMgr::getInstance();

    bool ok = pMgr->registerShaderObject("testShader", qlib::invalid_uid, pMock);
    EXPECT_FALSE(ok);
    // pMock was not registered, so we must delete it manually to avoid leak
    delete pMock;
}

TEST_F(ShaderObjMgrTest, SceneDestroyRemovesRegisteredObjects)
{
    ShaderObjMgr *pMgr = ShaderObjMgr::getInstance();

    // Create a second scene so that the ShaderObjMgr is not destroyed after TearDown
    ScenePtr pScene2 = SceneManager::getInstance()->createScene();
    auto *pMock2 = new MockShaderObject();
    pMgr->registerShaderObject("shader2", pScene2->getUID(), pMock2);

    // Register an object in m_pScene and verify it exists
    auto *pMock = new MockShaderObject();
    pMgr->registerShaderObject("myShader", m_sceneID, pMock);
    ASSERT_NE(pMgr->getShaderObject("myShader", m_sceneID), nullptr);

    // Destroy the scene
    qlib::uid_t uid = m_pScene->getUID();
    m_pScene = ScenePtr();
    SceneManager::getInstance()->destroyScene(uid);
    m_sceneID = qlib::invalid_uid;

    // The shader registered for the destroyed scene should be gone
    EXPECT_EQ(pMgr->getShaderObject("myShader", uid), nullptr);

    // Clean up scene2
    qlib::uid_t uid2 = pScene2->getUID();
    pScene2 = ScenePtr();
    SceneManager::getInstance()->destroyScene(uid2);
}

TEST_F(ShaderObjMgrTest, DuplicateRegistrationInsertsNewEntry)
{
    ShaderObjMgr *pMgr = ShaderObjMgr::getInstance();
    auto *pMock1 = new MockShaderObject();
    auto *pMock2 = new MockShaderObject();

    pMgr->registerShaderObject("dup", m_sceneID, pMock1);
    // Second registration with same key: std::map::insert ignores duplicate keys,
    // so the original object should still be returned.
    pMgr->registerShaderObject("dup", m_sceneID, pMock2);

    gfx::ShaderObject *pFound = pMgr->getShaderObject("dup", m_sceneID);
    // The first registration wins
    EXPECT_EQ(pFound, pMock1);

    // pMock2 was not inserted; clean up manually
    delete pMock2;
}
