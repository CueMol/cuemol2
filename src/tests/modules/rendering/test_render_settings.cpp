#include <gtest/gtest.h>
#include <common.h>

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <set>
#include <sstream>
#include <vector>

#include "qlib/LDOM2Tree.hpp"
#include "qlib/LScriptable.hpp"
#include "qlib/LVariant.hpp"
#include "qsys/Scene.hpp"
#include "qsys/SceneAppData.hpp"
#include "qsys/SceneEvent.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/SceneXMLReader.hpp"
#include "qsys/SceneXMLWriter.hpp"

using qlib::LString;
using qlib::LVariant;
using qsys::SceneAppDataPtr;
using qsys::SceneEvent;
using qsys::SceneManager;
using qsys::ScenePtr;

namespace {

const char *const APP_ID = "render";
const char *const APP_CLASS = "RenderSettings";

// Multi-line text, as the GUI stores an edited hatch look
const char *const LAYER_SPEC = "layer: kind=line angle=45\nlayer: kind=dot\n\tindent\n";

/// A property read through the dotted path (reads only; writes go to the child object).
LVariant getPath(const qlib::LPropSupport *p, const char *path)
{
    LVariant v;
    EXPECT_TRUE(p->getNestedProperty(path, v)) << path;
    return v;
}

int getInt(const qlib::LPropSupport *p, const char *path) { return getPath(p, path).getIntValue(); }
double getReal(const qlib::LPropSupport *p, const char *path) { return getPath(p, path).getRealValue(); }
LString getStr(const qlib::LPropSupport *p, const char *path) { return getPath(p, path).getStringValue(); }
bool getBool(const qlib::LPropSupport *p, const char *path) { return getPath(p, path).getBoolValue(); }

/// The child block object of a RenderSettings (the variant keeps it alive).
struct Child {
    LVariant var;
    qlib::LScriptable *obj;
    Child(const qlib::LPropSupport *p, const char *name) : obj(nullptr)
    {
        if (p->getProperty(name, var) && var.isObject()) obj = var.getObjectPtr();
    }
};

std::string readFile(const std::string &path)
{
    std::ifstream ifs(path, std::ios::binary);
    std::stringstream ss;
    ss << ifs.rdbuf();
    return ss.str();
}

class RecordingListener : public qsys::SceneEventListener {
public:
    struct Rec {
        int type;
        LString descr;
        LString parent;
        LString propname;
    };
    std::vector<Rec> recs;

    void sceneChanged(SceneEvent &ev) override
    {
        Rec r;
        r.type = ev.getType();
        r.descr = ev.getDescr();
        if (ev.getPropEvent() != nullptr) {
            r.parent = ev.getPropEvent()->getParentName();
            r.propname = ev.getPropEvent()->getName();
        }
        recs.push_back(r);
    }

    int countAppData() const
    {
        int n = 0;
        for (const Rec &r : recs)
            if (r.type == SceneEvent::SCE_SCENE_APPDATA_CHG) ++n;
        return n;
    }
};

class RenderSettingsTest : public ::testing::Test {
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

    static std::string tmpQsc(const char *name)
    {
        std::filesystem::path tmppath = std::filesystem::temp_directory_path() / name;
        std::string s = tmppath.string();
        std::remove(s.c_str());
        return s;
    }

    /// Save m_pScene to a temp qsc and return the file text.
    std::string saveToFile(const std::string &path)
    {
        qsys::SceneXMLWriter w;
        w.setPath(path.c_str());
        w.attach(m_pScene);
        w.write();
        w.detach();
        return readFile(path);
    }

    /// Every property with a declared default holds it and reads as default.
    static void expectAtDefaults(qlib::LScriptable *p, const char *what)
    {
        std::set<LString> names;
        p->getPropNames(names);
        int checked = 0;
        for (const LString &nm : names) {
            if (!p->hasPropDefault(nm)) continue;
            LVariant dv, v;
            ASSERT_TRUE(p->getPropDefault(nm, dv)) << what << "." << nm.c_str();
            ASSERT_TRUE(p->getProperty(nm, v)) << what << "." << nm.c_str();
            EXPECT_TRUE(v.toString().equals(dv.toString()))
                << what << "." << nm.c_str() << ": " << v.toString().c_str()
                << " != default " << dv.toString().c_str();
            EXPECT_TRUE(p->isPropDefault(nm)) << what << "." << nm.c_str();
            ++checked;
        }
        EXPECT_GT(checked, 0) << what;
    }
};

}  // namespace

TEST_F(RenderSettingsTest, FreshObjectMatchesDeclaredDefaults)
{
    SceneAppDataPtr p = m_pScene->getCreateAppData(APP_ID, APP_CLASS);
    ASSERT_FALSE(p.isnull());
    EXPECT_TRUE(m_pScene->hasAppData(APP_ID));
    EXPECT_EQ(p->getSceneID(), m_pScene->getUID());
    EXPECT_FALSE(m_pScene->isModified());  // holder creation is not an edit

    expectAtDefaults(p.get(), "render");
    for (const char *block : {"povray", "umbreon", "umbreon_npr"}) {
        Child c(p.get(), block);
        ASSERT_NE(c.obj, nullptr) << block;
        expectAtDefaults(c.obj, block);
    }

    // A few declared values, including a subclass override of an inherited default
    EXPECT_TRUE(getStr(p.get(), "backend").isEmpty());
    EXPECT_DOUBLE_EQ(getReal(p.get(), "width"), 1200.0);
    EXPECT_DOUBLE_EQ(getReal(p.get(), "povray.lightIntensity"), 1.3);
    EXPECT_DOUBLE_EQ(getReal(p.get(), "umbreon.lightIntensity"), 1.2);
    EXPECT_TRUE(getBool(p.get(), "umbreon.useGI"));
    EXPECT_DOUBLE_EQ(getReal(p.get(), "umbreon_npr.lightIntensity"), 1.55);
    EXPECT_FALSE(getBool(p.get(), "umbreon_npr.useGI"));
    EXPECT_TRUE(getStr(p.get(), "umbreon_npr.hatchStyle").equals("richardson"));
}

TEST_F(RenderSettingsTest, UntouchedIsOmittedFromFile)
{
    SceneAppDataPtr p = m_pScene->getCreateAppData(APP_ID, APP_CLASS);
    ASSERT_FALSE(p.isnull());
    const std::string path = tmpQsc("cuemol_render_settings_untouched.qsc");

    // Nothing changed: the element carries no property and no block.
    std::string xml = saveToFile(path);
    EXPECT_NE(xml.find("<appdata"), std::string::npos) << xml;
    EXPECT_EQ(xml.find("<povray"), std::string::npos) << xml;
    EXPECT_EQ(xml.find("<umbreon"), std::string::npos) << xml;
    EXPECT_EQ(xml.find("width="), std::string::npos) << xml;

    // One umbreon value changed: only that block, only that property.
    Child umb(p.get(), "umbreon");
    ASSERT_NE(umb.obj, nullptr);
    EXPECT_TRUE(umb.obj->setPropInt("aoSamples", 128));
    xml = saveToFile(path);
    EXPECT_NE(xml.find("aoSamples=\"128\""), std::string::npos) << xml;
    EXPECT_EQ(xml.find("supersample="), std::string::npos) << xml;
    EXPECT_EQ(xml.find("<povray"), std::string::npos) << xml;
    EXPECT_EQ(xml.find("<umbreon_npr"), std::string::npos) << xml;
    EXPECT_EQ(xml.find("backend="), std::string::npos) << xml;

    // Back to the default through resetProperty: gone from the file again.
    EXPECT_TRUE(umb.obj->resetProperty("aoSamples"));
    xml = saveToFile(path);
    EXPECT_EQ(xml.find("aoSamples="), std::string::npos) << xml;
    std::remove(path.c_str());
}

TEST_F(RenderSettingsTest, RoundTripThroughQscFile)
{
    SceneAppDataPtr p = m_pScene->getCreateAppData(APP_ID, APP_CLASS);
    ASSERT_FALSE(p.isnull());
    EXPECT_TRUE(p->setPropStr("backend", "umbreon_npr"));
    EXPECT_TRUE(p->setPropReal("width", 3.5));
    EXPECT_TRUE(p->setPropStr("unit", "in"));
    Child umb(p.get(), "umbreon");
    ASSERT_NE(umb.obj, nullptr);
    EXPECT_TRUE(umb.obj->setPropInt("aoSamples", 128));
    EXPECT_TRUE(umb.obj->setPropBool("useGI", false));
    Child npr(p.get(), "umbreon_npr");
    ASSERT_NE(npr.obj, nullptr);
    EXPECT_TRUE(npr.obj->setPropStr("hatchLayersSpec", LAYER_SPEC));

    const std::string path = tmpQsc("cuemol_render_settings_test.qsc");
    saveToFile(path);

    ScenePtr pScene2 = SceneManager::getInstance()->createScene();
    {
        qsys::SceneXMLReader r;
        r.setPath(path.c_str());
        r.attach(pScene2);
        r.read();
        r.detach();
        EXPECT_TRUE(r.getErrMsg().isEmpty()) << r.getErrMsg().c_str();
    }
    SceneAppDataPtr p2 = pScene2->getAppData(APP_ID);
    ASSERT_FALSE(p2.isnull());
    EXPECT_TRUE(getStr(p2.get(), "backend").equals("umbreon_npr"));
    EXPECT_DOUBLE_EQ(getReal(p2.get(), "width"), 3.5);
    EXPECT_TRUE(getStr(p2.get(), "unit").equals("in"));
    EXPECT_EQ(getInt(p2.get(), "umbreon.aoSamples"), 128);
    EXPECT_FALSE(getBool(p2.get(), "umbreon.useGI"));
    // untouched values come back as the declared defaults, the multi-line
    // spec survives the XML attribute round trip
    EXPECT_EQ(getInt(p2.get(), "umbreon.supersample"), 3);
    EXPECT_DOUBLE_EQ(getReal(p2.get(), "povray.lightIntensity"), 1.3);
    EXPECT_TRUE(getStr(p2.get(), "umbreon_npr.hatchLayersSpec").equals(LAYER_SPEC));
    EXPECT_FALSE(pScene2->isModified());  // loading is not an edit
    destroy(pScene2);
    std::remove(path.c_str());
}

TEST_F(RenderSettingsTest, ToleratesUnknownAndInvalidProps)
{
    qlib::LDom2Tree tree("scene");
    qlib::LDom2Node *pCh = tree.top()->appendChild("appdata");
    pCh->setStrAttr("id", APP_ID);
    pCh->setTypeName(APP_CLASS);
    pCh->setStrAttr("width", "800");         // valid
    pCh->setStrAttr("noSuchTop", "1");       // unknown (top level)
    qlib::LDom2Node *pUmb = pCh->appendChild("umbreon");
    pUmb->setTypeName("UmbreonRenderSettings");
    pUmb->setStrAttr("aoSamples", "abc");    // wrong type
    pUmb->setStrAttr("noSuchProp", "1");     // unknown (nested)
    pUmb->setStrAttr("supersample", "5");    // valid

    tree.deserialize(m_pScene.get());

    SceneAppDataPtr p = m_pScene->getAppData(APP_ID);
    ASSERT_FALSE(p.isnull());
    EXPECT_DOUBLE_EQ(getReal(p.get(), "width"), 800.0);
    EXPECT_EQ(getInt(p.get(), "umbreon.supersample"), 5);
    EXPECT_EQ(getInt(p.get(), "umbreon.aoSamples"), 64);  // declared default kept

    LString msgs = tree.top()->getErrorMsgs();
    EXPECT_NE(msgs.indexOf("'noSuchTop'"), -1) << msgs.c_str();
    EXPECT_NE(msgs.indexOf("'umbreon.aoSamples'"), -1) << msgs.c_str();
    EXPECT_NE(msgs.indexOf("'umbreon.noSuchProp'"), -1) << msgs.c_str();
    EXPECT_EQ(msgs.indexOf("supersample"), -1) << msgs.c_str();
    EXPECT_EQ(msgs.indexOf("'umbreon'"), -1) << msgs.c_str();  // the block itself is not reported
}

TEST_F(RenderSettingsTest, PropertyEditIsUndoable)
{
    SceneAppDataPtr p = m_pScene->getCreateAppData(APP_ID, APP_CLASS);
    ASSERT_FALSE(p.isnull());
    Child umb(p.get(), "umbreon");
    ASSERT_NE(umb.obj, nullptr);

    // outside a txn nothing is recorded (the GUI always opens one)
    EXPECT_TRUE(umb.obj->setPropInt("aoSamples", 48));
    EXPECT_EQ(m_pScene->getUndoSize(), 0);
    EXPECT_FALSE(m_pScene->isModified());
    EXPECT_TRUE(umb.obj->resetProperty("aoSamples"));

    m_pScene->startUndoTxn("Change render settings");
    EXPECT_TRUE(umb.obj->setPropInt("aoSamples", 32));  // child object
    EXPECT_TRUE(p->setPropReal("width", 800.0));         // parent
    m_pScene->commitUndoTxn();

    EXPECT_EQ(m_pScene->getUndoSize(), 1);
    EXPECT_TRUE(m_pScene->isModified());

    EXPECT_TRUE(m_pScene->undo(0));
    EXPECT_EQ(getInt(p.get(), "umbreon.aoSamples"), 64);
    EXPECT_TRUE(umb.obj->isPropDefault("aoSamples"));  // back to "not stored"
    EXPECT_DOUBLE_EQ(getReal(p.get(), "width"), 1200.0);
    EXPECT_FALSE(m_pScene->isModified());

    EXPECT_TRUE(m_pScene->redo(0));
    EXPECT_EQ(getInt(p.get(), "umbreon.aoSamples"), 32);
    EXPECT_DOUBLE_EQ(getReal(p.get(), "width"), 800.0);
    EXPECT_TRUE(m_pScene->isModified());
}

TEST_F(RenderSettingsTest, PropertyEditFiresSceneEvent)
{
    RecordingListener lsn;
    m_pScene->addListener(&lsn);

    SceneAppDataPtr p = m_pScene->getCreateAppData(APP_ID, APP_CLASS);
    ASSERT_FALSE(p.isnull());
    EXPECT_EQ(lsn.countAppData(), 0);

    Child umb(p.get(), "umbreon");
    ASSERT_NE(umb.obj, nullptr);
    m_pScene->startUndoTxn("edit");
    EXPECT_TRUE(umb.obj->setPropInt("aoSamples", 32));
    m_pScene->commitUndoTxn();
    ASSERT_EQ(lsn.countAppData(), 1);
    const RecordingListener::Rec &r = lsn.recs.front();
    EXPECT_TRUE(r.descr.equals(APP_ID));
    EXPECT_TRUE(r.parent.equals("umbreon"));
    EXPECT_TRUE(r.propname.equals("aoSamples"));

    // undo replays the property and reports it again
    EXPECT_TRUE(m_pScene->undo(0));
    EXPECT_EQ(lsn.countAppData(), 2);

    // loading a scene fires nothing
    qlib::LDom2Tree tree("scene");
    tree.serialize(m_pScene.get(), false);
    ScenePtr pScene2 = SceneManager::getInstance()->createScene();
    RecordingListener lsn2;
    pScene2->addListener(&lsn2);
    tree.deserialize(pScene2.get());
    EXPECT_EQ(lsn2.countAppData(), 0);
    pScene2->removeListener(&lsn2);
    destroy(pScene2);

    m_pScene->removeListener(&lsn);
}
