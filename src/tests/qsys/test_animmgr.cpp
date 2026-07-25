#include <gtest/gtest.h>
#include <common.h>

#include "qsys/Renderer.hpp"
#include "qsys/Scene.hpp"
#include "qsys/SceneExporter.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/anim/AnimMgr.hpp"
#include "qsys/anim/PropAnim.hpp"

#include <qlib/EventManager.hpp>
#include <qlib/LScrTime.hpp>
#include <qlib/Vector4D.hpp>

using qlib::LString;
using qsys::AnimMgr;
using qsys::AnimObjPtr;
using qsys::RendererPtr;
using qsys::SceneManager;
using qsys::ScenePtr;
using qsys::ViewPtr;

namespace {

const qlib::time_value ANIM_LEN = 1000;
const double ORIG_ALPHA = 0.25;
const double ANIM_START = 0.5;
const double ANIM_END = 1.0;

/// TimerImpl whose clock the test controls. AnimMgr::start() reads
/// getCurrentTime(), which dereferences a null impl without this.
class MockTimerImpl : public qlib::TimerImpl
{
public:
    qlib::time_value m_now = 0;

    qlib::time_value getCurrentTime() override { return m_now; }
    void start(qlib::time_value /*period*/) override {}
    void stop() override {}
};

/// EventManager holds one TimerImpl for the whole process and asserts on a
/// second initTimer(), so the mock is installed once and shared by all cases.
MockTimerImpl *getMockTimer()
{
    static MockTimerImpl *s_pTimer = nullptr;
    if (s_pTimer == nullptr) {
        s_pTimer = MB_NEW MockTimerImpl();
        qlib::EventManager::getInstance()->initTimer(s_pTimer);
    }
    return s_pTimer;
}

/// Renderer used as an animation target. "alpha" and "visible" are
/// inherited from Renderer, so no extra property registration is needed.
class TestRenderer : public qsys::Renderer
{
public:
    const char *getTypeName() const override { return "animtest"; }
    bool isCompatibleObj(qsys::ObjectPtr) const override { return false; }
    qlib::Vector4D getCenter() const override { return qlib::Vector4D(); }
    void display(gfx::DisplayContext *) override {}
    void unloading() override {}
    qlib::LCloneableObject *clone() const override { return nullptr; }
};

double getAlpha(qlib::uid_t uid)
{
    RendererPtr pRend = SceneManager::getRendererS(uid);
    double value = -1.0;
    if (!pRend.isnull())
        pRend->getPropReal("alpha", value);
    return value;
}

void setAlpha(qlib::uid_t uid, double value)
{
    RendererPtr pRend = SceneManager::getRendererS(uid);
    if (!pRend.isnull())
        pRend->setPropReal("alpha", value);
}

bool getVisible(qlib::uid_t uid)
{
    RendererPtr pRend = SceneManager::getRendererS(uid);
    bool value = true;
    if (!pRend.isnull())
        pRend->getPropBool("visible", value);
    return value;
}

/// PropAnim animating "alpha" of a single renderer.
/// When m_bAlsoVisible is set it declares "visible" in onPropSave() as well
/// and flips it in onPropInit(), mirroring ShowHideAnim, whose writes are
/// not fully described by getPropName().
class TestPropAnim : public qsys::PropAnim
{
public:
    qlib::uid_t m_tgtUID;
    bool m_bAlsoVisible;
    bool m_bAlsoXform;
    int m_nSaveCalls;

    explicit TestPropAnim(qlib::uid_t uid)
         : m_tgtUID(uid), m_bAlsoVisible(false), m_bAlsoXform(false),
           m_nSaveCalls(0)
    {
    }

    qlib::LCloneableObject *clone() const override { return nullptr; }

    LString getPropName() const override { return LString("alpha"); }

    void getTgtUIDs(AnimMgr *, std::vector<qlib::uid_t> &arry) override
    {
        arry.push_back(m_tgtUID);
    }

    void onPropInit(AnimMgr *, qlib::uid_t tgt_uid) override
    {
        setAlpha(tgt_uid, ANIM_START);

        RendererPtr pRend = SceneManager::getRendererS(tgt_uid);
        if (pRend.isnull())
            return;

        if (m_bAlsoVisible)
            pRend->setPropBool("visible", false);

        if (m_bAlsoXform) {
            qlib::Matrix4D mat;
            mat.translate(qlib::Vector4D(1.0, 2.0, 3.0));
            pRend->setXformMatrix(mat);
        }
    }

    void onPropSave(AnimMgr *pMgr, qlib::uid_t tgt_uid) override
    {
        ++m_nSaveCalls;
        pMgr->savePropVal(tgt_uid, getPropName());
        if (m_bAlsoVisible)
            pMgr->savePropVal(tgt_uid, LString("visible"));
        if (m_bAlsoXform)
            pMgr->savePropVal(tgt_uid, LString("xformMat"));
    }

    void onStart(qlib::time_value, AnimMgr *) override
    {
        setAlpha(m_tgtUID, ANIM_START);
    }

    void onEnd(qlib::time_value, AnimMgr *) override
    {
        setAlpha(m_tgtUID, ANIM_END);
    }

    void onTimer(qlib::time_value elapsed, AnimMgr *) override
    {
        const double rho = getRho(elapsed);
        setAlpha(m_tgtUID, ANIM_START * (1.0 - rho) + ANIM_END * rho);
    }
};

/// SceneExporter recording how the frame-writing path drove it. Stands in
/// for a real exporter (POV / umbreon) in the offline-rendering tests.
class MockSceneExporter : public qsys::SceneExporter
{
public:
    int m_nWriteCalls = 0;
    /// Whether write() saw an attached scene and a frame camera.
    bool m_bAttachedOnWrite = false;
    bool m_bCameraOnWrite = false;

    void write() override
    {
        ++m_nWriteCalls;
        m_bAttachedOnWrite = !getClient().isnull();
        m_bCameraOnWrite = !getCamera().isnull();
    }

    const char *getName() const override { return "animmock"; }
    const char *getTypeDescr() const override { return "Mock exporter"; }
    const char *getFileExt() const override { return "*.mock"; }
};

}  // namespace

class AnimMgrRestoreTest : public ::testing::Test
{
protected:
    ScenePtr m_pScene;
    RendererPtr m_pRend;
    qlib::uid_t m_rendUID;
    AnimMgr *m_pMgr;
    TestPropAnim *m_pAnim;

    void SetUp() override
    {
        getMockTimer()->m_now = 0;

        m_pScene = SceneManager::getInstance()->createScene();

        m_pRend = RendererPtr(MB_NEW TestRenderer());
        m_rendUID = m_pRend->getUID();
        setAlpha(m_rendUID, ORIG_ALPHA);

        m_pMgr = m_pScene->getAnimMgr().get();
        m_pMgr->setLength(ANIM_LEN);

        m_pAnim = MB_NEW TestPropAnim(m_rendUID);
        m_pAnim->setAbsStart(0);
        m_pAnim->setAbsEnd(ANIM_LEN);
        m_pMgr->append(AnimObjPtr(m_pAnim));
    }

    void TearDown() override
    {
        if (!m_pScene.isnull()) {
            const qlib::uid_t uid = m_pScene->getUID();
            m_pMgr = nullptr;
            m_pScene = ScenePtr();
            SceneManager::getInstance()->destroyScene(uid);
        }
        m_pRend = RendererPtr();
    }

    /// Drive the animation to its natural end (the bLast branch of onTimer,
    /// which does not go through stop()). The mock clock starts at 0, so the
    /// elapsed time seen by onTimer() is exactly the animation length.
    void runToEnd() { m_pMgr->onTimer(1.0, ANIM_LEN, true); }
};

// A full stop returns the scene to its pre-animation state.
TEST_F(AnimMgrRestoreTest, StopRestoresOriginalValue)
{
    m_pMgr->start(ViewPtr());
    EXPECT_NE(getAlpha(m_rendUID), ORIG_ALPHA);

    m_pMgr->stop();
    EXPECT_DOUBLE_EQ(getAlpha(m_rendUID), ORIG_ALPHA);
}

// Playback that runs to its natural end restores too. This path resets the
// state inline instead of calling stop(), so it needs its own restore.
TEST_F(AnimMgrRestoreTest, NaturalEndRestoresOriginalValue)
{
    m_pMgr->start(ViewPtr());
    runToEnd();

    EXPECT_EQ(m_pMgr->getPlayState(), AnimMgr::AM_STOP);
    EXPECT_DOUBLE_EQ(getAlpha(m_rendUID), ORIG_ALPHA);
}

// Pausing keeps the current frame's values: a paused animation is still
// "in progress" from the user's point of view.
TEST_F(AnimMgrRestoreTest, PauseKeepsAnimatedValue)
{
    m_pMgr->start(ViewPtr());
    m_pMgr->pause();

    EXPECT_NE(getAlpha(m_rendUID), ORIG_ALPHA);
}

// goTime() ends by calling pause(), and pause() drops to AM_STOP when no
// time remains. Seeking must not revert, so the restore is tied to the
// explicit stop() call rather than to reaching AM_STOP.
TEST_F(AnimMgrRestoreTest, SeekToEndKeepsAnimatedValue)
{
    m_pMgr->goTime(ANIM_LEN, ViewPtr());

    EXPECT_DOUBLE_EQ(getAlpha(m_rendUID), ANIM_END);

    // ... and a later stop() still gets back to the original value.
    m_pMgr->stop();
    EXPECT_DOUBLE_EQ(getAlpha(m_rendUID), ORIG_ALPHA);
}

// Each lap of a loop playback re-runs startImpl(); the saved values must
// survive so that a stop on lap N restores the state from before lap 1.
TEST_F(AnimMgrRestoreTest, LoopDoesNotOverwriteSavedValue)
{
    m_pMgr->setLoop(true);
    m_pMgr->start(ViewPtr());

    runToEnd();  // lap 1 done -> start() again
    runToEnd();  // lap 2 done -> start() again

    EXPECT_EQ(m_pAnim->m_nSaveCalls, 1);

    m_pMgr->setLoop(false);
    m_pMgr->stop();
    EXPECT_DOUBLE_EQ(getAlpha(m_rendUID), ORIG_ALPHA);
}

// getPropName() is not always the full set of what an anim writes
// (ShowHideAnim also writes "alpha", RendXformAnim writes "xformMat"), so a
// subclass can declare extra properties and they must be restored as well.
TEST_F(AnimMgrRestoreTest, RestoresPropertiesBeyondGetPropName)
{
    m_pAnim->m_bAlsoVisible = true;
    ASSERT_TRUE(getVisible(m_rendUID));

    m_pMgr->start(ViewPtr());
    EXPECT_FALSE(getVisible(m_rendUID));

    m_pMgr->stop();
    EXPECT_TRUE(getVisible(m_rendUID));
    EXPECT_DOUBLE_EQ(getAlpha(m_rendUID), ORIG_ALPHA);
}

// "xformMat" (Renderer.qif) is an object-valued property, so saving it makes
// LVariant deep-copy a Matrix. RendXformAnim / SlideInOutAnim depend on this
// path: an object type whose copy() is unavailable would break the restore.
TEST_F(AnimMgrRestoreTest, RestoresObjectValuedProperty)
{
    // aij(1,4) is the x translation; isIdentAffine() only inspects the 3x3
    // rotation block, so it cannot see the change made here.
    m_pAnim->m_bAlsoXform = true;
    ASSERT_DOUBLE_EQ(m_pRend->getXformMatrix().aij(1, 4), 0.0);

    m_pMgr->start(ViewPtr());
    EXPECT_DOUBLE_EQ(m_pRend->getXformMatrix().aij(1, 4), 1.0);

    m_pMgr->stop();
    EXPECT_DOUBLE_EQ(m_pRend->getXformMatrix().aij(1, 4), 0.0);
}

// A renderer deleted while the animation runs must not crash the restore.
TEST_F(AnimMgrRestoreTest, DeletedTargetIsSkipped)
{
    m_pMgr->start(ViewPtr());

    // Drop the last reference to the target renderer.
    m_pRend = RendererPtr();

    EXPECT_NO_THROW(m_pMgr->stop());
}

// A playback abandoned without stop() (the render dialog closed mid-run, or
// a fatal error) must not leave a stale save behind: the next playback saves
// the scene as it is at that point.
TEST_F(AnimMgrRestoreTest, AbandonedPlaybackDoesNotLeaveStaleSave)
{
    // First render, never stopped.
    m_pMgr->setupRender(qlib::LScrTime(0), qlib::LScrTime(ANIM_LEN), 10.0);

    // The user edits the scene, then starts a second render.
    const double newOrig = 0.75;
    setAlpha(m_rendUID, newOrig);
    m_pMgr->setupRender(qlib::LScrTime(0), qlib::LScrTime(ANIM_LEN), 10.0);

    m_pMgr->stop();

    // Restores what the scene looked like when the second render began,
    // not the value from before the abandoned first one.
    EXPECT_DOUBLE_EQ(getAlpha(m_rendUID), newOrig);
}

// The offline-rendering entry point shares startImpl(), so it saves the
// same values; the render driver only has to call stop() when it is done.
TEST_F(AnimMgrRestoreTest, SetupRenderThenStopRestores)
{
    const int nframes =
        m_pMgr->setupRender(qlib::LScrTime(0), qlib::LScrTime(ANIM_LEN), 10.0);
    EXPECT_GT(nframes, 0);
    EXPECT_NE(getAlpha(m_rendUID), ORIG_ALPHA);

    m_pMgr->stop();
    EXPECT_DOUBLE_EQ(getAlpha(m_rendUID), ORIG_ALPHA);
}

// writeFrame() is beginFrame() + write() + endFrame(): the synchronous path
// still hands the exporter an attached scene and the frame's camera, then
// releases it and advances the sequence.
TEST_F(AnimMgrRestoreTest, WriteFrameAttachesSceneAndCamera)
{
    m_pMgr->setupRender(qlib::LScrTime(0), qlib::LScrTime(ANIM_LEN), 10.0);

    MockSceneExporter *pExp = MB_NEW MockSceneExporter();
    qlib::LScrSp<qsys::SceneExporter> pWriter(pExp);

    const int frame0 = m_pMgr->getFrameNo();
    m_pMgr->writeFrame(pWriter);

    EXPECT_EQ(pExp->m_nWriteCalls, 1);
    EXPECT_TRUE(pExp->m_bAttachedOnWrite);
    EXPECT_TRUE(pExp->m_bCameraOnWrite);
    EXPECT_TRUE(pExp->getClient().isnull());
    EXPECT_EQ(m_pMgr->getFrameNo(), frame0 + 1);

    m_pMgr->stop();
}

// An asynchronous exporter renders between beginFrame() and endFrame(), so
// the frame state must hold across that whole interval: only endFrame()
// detaches the scene and consumes the frame.
TEST_F(AnimMgrRestoreTest, BeginFrameHoldsStateUntilEndFrame)
{
    m_pMgr->setupRender(qlib::LScrTime(0), qlib::LScrTime(ANIM_LEN), 10.0);

    MockSceneExporter *pExp = MB_NEW MockSceneExporter();
    qlib::LScrSp<qsys::SceneExporter> pWriter(pExp);

    const int frame0 = m_pMgr->getFrameNo();
    ASSERT_TRUE(m_pMgr->beginFrame(pWriter));

    EXPECT_FALSE(pExp->getClient().isnull());
    EXPECT_FALSE(pExp->getCamera().isnull());
    EXPECT_EQ(pExp->m_nWriteCalls, 0);
    EXPECT_EQ(m_pMgr->getFrameNo(), frame0);

    m_pMgr->endFrame(pWriter);

    EXPECT_TRUE(pExp->getClient().isnull());
    EXPECT_EQ(m_pMgr->getFrameNo(), frame0 + 1);

    m_pMgr->stop();
}

// The frame loop terminates: once the sequence set up by setupRender() is
// exhausted, beginFrame() reports false instead of rendering another frame.
TEST_F(AnimMgrRestoreTest, BeginFrameStopsAtEndOfSequence)
{
    const int nframes =
        m_pMgr->setupRender(qlib::LScrTime(0), qlib::LScrTime(ANIM_LEN), 10.0);
    ASSERT_GT(nframes, 0);

    MockSceneExporter *pExp = MB_NEW MockSceneExporter();
    qlib::LScrSp<qsys::SceneExporter> pWriter(pExp);

    for (int i = 0; i < nframes; ++i) {
        ASSERT_TRUE(m_pMgr->beginFrame(pWriter));
        m_pMgr->endFrame(pWriter);
    }

    EXPECT_FALSE(m_pMgr->beginFrame(pWriter));

    m_pMgr->stop();
}
