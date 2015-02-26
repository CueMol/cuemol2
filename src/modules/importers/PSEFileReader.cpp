// -*-Mode: C++;-*-
//
//  PyMOL Session File Reader
//
// $Id: SceneXMLReader.cpp,v 1.14 2011/04/10 10:48:09 rishitani Exp $

#include <common.h>

#include "PSEFileReader.hpp"
#include <qsys/StreamManager.hpp>
#include <qsys/SceneEvent.hpp>

#include <qlib/FileStream.hpp>

#include <qlib/RangeSet.hpp>
#include <qlib/Matrix3D.hpp>
#include <qsys/Renderer.hpp>
#include <qsys/Camera.hpp>
#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolRenderer.hpp>
#include <modules/molstr/SelCommand.hpp>
#include <modules/molstr/NameLabelRenderer.hpp>
#include <modules/molvis/AtomIntrRenderer.hpp>

#include <modules/surface/MolSurfObj.hpp>
#include <modules/surface/MolSurfRenderer.hpp>

#include <boost/foreach.hpp>

#include "PickleInStream.hpp"
#include "AtomPropColoring.hpp"
#include "PSEConsts.hpp"

using namespace importers;
using qlib::LDom2Node;
using qlib::LDataSrcContainer;

using qsys::RendererPtr;
using qsys::Camera;
using qsys::CameraPtr;

using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::ResidIndex;

PSEFileReader::PSEFileReader()
{
  m_pSet = NULL;
}

PSEFileReader::~PSEFileReader()
{
}

int PSEFileReader::getCatID() const
{
  return IOH_CAT_SCEREADER;
}

/// attach to and lock the target object
void PSEFileReader::attach(ScenePtr pScene)
{
  // TO DO: lock scene
  m_pClient = pScene;
}
    
/// detach from the target object
ScenePtr PSEFileReader::detach()
{
  // TO DO: unlock scene
  ScenePtr p = m_pClient;
  m_pClient = ScenePtr();
  return p;
}

/// Get name of the reader
const char *PSEFileReader::getName() const
{
  return "psefile";
}

/// Get file-type description
const char *PSEFileReader::getTypeDescr() const
{
  return "PyMOL Session (*.pse)";
}

/// Get file extension
const char *PSEFileReader::getFileExt() const
{
  return "*.pse";
}

//////////////////////////////////////////////////

double PSEFileReader::getRealSetting(int id)
{
  //qlib::LVarList *pTuple = m_pSet->getList(id);
  //MB_ASSERT(pTuple->getInt(0)==id);
  return m_pSet->getReal(id);
}

int PSEFileReader::getIntSetting(int id)
{
  //qlib::LVarList *pTuple = m_pSet->getList(id);
  //MB_ASSERT(pTuple->getInt(0)==id);
  return m_pSet->getInt(id);
}

void PSEFileReader::setupSettingList(qlib::LVarList *pSet)
{
  if (m_pSet==NULL)
    m_pSet = new LVarList;
  else
    m_pSet->clear();
  
  LVarList::iterator iter = pSet->begin();
  LVarList::iterator eiter = pSet->end();
  
  int nmax = 0;
  for (; iter!=eiter; ++iter) {
    qlib::LVarList *pTuple = (*iter)->getListPtr();
    int id = pTuple->getInt(0);
    nmax = qlib::max(nmax, id);
  }

  m_pSet->resize(nmax+1);

  iter = pSet->begin();
  // eiter = pSet->end();

  for (; iter!=eiter; ++iter) {
    qlib::LVarList *pTuple = (*iter)->getListPtr();
    int id = pTuple->getInt(0);
    m_pSet->at(id) = pTuple->at(2);
  }
  
}

void PSEFileReader::read()
{
  //  LOG_DPRINTLN("PSEFileReader> File loaded: %s.", getPath().c_str());

/*
  qsys::SysConfig *pconf = qsys::SysConfig::getInstance();
  LString filename = pconf->convPathName("%%CONFDIR%%/data/python/pse_reader.py");

  pybr::PythonBridge *pb = pybr::PythonBridge::getInstance();
  LString arguments = LString::format("{\"filename\": \"%s\"}", getPath().c_str()); 
  pb->runFile3(filename, m_pClient->getUID(), 0, arguments);
*/
  
  LString localfile = getPath();
  
  qlib::FileInStream fis;
  fis.open(localfile);
  PickleInStream ois(fis);

  LVariant *pTop = ois.getMap();

  if (!pTop->isDict()) {
    delete pTop;
    return;
  }

  LVarDict *pDict = pTop->getDictPtr();

  int ver = pDict->getInt("version");
  LOG_DPRINTLN("PyMOL version %d", ver);

  LVarList *pView = pDict->getList("view");
  // m_pSet = pDict->getList("settings");
  setupSettingList( pDict->getList("settings") );
  procViewSettings(pView);

  LVarList *pNames = pDict->getList("names");
  procNames(pNames);
  
  delete pTop;
  
  //////////
  // fire the scene-loaded event
  {
    qsys::SceneEvent ev;
    ev.setTarget(m_pClient->getUID());
    ev.setType(qsys::SceneEvent::SCE_SCENE_ONLOADED);
    m_pClient->fireSceneEvent(ev);
  }
}

void PSEFileReader::procViewSettings(LVarList *pView)
{
  int i, j, k=0;
  qlib::Matrix3D mat;
  for (j=1; j<=3; ++j) {
    for (i=1; i<=3; ++i) {
      mat.aij(i, j) = pView->getReal(k);
      ++k;
    }
    ++k;
  }
  mat.dump();

  LQuat q = LQuat::makeFromRotMat(mat);
  MB_DPRINTLN("q=%s", q.toString().c_str());

  k+=4;

  qlib::Vector4D vec1;
  for (i=1; i<=3; ++i) {
    vec1.ai(i) = pView->getReal(k);
    ++k;
  }
  MB_DPRINTLN("vec1=%s", vec1.toString().c_str());

  qlib::Vector4D vec2;
  for (i=1; i<=3; ++i) {
    vec2.ai(i) = pView->getReal(k);
    ++k;
  }
  MB_DPRINTLN("vec2=%s", vec2.toString().c_str());

  double slabdist = pView->getReal(k);
  ++k;
  double depthdist = pView->getReal(k);
  ++k;

  double fov = getRealSetting(PSESC_field_of_view);
  double zoom = -vec1.z() * tan(qlib::toRadian(fov));
  bool isOrtho = (bool) getIntSetting(PSESC_ortho);

  CameraPtr pcam(new Camera);
  pcam->setCenter(vec2);
  pcam->setRotQuat(q);
  // pcam->setCamDist(-vec1.z());
  pcam->setSlabDepth(slabdist);
  pcam->setZoom(zoom);
  // pcam->setPerspec(!isOrtho);

  m_pClient->setCamera("__current", pcam);
}

void PSEFileReader::procNames(LVarList *pNames)
{
  LVarList::const_iterator iter = pNames->begin();
  LVarList::const_iterator eiter = pNames->end();

  for (; iter!=eiter; ++iter) {
    LVariant *pElem = *iter;
    if (!pElem->isList()) {
      // ERROR!!
      MB_DPRINTLN("Invalid elem in names");
      continue;
    }
    LVarList *pList = pElem->getListPtr();

    LString name = pList->getString(0);
    int type = pList->getInt(1);
    int visible = pList->getInt(2);
    LVarList *pRepOn = pList->getList(3);
    int extra_int = pList->getInt(4);
    LVarList *pData = pList->getList(5);
    
    MolCoordPtr pPrevMol;

    MB_DPRINTLN("Name %s type=%d", name.c_str(), type);
    if (type == ExecObject) {
      if (extra_int == ObjectMolecule) {
        MolCoordPtr pMol(new MolCoord);
        pMol->setName(name);
        parseObjectMolecule(pData, pMol);
        m_pClient->addObject(pMol);
        pPrevMol = pMol;
      }
      else if (extra_int == ObjectMap) {
        MB_DPRINTLN("ObjectMap");
        //pass
      }
      else if (extra_int == ObjectMesh) {
        MB_DPRINTLN("ObjectMesh");
        // pass
      }
      else if (extra_int == ObjectMeasurement) {
        MB_DPRINTLN("ObjectMeasurement");
        
        MolCoordPtr pMol = pPrevMol;
        if (pMol.isnull()) {
          pMol = MolCoordPtr(new MolCoord);
          pMol->setName("dummy");
          m_pClient->addObject(pMol);
        }
        
        parseObjectMeas(pData, pMol);
      }
    }
    else if (type == ExecSelection) {
      // pass
    }
  }
}

void PSEFileReader::parseObject(LVarList *pData, qsys::ObjectPtr pObj)
{
}

static const int AT_CHAIN = 1;
static const int AT_RESI = 3;
static const int AT_RESN = 5;
static const int AT_NAME = 6;
static const int AT_ELEM = 7;
static const int AT_LABEL = 9;
static const int AT_BFAC = 14;
static const int AT_OCC = 15;
static const int AT_VISREP = 20;
static const int AT_COLOR = 21;

static const int CT_NINDEX = 0;
static const int CT_NATINDEX = 1;
static const int CT_COORD = 2;
static const int CT_IDXTOATM = 3;
static const int CT_ATOMTOIDX = 4;
static const int CT_NAME = 5;


namespace {
  RendererPtr createRends(MolCoordPtr pMol,
                          const qlib::RangeSet<int>&rs,
                          const LString &rendname,
                          const LString &styname)
  {
    RendererPtr pRval;
    if (!rs.isEmpty()) {
      LString str = qlib::rangeToString(rs);
      molstr::MolRendererPtr pRend = pMol->createRenderer(rendname);
      pRend->applyStyles(styname);
      
      molstr::SelectionPtr sel(new molstr::SelCommand("aid "+str));
      pRend->setSelection(sel);
      pRend->setDefaultPropFlag("sel", false);

      molstr::ColoringSchemePtr pColScm(new AtomPropColoring());
      pRend->setColSchm(pColScm);
      pRend->setDefaultPropFlag("coloring", false);

      pRend->setName(rendname+"1");
      pRend->setDefaultPropFlag("name", false);

      pRval = pRend;
    }

    return pRval;
  }

  qsys::ObjectPtr createSurface(qsys::ScenePtr pScene, MolCoordPtr pMol,
                                const qlib::RangeSet<int>&rs)
  {
    if (rs.isEmpty())
      return qsys::ObjectPtr();
    
    surface::MolSurfObj *pmso = new surface::MolSurfObj;
    qsys::ObjectPtr pRval = qsys::ObjectPtr(pmso);
    pScene->addObject(pRval);

    molstr::SelectionPtr sel(new molstr::SelCommand("*"));
    pmso->createSESFromMol(pMol, sel, 1, 1.4);
    LString sfname = pMol->getName() + "_surf";
    pmso->setName(sfname);

    qsys::RendererPtr pRend = pmso->createRenderer("molsurf");
    surface::MolSurfRenderer *pMSRend = static_cast<surface::MolSurfRenderer *>(pRend.get());

    pMSRend->setTgtObjName(pMol->getName());
    pMSRend->setDefaultPropFlag("target", false);

    LString str = qlib::rangeToString(rs);
    molstr::SelectionPtr pShowSel(new molstr::SelCommand("aid "+str));
    pMSRend->setShowSel(pShowSel);
    pMSRend->setDefaultPropFlag("sel", false);

    pMSRend->setColorMode(surface::MolSurfRenderer::SFREND_MOLFANC);
    pMSRend->setDefaultPropFlag("colormode", false);

    molstr::ColoringSchemePtr pColScm(new AtomPropColoring());
    pMSRend->setColSchm(pColScm);
    pMSRend->setDefaultPropFlag("coloring", false);

    return pRval;
  }

  qsys::RendererPtr createLabels(MolCoordPtr pMol, const std::map<int, LString> &labelMap)
  {
    RendererPtr pRval;
    if (labelMap.empty())
      return pRval;

    pRval = pMol->createRenderer("*namelabel");
    pRval->applyStyles("DefaultLabel");
    molstr::NameLabelRenderer *pNRend = static_cast<molstr::NameLabelRenderer*>(pRval.get());

    std::map<int,LString>::const_iterator iter = labelMap.begin();
    std::map<int,LString>::const_iterator eiter = labelMap.end();
    for (; iter!=eiter; ++iter) {
      pNRend->addLabelByID(iter->first, iter->second);
    }

    return pRval;
  }

}


void PSEFileReader::parseObjectMolecule(LVarList *pData, MolCoordPtr pMol)
{
  LVarList *pData0 = pData->getList(0);
  parseObject(pData0, pMol);

  int i; 
  int ncset = pData->getInt(1);
  int nbonds = pData->getInt(2);
  int natoms = pData->getInt(3);

  MB_DPRINTLN("ncset=%d, nbonds=%d, natoms=%d", ncset, nbonds, natoms);

  for (i=0; i<ncset; ++i) {
  }

  for (i=0; i<nbonds; ++i) {
  }

  LVarList *pCSet = pData->getList(4)->getList(0);
  LVarList *pCoord = pCSet->getList(CT_COORD);
  //int nIndex = pCSet->getInt(CT_NINDEX);
  //int nAtIndex = pCSet->getInt(CT_NATINDEX);
  LVarList *pIdxToAtm = pCSet->getList(CT_IDXTOATM);
  int nind = pIdxToAtm->size();
  // LVarList *pAtomToIdx = pCSet->getList(CT_ATOMTOIDX);
  // pIdxToAtm->dump();
  // pAtomToIdx->dump();
  // LVarList *pCtName = pCSet->getList(CT_NAME);
  LVarList *pAtmsDat = pData->getList(7);

  qlib::RangeSet<int> rsSticks;
  qlib::RangeSet<int> rsSpheres;
  qlib::RangeSet<int> rsCartoon;
  qlib::RangeSet<int> rsLines;
  qlib::RangeSet<int> rsSurface;

  std::map<int, LString> labelMap;

  for (i=0; i<nind; ++i) {
    int aid = pIdxToAtm->getInt(i);

    MB_DPRINTLN("Loading atom %d...", aid);
    LVarList *pAtmDat = pAtmsDat->getList(aid);
    
    MolAtomPtr pAtom(new MolAtom);

    LString sresi = pAtmDat->getString(AT_RESI);
    ResidIndex resi = ResidIndex::fromString(sresi);
    pAtom->setResIndex(resi);
    pAtom->setChainName(pAtmDat->getString(AT_CHAIN));
    pAtom->setResName(pAtmDat->getString(AT_RESN));

    pAtom->setName(pAtmDat->getString(AT_NAME));
    pAtom->setElementName(pAtmDat->getString(AT_ELEM));
    pAtom->setBfac(pAtmDat->getReal(AT_BFAC));
    pAtom->setOcc(pAtmDat->getReal(AT_OCC));

    double x = pCoord->getReal(i*3);
    double y = pCoord->getReal(i*3+1);
    double z = pCoord->getReal(i*3+2);
    pAtom->setPos(Vector4D(x,y,z));

    int ncol = pAtmDat->getInt(AT_COLOR);
    // MB_DPRINTLN("color for %d = %d", i, ncol);
    pAtom->setAtomPropInt("col", PSE_colors[ncol]);

    int res = pMol->appendAtom(pAtom);
    if (res<0) {
      LString msg = "Append atom failed: " + pAtom->formatMsg();
      LOG_DPRINTLN(msg);
    }

    LVarList *pVisReps = pAtmDat->getList(AT_VISREP);
    if (pVisReps->getInt(REP_STICKS)==1) {
      rsSticks.append(res, res+1);
    }
    if (pVisReps->getInt(REP_SPHERES)==1) {
      rsSpheres.append(res, res+1);
    }
    if (pVisReps->getInt(REP_CARTOON)==1) {
      rsCartoon.append(res, res+1);
    }
    if (pVisReps->getInt(REP_LINES)==1) {
      rsLines.append(res, res+1);
    }
    if (pVisReps->getInt(REP_SURFACE)==1) {
      rsSurface.append(res, res+1);
    }

    LString label = pAtmDat->getString(AT_LABEL);
    if (!label.isEmpty()) {
      MB_DPRINTLN("atom %d label=%s", i, label.c_str());
      labelMap.insert(std::pair<int, LString>(res, label));
    }
  }

  pMol->applyTopology();
  pMol->calcProt2ndry(-500.0);
  pMol->calcBasePair(3.7, 30);

  createRends(pMol, rsSticks, "ballstick", "DefaultBallStick");
  createRends(pMol, rsSpheres, "cpk", "DefaultCPK");
  createRends(pMol, rsCartoon, "ribbon", "DefaultRibbon");
  createRends(pMol, rsLines, "simple", "DefaultSimple");

  createLabels(pMol, labelMap);

  createSurface(m_pClient, pMol, rsSurface);
}

void PSEFileReader::parseObjectMeas(LVarList *pData, MolCoordPtr pMol)
{
  LVarList *pSetting = pData->getList(0);
  // parseObject(pData0, pMol);

  LVarList *pMeas = pData->getList(2)->getList(0);

  int pt;
  int nCoord;
  if (pMeas->at(1)->isList()) {
    // length
    pt = 1;
    nCoord = 2;
  }
  else if (pMeas->at(4)->isList()) {
    // angle
    pt = 4;
    nCoord = 3;
  }
  else if (pMeas->at(6)->isList()) {
    // torsion angle
    pt = 6;
    nCoord = 4;
  }
  else {
    LOG_DPRINTLN("PSE> Invalid ObjectMeasure entry");
    return;
  }
    
  LVarList *pList = pMeas->getList(pt);
  // LVarList *pOffs = pMeas->getList(8);
  bool bHaveLabels = pMeas->size()>8;
  int color = pSetting->getInt(2);
  if (color < 0)
    color = (int) getRealSetting(PSESC_dash_color);
  
  int nsz = pList->size();
  int nelems = nsz/3/nCoord;

  if (nelems<=0)
    return;

  qsys::RendererPtr pRend = pMol->createRenderer("atomintr");
  pRend->applyStyles("DefaultLabel,DefaultAtomIntr");
  molvis::AtomIntrRenderer *pAiRend = static_cast<molvis::AtomIntrRenderer *>(pRend.get());
  
  for (int i=0; i<nelems; ++i) {
    std::vector<Vector4D> vecs(nCoord);
    const int nBase = i*nCoord;
    for (int j=0; j<nCoord; ++j) {
      for (int k=0; k<3; ++k)
        vecs[j].ai(k+1) = pList->getReal((nBase + j)*3 + k);
    }
    pAiRend->appendByVecs(vecs);
  }
}
