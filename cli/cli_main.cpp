
#include <common.h>
#include <libcuemol2_api/loader.hpp>

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
void process_input(const LString &loadscr, const std::deque<LString> &args,
                   bool bInvokeIntrShell);

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG "./sysconfig.xml"
#endif

namespace po = boost::program_options;

struct Config
{
    bool interactive;
    std::string input_file;
    std::string config_file;
};

std::optional<Config> parse_arguments(int argc, const char *argv[])
{
    /// argment parser
    po::options_description desc("Allowed options");
    desc.add_options()("help,h", "Show help message")("interactive,i",
                                                      "Run in interactive mode")(
        "input", po::value<std::string>()->default_value(""), "Input file")(
        "config,c", po::value<std::string>()->default_value(""), "Config file");
    // ("output,o", po::value<std::string>()->default_value("out.txt"), "Output file")
    // ("verbose,v", po::bool_switch()->default_value(false), "Enable verbose mode")
    // ("count,n", po::value<int>()->default_value(10), "Number of iterations");

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

    return Config{.interactive = vm.count("interactive") > 0,
                  .input_file = vm["input"].as<std::string>(),
                  .config_file = vm["config"].as<std::string>()};
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

    int i;
    LString loadscr;
    std::deque<LString> args2;

    bool bInvokeIntrShell = config->interactive;
    LString confpath = config->config_file;
    if (confpath.isEmpty()) {
        confpath = DEFAULT_CONFIG;
    }

    // for (i = 1; i < argc; ++i) {
    //     MB_DPRINTLN("arg%d=%s", i, argv[i]);
    //     LString value = argv[i];

    //     if (value.equals("-i")) {
    //         bInvokeIntrShell = true;
    //         continue;
    //     } else if (value.equals("-conf")) {
    //         ++i;
    //         if (i >= argc) break;
    //         confpath = argv[i];
    //         // ++i;
    //         continue;
    //     } else {
    //         break;
    //     }
    // }

    // for (; i < argc; ++i) {
    //     MB_DPRINTLN("arg%d=%s", i, argv[i]);
    //     args2.push_back(argv[i]);
    // }

    // if (args2.size() > 0) loadscr = args2.front();

    int result = cuemol2::init(confpath, true);
    if (result < 0) {
        return result;
    }

    // if (!loadscr.isEmpty()) {
    process_input(loadscr, args2, bInvokeIntrShell);
    //}

    cuemol2::fini();
    cuemol2::fini_qlib();

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

void process_input(const LString &loadscr, const std::deque<LString> &args,
                   bool bInvokeIntrShell)
{
    qsys::SceneManager *pSM = qsys::SceneManager::getInstance();
    LOG_DPRINTLN("CueMol version %s build %s", pSM->getVersion().c_str(),
                 pSM->getBuildID().c_str());

    fs::path scr_path(loadscr.c_str());

    fs::path full_path = fs::system_complete(scr_path);
    if (full_path.extension() == ".qsc") {
        qsys::LoadSceneCommand cmd;
        cmd.m_filePath = full_path.string().c_str();
        cmd.m_fileFmt = "qsc";
        cmd.run();

        // qsys::ScenePtr rscene = pSM->loadSceneFrom(scr_path.string(), "xml");
        // qlib::FileOutStream &fos = qlib::FileOutStream::getStdErr();
        // rscene->writeTo(fos, true);
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
