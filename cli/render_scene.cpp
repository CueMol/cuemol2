//
//  Headless scene rendering (qsc -> PNG) with the umbreon ray tracer
//

#include <common.h>

#include "render_scene.hpp"

#include <qlib/LVariant.hpp>
#include <qsys/Camera.hpp>
#include <qsys/InOutHandler.hpp>
#include <qsys/Scene.hpp>
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

    pExporter->setWidth(opts.width);
    pExporter->setHeight(opts.height);
    pExporter->setCameraName(camName);

    // Follow the projection the scene was saved with. View::setCameraAnim
    // copies the whole Camera (perspec included) into the view's current
    // camera, so this is what the GL view showed; the exporter's own
    // perspective property defaults to true regardless. Set through the
    // scriptable interface because it belongs to UmbreonSceneExporter, whose
    // header the render module does not install.
    pExporter->setProperty("perspective", qlib::LVariant(pCam->isPerspec()));

    pExporter->attach(pScene);
    try {
        pExporter->setPath(outPng.c_str());
        pExporter->write();
    } catch (...) {
        pExporter->detach();
        throw;
    }
    pExporter->detach();

    LOG_DPRINTLN("render> wrote %s (%dx%d, camera '%s')", outPng.c_str(),
                 opts.width, opts.height, opts.camera.c_str());
    return 0;
}

}  // namespace cuetty
