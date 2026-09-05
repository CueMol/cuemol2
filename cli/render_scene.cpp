//
//  Headless scene rendering (qsc -> PNG) with the umbreon ray tracer
//

#include <common.h>

#include "render_scene.hpp"

#include <libcuemol2_api/binding.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVariant.hpp>
#include <qsys/Camera.hpp>
#include <qsys/InOutHandler.hpp>
#include <qsys/Scene.hpp>
#include <qsys/SceneAppData.hpp>
#include <qsys/SceneExporter.hpp>
#include <qsys/StreamManager.hpp>
#include <qsys/command/LoadSceneCommand.hpp>

namespace cuetty {

using qlib::LString;

int renderSceneToPng(const std::string &qscPath, const std::string &outPng,
                     const RenderOpts &opts)
{
    // Load the scene. m_fileFmt is deliberately left empty so the command
    // guesses the format from the file name: the registered scene-reader
    // nickname is "qsc_xml", not "qsc", and a wrong nickname makes
    // StreamManager::createHandler return null.
    qsys::LoadSceneCommand cmd;
    cmd.m_filePath = qscPath.c_str();
    cmd.run();

    qsys::ScenePtr pScene = cmd.m_pResScene;
    if (pScene.isnull()) {
        LOG_DPRINTLN("render> cannot load scene file: %s", qscPath.c_str());
        return 1;
    }

    const LString camName(opts.camera.c_str());
    if (!pScene->hasCamera(camName)) {
        LOG_DPRINTLN("render> scene has no camera named '%s'", opts.camera.c_str());
        return 1;
    }
    qsys::CameraPtr pCam = pScene->getCamera(camName);

    // umbreon renders in-process and writes the PNG itself. Its writer is only
    // registered when libcuemol2 is built with ENABLE_UMBREON=ON, so a null
    // handler here means the backend is missing rather than a bad name.
    auto pHandler = qsys::StreamManager::getInstance()->createHandler(
        "umbreon", qsys::InOutHandler::IOH_CAT_RENDTOFILE);
    auto *pExporter = dynamic_cast<qsys::SceneExporter *>(pHandler.get());
    if (pExporter == nullptr) {
        LOG_DPRINTLN(
            "render> umbreon exporter is not available; "
            "libcuemol2 must be built with ENABLE_UMBREON=ON");
        return 1;
    }

    // Configure the exporter from the scene's render settings (Scene app data
    // "render", what the tritium Rendering window stores per scene), or from
    // the RenderSettings class defaults -- the window's starting point for a
    // scene without settings of its own -- so the image is what the GUI would
    // render. The mapping is UmbreonSceneExporter::applyRenderSettings, shared
    // with the GUI and the Python module; it is reached through the scriptable
    // interface because the render module's headers are not installed.
    if (!pExporter->hasMethod("applyRenderSettings")) {
        LOG_DPRINTLN("render> this build has no applyRenderSettings API");
        return 1;
    }
    qsys::SceneAppDataPtr pStored = pScene->getAppData("render");
    const bool bStored = !pStored.isnull();
    LString backend;
    {
        qlib::LVarArgs args(2);
        if (bStored) {
            // the scene keeps the object alive across the call
            args.at(0).shareObjectPtr(&pStored);
        } else {
            // A transient object at the class defaults. A render is not an
            // edit, so no settings holder is created in the scene.
            qlib::LScriptable *pFresh = nullptr;
            LString errmsg;
            if (!cuemol2::createObj("RenderSettings", "", &pFresh, errmsg)) {
                LOG_DPRINTLN("render> cannot create RenderSettings: %s",
                             errmsg.c_str());
                return 1;
            }
            args.at(0).setObjectPtr(pFresh);  // owned by the variant
        }
        args.at(1).setStringValue("");  // backend block: the scene's choice
        pExporter->invokeMethod("applyRenderSettings", args);
        backend = args.retval().getStringValue();
    }

    if (!bStored) {
        // No settings of its own: as the Rendering window does for such a
        // scene, follow the projection the scene's camera was saved with.
        // View::setCameraAnim copies the whole Camera (perspec included) into
        // the view's current camera, so the saved camera records what the GL
        // view showed.
        pExporter->setProperty("perspective", qlib::LVariant(pCam->isPerspec()));
    }

    // Command-line overrides
    if (opts.width > 0) pExporter->setWidth(opts.width);
    if (opts.height > 0) pExporter->setHeight(opts.height);
    pExporter->setCameraName(camName);

    LOG_DPRINTLN("render> %s render settings, backend '%s', %dx%d, camera '%s'",
                 bStored ? "scene" : "default", backend.c_str(),
                 pExporter->getWidth(), pExporter->getHeight(),
                 opts.camera.c_str());

    pExporter->attach(pScene);
    try {
        pExporter->setPath(outPng.c_str());
        pExporter->write();
    } catch (...) {
        pExporter->detach();
        throw;
    }
    pExporter->detach();

    LOG_DPRINTLN("render> wrote %s (%dx%d)", outPng.c_str(), pExporter->getWidth(),
                 pExporter->getHeight());
    return 0;
}

}  // namespace cuetty
