
#include <common.h>
#include <libcuemol2_api/loader.hpp>

#include "render_scene.hpp"

#include <iostream>
#include <string>
#include <optional>

#include <boost/filesystem/path.hpp>
#include <boost/filesystem/operations.hpp>
#include <boost/program_options.hpp>

#include <qlib/qlib.hpp>
#include <qlib/FileStream.hpp>

#include <qsys/qsys.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/command/LoadSceneCommand.hpp>
#include <qsys/SysConfig.hpp>

#ifdef ENABLE_PYTHON_EMBED
#include <pybr/PythonBridge.hpp>
#endif

using qlib::LString;
void process_input(const LString &loadscr, bool bInvokeIntrShell);

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG "./sysconfig.xml"
#endif

namespace po = boost::program_options;

struct Config
{
    bool interactive;
    std::string input_file;
    std::string config_file;

    /// Output PNG path; non-empty selects headless render mode.
    std::string render_file;
    int width;
    int height;
    std::string camera;
};

std::optional<Config> parse_arguments(int argc, const char *argv[])
{
    /// argment parser
    po::options_description desc("Allowed options");
    const cuetty::RenderOpts defs;
    desc.add_options()("help,h", "Show help message")("interactive,i",
                                                      "Run in interactive mode")(
        "input", po::value<std::string>()->default_value(""), "Input file")(
        "config,c", po::value<std::string>()->default_value(""), "Config file")(
        "render,r", po::value<std::string>()->default_value(""),
        "Render the input scene into this PNG file and exit (headless)")(
        "width", po::value<int>()->default_value(defs.width), "Render width in pixels")(
        "height", po::value<int>()->default_value(defs.height),
        "Render height in pixels")("camera",
                                   po::value<std::string>()->default_value(defs.camera),
                                   "Camera name to render from");

    po::variables_map vm;

    try {
        po::store(po::parse_command_line(argc, argv, desc), vm);

        // Handle help option
        if (vm.count("help")) {
            std::cout << desc << std::endl;
            return std::nullopt;
        }

        po::notify(vm);

    } catch (const po::error &e) {
        std::cerr << "Error: " << e.what() << std::endl;
        std::cerr << desc << std::endl;
        return std::nullopt;
    }

    Config config{vm.count("interactive") > 0,
                  vm["input"].as<std::string>(),
                  vm["config"].as<std::string>(),
                  vm["render"].as<std::string>(),
                  vm["width"].as<int>(),
                  vm["height"].as<int>(),
                  vm["camera"].as<std::string>()};

    if (!config.render_file.empty()) {
        if (config.input_file.empty()) {
            std::cerr << "Error: --render requires --input <scene file>" << std::endl;
            return std::nullopt;
        }
        if (config.width <= 0 || config.height <= 0) {
            std::cerr << "Error: --width and --height must be positive" << std::endl;
            return std::nullopt;
        }
    }

    return config;
}

// //
// if (vm.count("help")) {
//     std::cout << desc << std::endl;
//     return 0;
// }

// if (vm.count("input")) {
//     std::cout << "Input: " << vm["input"].as<std::string>() << std::endl;
// }

///
///   main routine for CueTTY (CLI version)
///
int internal_main(int argc, const char *argv[])
{
    auto config = parse_arguments(argc, argv);
    if (!config) {
        return 1;
    }

    if (cuemol2::init_qlib()) {
        LOG_DPRINTLN("cuemol2::init_qlib OK.");
    } else {
        printf("Init: ERROR!!\n");
        return -1;
    }

    LString confpath = config->config_file;
    if (confpath.isEmpty()) {
        confpath = DEFAULT_CONFIG;
    }

    // Render mode never creates a qsys::View (the umbreon exporter walks the
    // scene through a file DisplayContext), so skip registering the platform's
    // OpenGL view factory and stay headless.
    const bool bRender = !config->render_file.empty();

    int result = cuemol2::init(confpath, !bRender);
    if (result < 0) {
        return result;
    }

    int rc = 0;
    if (bRender) {
        cuetty::RenderOpts opts;
        opts.width = config->width;
        opts.height = config->height;
        opts.camera = config->camera;
        rc = cuetty::renderSceneToPng(config->input_file, config->render_file, opts);
        // Tear the loaded scene down before the modules are finalized below;
        // process_input() does the same for the non-render path. Skipping this
        // crashes in cuemol2::fini().
        qsys::SceneManager::getInstance()->destroyAllScenes();
    } else {
        process_input(config->input_file.c_str(), config->interactive);
    }

    cuemol2::fini();
    cuemol2::fini_qlib();

    if (rc != 0) {
        printf("=== Terminated with error ===\n");
        return rc;
    }

    printf("=== Terminated normaly ===\n");
    return 0;
}

int main(int argc, const char *argv[])
{
    try {
        return internal_main(argc, argv);
    } catch (const qlib::LException &e) {
        LOG_DPRINTLN("Caught exception <%s>", typeid(e).name());
        LOG_DPRINTLN("Reason: %s", e.getMsg().c_str());
    } catch (std::exception &e) {
        LOG_DPRINTLN("Caught exception <%s>", typeid(e).name());
        LOG_DPRINTLN("Reason: %s", e.what());
    } catch (...) {
        LOG_DPRINTLN("Caught unknown exception");
    }
}

namespace fs = boost::filesystem;

void process_input(const LString &loadscr, bool bInvokeIntrShell)
{
    qsys::SceneManager *pSM = qsys::SceneManager::getInstance();
    LOG_DPRINTLN("CueMol version %s build %s", pSM->getVersion().c_str(),
                 pSM->getBuildID().c_str());

    if (!loadscr.isEmpty()) {
        fs::path full_path = fs::system_complete(fs::path(loadscr.c_str()));
        if (full_path.extension() == ".qsc") {
            qsys::LoadSceneCommand cmd;
            cmd.m_filePath = full_path.string().c_str();
            // m_fileFmt is left empty on purpose: the command then guesses the
            // format from the file name. Naming it "qsc" would not resolve --
            // the registered scene-reader nickname is "qsc_xml".
            cmd.run();
        }
    }

    if (bInvokeIntrShell) {
#ifdef ENABLE_PYTHON_EMBED
        MB_DPRINTLN("main> invoking interactive shell ...");
        // invoke interactive shell
        auto *pybr = pybr::PythonBridge::getInstance();
        pybr->runInteractiveShell();
        MB_DPRINTLN("main> interactive shell terminated.");
#else
        LOG_DPRINTLN(
            "main> WARNING: interactive shell is not available "
            "in this build.");
#endif
    }

    MB_DPRINTLN("main> cleanup ...");
    pSM->destroyAllScenes();
    MB_DPRINTLN("main> cleanup done.");
}
