// Camera display order (ui_order) and its qsc round trip.
//
// ui_order is declared (nopersist) in Camera.qif, exactly like Object/Renderer:
// the slot itself is never written as an attribute, the order survives as the
// element order of the <camera> nodes, and the load path re-assigns slots in
// the order it reads them.

#include <gtest/gtest.h>
#include <common.h>

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>

#include "qsys/Camera.hpp"
#include "qsys/Scene.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/SceneXMLReader.hpp"
#include "qsys/SceneXMLWriter.hpp"

using qlib::LString;
using qsys::CameraPtr;
using qsys::SceneManager;
using qsys::ScenePtr;

namespace {

/// Names as they appear in getCameraInfoJSON(), i.e. in display order.
std::vector<std::string> namesInOrder(const ScenePtr &pScene)
{
    const LString json = pScene->getCameraInfoJSON();
    std::vector<std::string> rval;
    const std::string s(json.c_str());
    const std::string key = "\"name\":\"";
    size_t pos = 0;
    while ((pos = s.find(key, pos)) != std::string::npos) {
        pos += key.size();
        const size_t end = s.find('"', pos);
        if (end == std::string::npos) break;
        rval.push_back(s.substr(pos, end - pos));
        pos = end;
    }
    return rval;
}

}  // namespace

class CameraOrderTest : public ::testing::Test {
protected:
    ScenePtr m_pScene;

    void SetUp() override { m_pScene = SceneManager::getInstance()->createScene(); }
    void TearDown() override { destroy(m_pScene); }

    static void destroy(ScenePtr &p)
    {
        if (p.isnull()) return;
        qlib::uid_t uid = p->getUID();
        p = ScenePtr();
        SceneManager::getInstance()->destroyScene(uid);
    }

    /// Register a camera under `name` (fresh camera => appended to the end).
    void addCam(const char *name)
    {
        m_pScene->setCamera(name, CameraPtr(new qsys::Camera()));
    }

    static std::string tmpQsc(const char *name)
    {
        std::filesystem::path p = std::filesystem::temp_directory_path() / name;
        std::string s = p.string();
        std::remove(s.c_str());
        return s;
    }

    std::string saveToFile(const std::string &path)
    {
        qsys::SceneXMLWriter w;
        w.setPath(path.c_str());
        w.attach(m_pScene);
        w.write();
        w.detach();
        std::ifstream ifs(path, std::ios::binary);
        std::stringstream ss;
        ss << ifs.rdbuf();
        return ss.str();
    }
};

// A new camera goes to the end of the list; overwriting an existing name
// keeps that name's slot; the JSON list is emitted in slot order, not in the
// name order of the backing map.
TEST_F(CameraOrderTest, SetCameraAssignsAndInheritsUIOrder)
{
    // Names chosen so that map (name) order and insertion order differ.
    addCam("zulu");
    addCam("alpha");
    addCam("mike");

    EXPECT_EQ(m_pScene->getCameraRef("zulu")->getUIOrder(), 0);
    EXPECT_EQ(m_pScene->getCameraRef("alpha")->getUIOrder(), 1);
    EXPECT_EQ(m_pScene->getCameraRef("mike")->getUIOrder(), 2);
    EXPECT_EQ(namesInOrder(m_pScene),
              (std::vector<std::string>{"zulu", "alpha", "mike"}));

    // Overwrite "alpha" the way saveViewToCam does (fresh camera, no slot):
    // it must land back in slot 1, not at the end.
    CameraPtr pNew(new qsys::Camera());
    EXPECT_EQ(pNew->getUIOrder(), -1);
    m_pScene->setCamera("alpha", pNew);
    EXPECT_EQ(m_pScene->getCameraRef("alpha")->getUIOrder(), 1);
    EXPECT_EQ(namesInOrder(m_pScene),
              (std::vector<std::string>{"zulu", "alpha", "mike"}));

    // An explicit slot (what a GUI reorder writes) is honoured as given.
    CameraPtr pMoved = m_pScene->getCamera("mike");
    pMoved->setUIOrder(-1);  // fresh-copy semantics do not apply here
    pMoved->setUIOrder(0);
    m_pScene->setCamera("mike", pMoved);
    EXPECT_EQ(namesInOrder(m_pScene)[0], "mike");
}

// The order survives a qsc save/load, and ui_order never appears as an
// attribute (it is nopersist; the element order carries it).
TEST_F(CameraOrderTest, QscRoundTripKeepsCameraOrder)
{
    addCam("zulu");
    addCam("alpha");
    addCam("mike");

    // Rearrange to mike, zulu, alpha (none of map order nor insertion order).
    const char *const want[] = {"mike", "zulu", "alpha"};
    for (int i = 0; i < 3; ++i) {
        CameraPtr p = m_pScene->getCamera(want[i]);
        p->setUIOrder(i);
        m_pScene->setCamera(want[i], p);
    }
    ASSERT_EQ(namesInOrder(m_pScene),
              (std::vector<std::string>{"mike", "zulu", "alpha"}));

    const std::string path = tmpQsc("cuemol_camera_order_test.qsc");
    const std::string text = saveToFile(path);
    EXPECT_EQ(text.find("ui_order"), std::string::npos) << "ui_order must not be persisted as an attribute";
    EXPECT_LT(text.find("\"mike\""), text.find("\"zulu\""));
    EXPECT_LT(text.find("\"zulu\""), text.find("\"alpha\""));

    ScenePtr pScene2 = SceneManager::getInstance()->createScene();
    {
        qsys::SceneXMLReader r;
        r.setPath(path.c_str());
        r.attach(pScene2);
        r.read();
        r.detach();
        EXPECT_TRUE(r.getErrMsg().isEmpty()) << r.getErrMsg().c_str();
    }
    EXPECT_EQ(namesInOrder(pScene2),
              (std::vector<std::string>{"mike", "zulu", "alpha"}));
    destroy(pScene2);
    std::remove(path.c_str());
}
