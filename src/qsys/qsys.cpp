//
// qsys library-related routines
//


#include <common.h>

#include "qsys.hpp"
#include "SceneManager.hpp"
#include "StreamManager.hpp"
#include "RendererFactory.hpp"
#include "SysConfig.hpp"
#include "SceneXMLReader.hpp"
#include "SceneXMLWriter.hpp"
#include "ViewInputConfig.hpp"
#include "RendGroup.hpp"

#include <qlib/FileStream.hpp>
#include <gfx/gfx.hpp>
#include "style/StyleMgr.hpp"
#include "style/StyleFile.hpp"
#include "command/CmdMgr.hpp"
#include "command/NewSceneCommand.hpp"
#include "command/NewRendererCommand.hpp"
#include "command/LoadSceneCommand.hpp"
#include "command/LoadObjectCommand.hpp"

extern void qsys_regClasses();
extern void qsys_unregClasses();

using namespace qsys;

namespace {

void loadSysConfig(const LString &path)
{
  SysConfig *ptab = SysConfig::getInstance();

  qlib::FileInStream fis;
  try {
    fis.open(path);
  }
  catch (qlib::LException &e) {
    LOG_DPRINT("SysConfig> cannot open file %s\n",path.c_str());
    LOG_DPRINT("SysConfig>   (reason: %s)\n", e.getMsg().c_str());
    return;
  }

  try {
    ptab->read(fis);
  }
  catch (qlib::LException &e) {
    LOG_DPRINT("SysConfig> cannot read file %s\n",path.c_str());
    LOG_DPRINT("SysConfig>   (reason: %s)\n", e.getMsg().c_str());
    return;
  }

  MB_DPRINTLN("SysConfig> Read \"%s\" successfully.", path.c_str());

  // set config_dir prop

  LString fdir;
  int spos = path.lastIndexOf(MB_PATH_SEPARATOR);
  if (spos>0)
    fdir = path.substr(0, spos);
  if (fdir.isEmpty())
    fdir = ".";

  MB_DPRINTLN("SysConfig> config_dir: \"%s\"", fdir.c_str());
  ptab->put("config_dir", fdir);
}

bool loadStyle()
{
  SysConfig *pconf = SysConfig::getInstance();
  SysConfig::Section *psec = pconf->getSection("style");
  bool bOK = false;

  // Set system's style file directory
  if (psec!=NULL) {
    SysConfig::const_iterator iter = psec->begin();
    iter=psec->findName(iter, "style_dir");
    for (; iter!=psec->end(); iter=psec->findName(++iter, "style_dir")) {
      SysConfig::Section *pchild = *iter;
      LString val = pchild->getStringData();
      if (val.isEmpty()) continue;
      val = pconf->convPathName(val);
      MB_DPRINTLN("LoadStyle> System style dir=%s", val.c_str());
      StyleMgr *pMgr = StyleMgr::getInstance();
      pMgr->setDefaultDir(val);
      bOK = true;
      break;
    }
  }

  // Load default system style file (default_style.xml)
  StyleFile sfile;
  if (psec!=NULL) {
    SysConfig::const_iterator iter = psec->begin();
    iter=psec->findName(iter, "style_file");
    for (; iter!=psec->end(); iter=psec->findName(++iter, "style_file")) {
      SysConfig::Section *pchild = *iter;
      LString val = pchild->getStringData();
      if (val.isEmpty())
        continue;
      val = pconf->convPathName(val);
      
      try {
        sfile.loadFile(val, qlib::invalid_uid);
        bOK = true;
      }
      catch (qlib::LException &e) {
        // ignore errors to avoid crash in startup
        LOG_DPRINT("LoadStyle> cannot load style file %s\n", val.c_str());
        LOG_DPRINT("LoadStyle>   (reason: %s)\n", e.getMsg().c_str());
      }
      catch (...) {
        // ignore errors to avoid crash in startup
        LOG_DPRINT("LoadStyle> cannot load style file %s\n", val.c_str());
      }
    }
  }

  return bOK;
}


}

namespace qsys {

bool init(const char *config)
{
  gfx::init();

  ///////////////////
  // initialize qsys

  qsys_regClasses();

  SysConfig::init();
  ViewInputConfig::init();
  ViewInputConfig *pVIC = ViewInputConfig::getInstance();
  pVIC->resetAllProps();

  LString confpath(config);
  if (confpath.isEmpty())
    return false;

  loadSysConfig(confpath);

  if (!RendererFactory::init())
    return false;

  RendererFactory *pRF = RendererFactory::getInstance();
  pRF->regist<RendGroup>();

  StyleMgr::init();
  CmdMgr::init();
  auto pCmdMgr = CmdMgr::getInstance();
  pCmdMgr->regist<NewSceneCommand>();
  pCmdMgr->regist<NewRendererCommand>();
  pCmdMgr->regist<LoadSceneCommand>();
  pCmdMgr->regist<LoadObjectCommand>();

  ///////////////////
  // initialize other services

  loadStyle();

  StreamManager *pSM = StreamManager::getInstance();

  pSM->registReader<SceneXMLReader>();
  pSM->registReader<SceneXMLWriter>();

  SceneManager *pSceMgr = SceneManager::getInstance();

  LOG_DPRINTLN("CueMol2 version %s (%s) build %s\n",
               pSceMgr->getVersion().c_str(),
               pSceMgr->getVerArchName().c_str(),
               pSceMgr->getBuildID().c_str());

  //pVIC->applyStyle("DefaultViewInConf,UserViewConf");

  return true;
}

void fini()
{
  ///////////////////
  // finitialize qsys

  StyleMgr::fini();

  RendererFactory::fini();
  StreamManager::fini();
  SceneManager::fini();

  ViewInputConfig::fini();
  SysConfig::fini();

  qsys_unregClasses();

  gfx::fini();
}

}
