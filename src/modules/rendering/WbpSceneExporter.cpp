// -*-Mode: C++;-*-
//
// Warabi proj scene output class
//

#include <common.h>

#include "WbpSceneExporter.hpp"

#include "MqoDisplayContext.hpp"
#include "RendIntData.hpp"

#include <qsys/qsys.hpp>
#include <qsys/style/StyleMgr.hpp>
#include <qsys/style/AutoStyleCtxt.hpp>

#include <qlib/LClassUtils.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LStream.hpp>
#include <qlib/StringStream.hpp>
#include <qlib/PrintStream.hpp>
#include <qlib/LDOM2Tree.hpp>

#include <boost/filesystem/operations.hpp>
#include <boost/filesystem/path.hpp>

namespace fs = boost::filesystem;
using namespace render;
using qlib::PrintStream;
using qlib::StrOutStream;
using qsys::StyleMgr;
using qsys::AutoStyleCtxt;
using qsys::ScenePtr;
using qsys::CameraPtr;
using qsys::ViewPtr;


WbpSceneExporter::WbpSceneExporter()
     : SceneExporter()
{
  m_pdc = NULL;
  m_pOut = NULL;
  m_nGradSteps = 16;
//  m_bUseClipZ = false;
//  m_bPostBlend = false;
}

WbpSceneExporter::~WbpSceneExporter()
{
}

void WbpSceneExporter::write()
{
  MqoDisplayContext *pmqodc = MB_NEW MqoDisplayContext();

  m_mqoRelPath = makeRelSubPath("mqo");

  LString str_wbppath = getPath();
  LString str_mqopath = getPath("mqo");

  // Mqo substream
  qlib::OutStream *pOutMqo = createOutStream("mqo");

  ScenePtr pScene = getClient();

  CameraPtr pCam = getCamera();
  qlib::ensureNotNull(pCam.get());

  pmqodc->init(pOutMqo);
  
  pmqodc->setGradSteps(m_nGradSteps);
  pmqodc->setClipZ(m_bUseClipZ);
  pmqodc->setPerspective(m_bPerspective);
  pmqodc->setBgColor(pScene->getBgColor());

  double zoom = pCam->getZoom();
  pmqodc->setZoom(zoom);
  pmqodc->setSlabDepth(pCam->getSlabDepth());
  pmqodc->setViewDist(pCam->getCamDist());

  pmqodc->loadIdent();
  pmqodc->rotate(pCam->m_rotQuat);
  pmqodc->translate(-(pCam->m_center));
  
  // calc line width factor
  if (pScene->getViewCount()>0) {
    ViewPtr pView = pScene->beginView()->second;
    double wpix = pView->getWidth();
    pmqodc->setLineScale(zoom/wpix);
  }

  pScene->display(pmqodc);

  // cleanup the created streams
  pOutMqo->close();
  delete pOutMqo;

  // Write wbp main stream
  // Enter the context
  {
    m_pdc = pmqodc;
    AutoStyleCtxt style_ctxt(pScene->getUID());
    writeWbp();
    m_pdc = NULL;
  }

  delete pmqodc;
}

/** name of the writer */
const char *WbpSceneExporter::getName() const
{
  return "wbp";
}

/** get file-type description */
const char *WbpSceneExporter::getTypeDescr() const
{
  return "Warabi project file (*.wbp)";
}

/** get file extension */
const char *WbpSceneExporter::getFileExt() const
{
  return "*.wbp";
}

static void writeDefaultMaterial(qlib::OutStream *pOut)
{
  PrintStream ps(*pOut);

  ps.println("  Gradient : [");
  ps.println("    { Position : 0.2, Mode : 0, Value : 0.75, TextureScale : 1, TextureOpacity : 1, TextureBlendMode : \"Multiply\", TextureColorOverride : false, TextureOverrideColor : [ 1, 0, 0 ] }");
  ps.println("    { Position : 0.4, Mode : 0, Value : 0.88, TextureScale : 1, TextureOpacity : 1, TextureBlendMode : \"Multiply\", TextureColorOverride : false, TextureOverrideColor : [ 1, 0, 0 ] }");
  ps.println("    { Position : 0.6, Mode : 0, Value : 0.88, TextureScale : 1, TextureOpacity : 1, TextureBlendMode : \"Multiply\", TextureColorOverride : false, TextureOverrideColor : [ 1, 0, 0 ] }");
  ps.println("    { Position : 0.8, Mode : 0, Value : 1, TextureScale : 1, TextureOpacity : 1, TextureBlendMode : \"Multiply\", TextureColorOverride : false, TextureOverrideColor : [ 1, 0, 0 ] }");
  ps.println("	]");
  ps.println("	TextureBlendMode : \"Multiply\"");
  ps.println("	TextureOpacity : 1");
  ps.println("	Highlight : false");
  ps.println("	HighlightSize : 0.3");
  ps.println("	HighlightSpread : 0");
  ps.println("	HighlightColor : [ 1, 1, 1 ]");
  ps.println("	HighlightBlendMode : \"Add\"");
  ps.println("	HighlightOpacity : 1");
  ps.println("	Group : -1");
}

void WbpSceneExporter::writeBrush()
{
  PrintStream ps(*m_pOut);
  StyleMgr *pSM = StyleMgr::getInstance();

  // convert to unique set
  std::set<LString> uniqset;
  uniqset.insert("default");
  BOOST_FOREACH (const LString &brush, m_refBrushList) {
    uniqset.insert(brush.trim(" \r\n\t"));
  }

  bool bWritten = false;
  BOOST_FOREACH (const LString &brush, uniqset) {
    LString def = pSM->getMaterial(brush, "warabi_brush");
    if (!def.isEmpty()) {
      def = def.trim(" \r\n\t");
      ps.formatln("Brush \"%s\" : {", brush.c_str());
      ps.println(def);
      ps.println("}");
      bWritten = true;
    }
  }

  if (!bWritten) {
    // no brush defs ==> write hardcoded default brush
    ps.println("Brush \"default\" : {");
    ps.println("  Width : 1");
    ps.println("  Color : [ 0, 0, 0 ]");
    ps.println("  Opacity : 0.7");
    ps.println("  BlendMode :\"Normal\"");
    ps.println("  Roundness : 1");
    ps.println("  Angle : 0");
    ps.println("  Default : true");
    ps.println("}");
    return;
  }

}

static void writeScenePreamble(qlib::OutStream *pOut)
{
  PrintStream ps(*pOut);

  ps.println("Scene : {");
  ps.println("  Visible : true");
  ps.println("  Position : [ 0, 0, 0 ]");
  ps.println("  Scale : [ 1, 1, 1 ]");
  ps.println("  Rotation : [ 0, 0, 0 ]");
  ps.println("  Layer : 0");
  ps.println("  Group : -1");
  ps.println("  DropShadow : true");
  ps.println("  ReceiveShadow : true");
  ps.println("  ShadowOnly : false");
  ps.println("  BrushSet : {");
  ps.println("    NormalEdgeThreshold : 1.0472");
  ps.println("    SilhouettStyle : 1");
  ps.println("    ContourStyle : 1");
  ps.println("    ObjectBorderStyle : 1");
  ps.println("    MaterialBorderStyle : 1");
  ps.println("    NormalEdgeStyle : 1");
  ps.println("  }");
  ps.println("  Children : {");
  ps.println("    External : {");
}

void WbpSceneExporter::writeMqoImport()
{
  PrintStream ps(*m_pOut);

  ps.formatln("      FileName : \"%s\"", m_mqoRelPath.c_str());
  ps.println("      ImportOptions : {");
  ps.println("        Scale : 1");
  ps.println("        Digits : 0");
  ps.println("        Axes : 1056");
  ps.println("      }");
  ps.println("      Visible : true");
  ps.println("      Position : [ 0, 0, 0 ]");
  ps.println("      Scale : [ 1, 1, 1 ]");
  ps.println("      Rotation : [ 0, 0, 0 ]");
  ps.println("      Layer : 0");
  ps.println("      Group : -1");
  ps.println("      DropShadow : true");
  ps.println("      ReceiveShadow : true");
  ps.println("      ShadowOnly : false");
  ps.println("      BrushSet : {");
  ps.println("        NormalEdgeThreshold : 1.0472");
  ps.println("        SilhouettStyle : 1");
  ps.println("        ContourStyle : 1");
  ps.println("        ObjectBorderStyle : 1");
  ps.println("        MaterialBorderStyle : 1");
  ps.println("        NormalEdgeStyle : 1");
  ps.println("      }");
}

void WbpSceneExporter::writeMqoObj(const LString &name)
{
  MB_ASSERT(m_pdc!=NULL);
  StrOutStream strs;
  PrintStream ps(strs);

  RendIntData *pDat = m_pdc->getIntData(name);
  LString style_names = pDat->getStyleNames();
  
  ScenePtr pScene = getClient();
  StyleMgr *pSM = StyleMgr::getInstance();

  std::list<LString> ls;
  style_names.split(',', ls);

  LString brush_def, brush_refs;
  BOOST_FOREACH(LString &str, ls) {
    LString str2 = str.trim();
    qlib::LDom2Node *pNode = pSM->getStyleNode2(str2, "brush", pScene->getUID());
    if (pNode!=NULL) {
      brush_def = pNode->getContents();
      brush_refs = pNode->getStrAttr("refers");
      break;
    }
  }

  if (!brush_refs.isEmpty()) {
    brush_refs.split(',', m_refBrushList);
  }

  ps.formatln("        Object \"%s\" : {", name.c_str());
  ps.println("          Visible : true");
  ps.println("          Position : [ 0, 0, 0 ]");
  ps.println("          Scale : [ 1, 1, 1 ]");
  ps.println("          Rotation : [ 0, 0, 0 ]");
  ps.println("          Layer : 0");
  ps.println("          Group : -1");
  ps.println("          DropShadow : true");
  ps.println("          ReceiveShadow : true");
  ps.println("          ShadowOnly : false");
  ps.println("          BrushSet : {");
  if (brush_def.isEmpty()) {
    ps.println("            NormalEdgeThreshold : 1.0472");
    ps.println("            SilhouettStyle : 2");
    ps.println("            SilhouettBrush : \"default\"");
    ps.println("            ContourStyle : 2");
    ps.println("            ContourBrush : \"default\"");
    ps.println("            ObjectBorderStyle : 0");
    ps.println("            MaterialBorderStyle : 0");
    ps.println("            NormalEdgeStyle : 2");
    ps.println("            NormalEdgeBrush : \"default\"");
  }
  else {
    ps.println(brush_def);
  }
  ps.println("          }");
  ps.println("          Smoothing : true");
  ps.println("          SmoothingAngle : 1.03847");
  ps.println("          DrawBackFace : false");
  ps.println("        }");

  ps.close();

  m_strMqoObjs += strs.getString();
}

void WbpSceneExporter::writeDefaultRendOpts()
{
  PrintStream ps(*m_pOut);

  ScenePtr pScene = getClient();

  gfx::ColorPtr bgcol = pScene->getBgColor();

  ps.println("RenderingOptions \"RenderingOption 1\" : {");
  ps.formatln("  Camera : \"%s\"", getCameraName().c_str());
  ps.println("  OutputWidth : 1000");
  ps.println("  OutputHeight : 1000");
  ps.println("  AntiAliasing : true");
  ps.println("  SamplingPixels : 6");
  ps.println("  AntiAliasingFilter : 2");
  ps.println("  DropShadow : false");
  ps.println("  DropShadowType : \"RayTrace\"");
  ps.println("  ShadowMapSize : 512");
  ps.println("  TextureFilter : 1");
  ps.println("  LineWidthScale : 1");
  ps.println("  PatternScale : 1");
  ps.formatln("  BackgroundColor : [ %f, %f, %f ]", bgcol->fr(), bgcol->fg(), bgcol->fb());
  ps.println("  FillBackground : true");
  ps.println("  PaintPolygons : true");
  ps.println("  DrawLines : true");
  ps.println("  FogEnabled : false");
  ps.println("  FogStart : 0");
  ps.println("  FogEnd : 100");
  ps.println("  FogCenter : 0");
  ps.println("  BlendMode : \"Normal\"");
  ps.println("  Opacity : 1");
  ps.println("}");
}

void WbpSceneExporter::writeWbp()
{
  MB_ASSERT(m_pdc!=NULL);
  MqoDisplayContext *pdc = m_pdc;
  StyleMgr *pSM = StyleMgr::getInstance();
  ScenePtr pScene = getClient();
  m_refBrushList.erase(m_refBrushList.begin(), m_refBrushList.end());

  // Wbp mainstream
  qlib::OutStream *pOut = createOutStream();
  m_pOut = pOut;

  PrintStream ps(*pOut);

  ps.println("# Warabi Project 1.1 utf8");

  std::deque<LString> matnames;
  pdc->getMqoMatNames(matnames);
  Vector4D vcol;
  BOOST_FOREACH (const LString &name, matnames) {
    if (pdc->getMqoMatColor(name, vcol)) {
      ps.formatln("Material \"%s\" : {", name.c_str());
      ps.formatln("  Color : [%f, %f, %f]", vcol.x(), vcol.y(), vcol.z());
      ps.formatln("  Opacity : %f", vcol.w());
      LString smat = pdc->getMqoStyleMat(name);
      if (smat.isEmpty())
        smat = "default";

      LString matdef = pSM->getMaterial(smat, "warabi");
      if (!matdef.isEmpty()) {
        matdef = matdef.trim(" \r\n\t");
        ps.println(matdef);
      }
      else {
        // no definition --> write hardcoded default material
        writeDefaultMaterial(pOut);
      }
      ps.println("}");
    }
  }

  m_strMqoObjs = LString();
  std::deque<LString> objnames;
  pdc->getMqoObjNames(objnames);
  BOOST_FOREACH (const LString &name, objnames) {
    writeMqoObj(name);
  }

  writeBrush();

  writeScenePreamble(pOut);

  writeMqoImport();

  // write object options
  ps.println("      Children : {");

  ps.print(m_strMqoObjs);

  ps.println("      }");

  ps.println("    }");
  ps.println("    DirectionalLight \"Light 1\" : {");
  ps.println("      Position : [ 500, 500, 500 ]");
  ps.println("      Color : [ 1, 1, 1 ]");
  ps.println("      Visible : true");
  ps.println("      Default : true");
  ps.println("    }");

  {
    const LString &camname = getCameraName();
    CameraPtr pCam = pScene->getCamera(camname);
    double dist = pCam->getCamDist();
    if (!pCam->isPerspec())
      dist = 1000; // emulate orthographic projection
    double zoom = pCam->getZoom();
    
    double fov_rad = ::atan( (zoom/2.0)/dist )*2.0;

    ps.formatln("    Camera \"%s\" : {", camname.c_str());
    ps.formatln("      Position : [ 0, 0, %f ]", dist);
    ps.println("      Focus : [ 0, 0, 0 ]");
    ps.println("      Up : [ 0, 1, 0 ]");
    ps.formatln("      Fov : %f", fov_rad);
    ps.println("      Visible : true");
    ps.println("    }");
  }
  
  ps.println("  }");
  ps.println("}");

  writeDefaultRendOpts();

  m_pOut = NULL;
  pOut->close();
  delete pOut;
}


