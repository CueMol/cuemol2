// -*-Mode: C++;-*-
//
//  Povray display context implementation
//
//  $Id: PovDisplayContext.cpp,v 1.17 2011/04/11 11:37:29 rishitani Exp $

#include <common.h>

#include "PovDisplayContext.hpp"
#include "RendIntData.hpp"
#include <qlib/PrintStream.hpp>
#include <qlib/Utils.hpp>
#include <gfx/SolidColor.hpp>
#include <gfx/PixelBuffer.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/style/StyleMgr.hpp>

#include <qlib/BSPTree.hpp>
#include <qlib/Vector2D.hpp>

using namespace render;

using qlib::PrintStream;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qlib::Vector2D;

using qsys::StyleMgr;
using qsys::SceneManager;

PovDisplayContext::PovDisplayContext()
     : FileDisplayContext()
{
  // m_fPerspective = true;
  // m_bUnitary = true;
  // m_nDetail = 3;
  // m_dUniTol = 1e-3;
  m_pPovOut = NULL;
  m_pIncOut = NULL;
  m_bPostBlend = false;
  m_dEdgeLineWidth = -1.0;
  m_bEnableEdgeLines = true;

  m_nEdgeLineType = ELT_NONE;
  m_nEdgeCornerType = ECT_ALL;

  m_dCreaseLimit = qlib::toRadian(85.0);
  m_dEdgeRise = 0.5;

  m_bWritePix = false;
}

PovDisplayContext::~PovDisplayContext()
{
}

void PovDisplayContext::startSection(const LString &name)
{
  // start of rendering section
  super_t::startSection(name);
  m_pIntData->start(m_pPovOut, m_pIncOut, name);
  m_secName = name;

  if (!m_bPostBlend) {
    // no post-alpha blending
    return;
  }

  double defalpha = getAlpha();
  MB_DPRINTLN("PovDC> %s default alpha = %f", name.c_str(), defalpha);
  
  if (qlib::Util::isNear4(defalpha, 1.0)) {
    // alpha==1.0 --> opaque section
    return;
  }

  // semi-transparent section
  MB_DPRINTLN("PovDC> blend tab %s => %f", name.c_str(), defalpha);
  // format alpha value string
  int intalp = int(floor(defalpha*10.0+0.5));
  if (intalp>=10) return;
  LString stralp = LString::format("%1d", intalp);
  BlendTab::iterator iter = m_blendTab.find(stralp);
  if (iter==m_blendTab.end()) {
    m_blendTab.insert(std::pair<LString, LString>(stralp, name));
  }
  else {
    iter->second = iter->second + "," + name;
  }

}

void PovDisplayContext::endSection()
{
  // end of rendering section
  writeObjects();
  super_t::endSection();
  m_secName = LString();
}

void PovDisplayContext::setEdgeLineType( int n )
{
  m_nEdgeLineType = n;
}

void PovDisplayContext::setEdgeLineWidth(double w)
{
  m_dEdgeLineWidth = w;
}

void PovDisplayContext::setEdgeLineColor(const ColorPtr &c)
{
  m_egLineCol = c;
}

bool PovDisplayContext::isPostBlend() const
{
  return m_bPostBlend;
}

LString PovDisplayContext::getPostBlendTableJSON() const
{
  LString rval = "{";
  bool bFirst = true;
  BOOST_FOREACH (const BlendTab::value_type &elem, m_blendTab) {
    if (!bFirst)
      rval += ",\n";
    rval += "\"" + elem.first + "\":\"" + elem.second + "\"";
    bFirst = false;
  }
  rval += "}";
  return rval;
}

//////////////////////////////

void PovDisplayContext::init(qlib::OutStream *pPovOut, qlib::OutStream *pIncOut)
{
  m_matstack.erase(m_matstack.begin(), m_matstack.end());

  pushMatrix();
  loadIdent();
  m_linew = 1.0;
  m_pColor = gfx::SolidColor::createRGB(1,1,1);
  m_nDrawMode = POV_NONE;
  m_fPrevPosValid = false;
  m_nTriIndex = 0;
  m_dZoom = 100;
  m_dViewDist = 100;
  m_dSlabDepth = 100;

  if (m_pIntData!=NULL)
    delete m_pIntData;
  m_pIntData = NULL;

  m_pPovOut = pPovOut;
  m_pIncOut = pIncOut;

  m_imgFileNames.clear();
}

void PovDisplayContext::startRender()
{
  writeHeader();
}

void PovDisplayContext::endRender()
{
  // image pixmaps
  if (m_bWritePix) {
    // ips.format("\n#if (_show%s)\n", getSecName().c_str());
    writePixData();
    // ips.format("#end\n");
    // ips.format("\n");
  }

  if (m_pPovOut!=NULL) {
    writeTailer();
    m_pPovOut->close();
  }
  if (m_pIncOut!=NULL) {
    m_pIncOut->close();
  }

}

void PovDisplayContext::writeHeader()
{
  MB_DPRINTLN("povwh: zoom=%f", m_dZoom);
  MB_DPRINTLN("povwh: dist=%f", m_dViewDist);

  SceneManager *pmod = SceneManager::getInstance();
  LString ver = LString::format("Version %d.%d.%d.%d (build %s)",
                                pmod->getMajorVer(),pmod->getMinorVer(),
                                pmod->getRevision(),pmod->getBuildNo(),
                                pmod->getBuildID().c_str());

  PrintStream ps(*m_pPovOut);
  PrintStream ips(*m_pIncOut);

  Vector4D bgcolor;
  if (!m_bgcolor.isnull()) {
    bgcolor.x() = m_bgcolor->fr();
    bgcolor.y() = m_bgcolor->fg();
    bgcolor.z() = m_bgcolor->fb();
  }
  
  ps.println("/*");
  ps.formatln("  POV-Ray output from CueMol %s", ver.c_str());
  ps.format(" */\n");
  ps.format("\n");

  ps.format("#version 3.7;\n");

  StyleMgr *pSM = StyleMgr::getInstance();
  //LString preamble = pSM->getConfig("preamble", "pov").trim(" \r\t\n");
  LString preamble = pSM->getConfig("pov", "preamble").trim(" \r\t\n");
  if (!preamble.isEmpty())
    ps.println(preamble);

  ps.format("\n");
  ps.format("#declare _bgcolor = <%f,%f,%f>;\n", bgcolor.x(), bgcolor.y(), bgcolor.z());
  ps.format("\n");
  ps.format("#ifndef (_transpbg)\n");
  ps.format("background {color rgb _bgcolor}\n");
  ps.format("#else\n");
  ps.format("// transparent background\n");
  ps.format("background {color rgbt <%f,%f,%f,0.999>}\n", bgcolor.x(), bgcolor.y(), bgcolor.z());
  ps.format("#declare _no_fog = 1;\n");
  ps.format("#end\n");
  ps.format("\n");
  ps.format("#declare _distance = %f;\n", m_dViewDist);

  ps.format("\n");
  ps.format("// _stereo ... 0:none, 1:for right eye, -1:for left eye\n");
  ps.format("// _perspective ... 0:orthogonal projection, 1:perspective projection\n");
  ps.format("// _iod ... inter-ocullar distance\n");
  ps.format("\n");
  ps.format("#ifndef (_perspective)\n");
  ps.format("  #declare _perspective = %d;\n", m_fPerspective);
  ps.format("#end\n");
  ps.format("#ifndef (_stereo)\n");
  ps.format("  #declare _stereo = 0;\n");
  ps.format("#end\n");
  ps.format("#ifndef (_iod)\n");
  ps.format("  #declare _iod = 0.03;\n");
  ps.format("#end\n");

  ps.format("#ifndef (_shadow)\n");
  ps.format("  #declare _shadow = 0;\n");
  ps.format("#end\n");

  ps.format("#ifndef (_light_spread)\n");
  ps.format("  #declare _light_spread = 1;\n");
  ps.format("#end\n");

  ps.format("#declare _zoomy = %f;\n", m_dZoom);
  ps.format("#declare _zoomx = _zoomy * image_width/image_height;\n");
  ps.format("#declare _fovx = 2.0*degrees( atan2(_zoomx, 2.0*_distance) );\n");

  ps.format("\n");
  ps.format("camera {\n");
  ps.format(" #if (_perspective)\n");
  ps.format(" perspective\n");
  ps.format(" direction <0,0,-1>\n");
  ps.format(" up <0,1,0> * image_height/image_width\n");
  ps.format(" right <1,0,0>\n");
  ps.format(" angle _fovx\n");
  ps.format(" location <_stereo*_distance*_iod,0,_distance>\n");
  ps.format(" look_at <0,0,0>\n");
  ps.format(" #else\n");
  ps.format(" orthographic\n");
  ps.format(" direction <0,0,-1>\n");
  ps.format(" up <0, _zoomy, 0>\n");
  ps.format(" right <_zoomx, 0, 0>\n");
  ps.format(" location <_stereo*_distance*_iod,0,_distance>\n");
  ps.format(" look_at <0,0,0>\n");
  ps.format(" #end\n");
  ps.format("}\n");
  ps.format("\n");

  ps.format("global_settings {\n");
  ps.format("  assumed_gamma 1.0\n");
  ps.format("}\n");
  ps.format("\n");
  ps.format("\n");

  ///////////
  // Lighting

  LString lighting = pSM->getConfig("pov", "lighting").trim(" \r\t\n");
  if (!lighting.isEmpty())
    ps.println(lighting);

  // Lighting macro
  ps.format("// Spec lighting macro\n");
  ps.format("// aLightSpread: area light spread (1-10)\n");
  ps.format("// aDist: overall distance (200)\n");
  ps.format("// aInten: light intensity (0.8)\n");
  ps.format("// aShadow: shadow flag (used in point light mode (aLightSpread==1))\n");
  ps.format("#macro SpecLighting(aLightSpread, aDist, aInten, aShadow)\n");
  ps.format("#local v1=<1,1,1>;\n");
  ps.format("#local v2=<1,-0.5,-0.5>;\n");
  ps.format("#local vecsz=aDist*aLightSpread/10;\n");
  ps.format("light_source {\n");
  ps.format("   vnormalize(v1)*aDist*2\n");
  ps.format("   color rgb aInten\n");
  ps.format("#if (aLightSpread>1)\n");
  ps.format("   area_light vnormalize(v2)*vecsz, vcross(vnormalize(v1),vnormalize(v2))*vecsz, 10, 10\n");
  ps.format("   adaptive 2\n");
  ps.format("#else\n");
  ps.format("   parallel point_at <0,0,0>\n");
  ps.format("#if (!aShadow)\n");
  ps.format("   shadowless\n");
  ps.format("#end\n");
  ps.format("#end\n");
  ps.format("}\n");
  ps.format("#end\n");
  ps.format("\n");
  ps.format("// Flash lighting macro\n");
  ps.format("// aInten: light intensity (0.8)\n");
  ps.format("#macro FlashLighting(aInten)\n");
  ps.format("light_source {\n");
  ps.format("   <_stereo*_distance*_iod,0,_distance>\n");
  ps.format("   color rgb aInten \n");
  ps.format("   shadowless\n");
  ps.format("#if (!_perspective)\n");
  ps.format("   parallel point_at <0,0,0>\n");
  ps.format("#end\n");
  ps.format("}\n");
  ps.format("#end\n");
  ps.format("\n");
  ps.format("\n");

  ps.format("//////////////////////\n");
  ps.format("//    Lighting\n");
  ps.format("\n");

  // Radiosity settings
  ps.format("#ifdef (_radiosity)\n");
  ps.format("\n");
  ps.format("  #ifndef (_light_inten)\n");
  // ps.format("    #declare _light_inten=0.8;\n");
  // ps.format("    #declare _amb_inten=0.8;\n");
  ps.format("    #declare _light_inten=1.6;\n");
  ps.format("    #declare _amb_frac=0.5;\n");
  ps.format("    #declare _flash_frac=0.5;\n");
  ps.format("  #end\n");
  ps.format("\n");
  ps.format("  #include \"rad_def.inc\"\n");
  ps.format("  global_settings {\n");
  ps.format("    radiosity {\n");
  ps.format("      Rad_Settings(_radiosity, off, off)\n");
  ps.format("    }\n");
  ps.format("  }\n");
  ps.format("\n");
  ps.format("sphere {\n");
  ps.format("  <0, 0, 0>, 1\n");
  ps.format("  texture {\n");
  ps.format("  pigment { color rgb <1,1,1> }\n");
  ps.format("   finish { diffuse 0 emission _light_inten*_amb_frac }\n");
  ps.format("  }\n");
  ps.format("  hollow on\n");
  ps.format("  no_shadow\n");
  ps.format("  scale _distance*10\n");
  ps.format("}\n");
  ps.format("\n");
  ps.format("#ifdef (_no_fog)\n");
  ps.format("plane {z,-_distance*2\n");
  ps.format("  texture {\n");
  ps.format("  pigment { color rgb _bgcolor }\n");
  ps.format("   finish { diffuse 1 emission 0 }\n");
  ps.format("  }\n");
  ps.format("}\n");
  ps.format("#end\n");
  ps.format("\n");
  ps.format("#else\n");
  ps.format("\n");
  ps.format("  #ifndef (_light_inten)\n");
  ps.format("    #declare _light_inten=1.3;\n");
  ps.format("    #declare _flash_frac=0.8/1.3;\n");
  ps.format("    #declare _amb_frac=0;\n");
  ps.format("  #end\n");
  ps.format("\n");
  ps.format("#end\n");
  ps.format("\n");
  ps.format("SpecLighting(_light_spread, _distance, _light_inten*(1-_amb_frac)*(1-_flash_frac), _shadow)\n");
  ps.format("FlashLighting(_light_inten*(1-_amb_frac)*_flash_frac)\n");

  ps.format("//////////////////////\n");
  ps.format("//    Fog\n");
  ps.format("\n");

  /////////////////////////////////////////////
  // Fog

  ps.format("#ifndef (_no_fog)\n");
  ps.format("fog {\n");
  ps.format("  distance %f/3\n", m_dSlabDepth);
  ps.format("  color rgbf <%f,%f,%f,0>\n", bgcolor.x(), bgcolor.y(), bgcolor.z());
  ps.format("  fog_type 2\n");
  ps.format("  fog_offset 0\n");
  ps.format("  fog_alt 1.0e-10\n");
  ps.format("  up <0,0,1>\n");
  ps.format("}\n");
  ps.format("#end\n");
  ps.format("\n");

  ps.format("\n");
  ps.format("/////////////////////////////////////////////\n");

  /////////////////////////////////////////////////////////////////////////

  ips.format("/*\n");
  ips.format("  POV-Ray output from CueMol (%s)\n", ver.c_str());
  ips.format(" */\n");
  ips.format("\n");
  ips.format("\n");

  // label macro
  ips.format("#macro make_label(aCen, aW, aH, aPixFile)\n");
  ips.format("#local scl = _zoomx/image_width;\n");
  ips.format("#local tex_0 = texture {\n");
  ips.format("  finish {\n");
  ips.format("   ambient 0\n");
  ips.format("   diffuse 1.0\n");
  ips.format("  }\n");
  ips.format("  pigment{\n");
  ips.format("    image_map{\n");
  ips.format("     png aPixFile\n");
  ips.format("     //gamma 1.0 \n");
  ips.format("     once \n");
  ips.format("     map_type 0\n");
  ips.format("    }\n");
  ips.format("    scale <aW,aH>*scl\n");
  ips.format("    translate aCen\n");
  ips.format("  }\n");
  ips.format("}\n");
  ips.format("\n");
  ips.format("polygon { 4,\n");
  ips.format("    aCen,\n");
  ips.format("    aCen+<aW,0,0>*scl,\n");
  ips.format("    aCen+<aW,aH,0>*scl,\n");
  ips.format("    aCen+<0,aH,0>*scl\n");
  ips.format("    texture{tex_0}}\n");
  ips.format("#end\n");
  ips.format("\n");

  ips.format("union {\n");
}

void PovDisplayContext::writeTailer()
{
  PrintStream ps(*m_pPovOut);
  PrintStream ips(*m_pIncOut);

  ps.format("\n");
  ps.format("//////////////////////////////////////////////\n");
  ps.format("\n");
  ps.format("#declare _scene = #include \"%s\"\n", m_incFileName.c_str());
  ps.format("\n");
  ps.format("object{\n");
  ps.format("  _scene\n");

  ps.format("}\n");
  ps.format("\n");

  ips.println("} // union");
  ips.println("");
}

///////////////////////////////////////////////////////////////////////

void PovDisplayContext::writeObjects()
{
  bool bcyl = false, bsph = false, blin = false, bmes = false;

  m_pIntData->convDots();
  
  if (m_pIntData->isEmpty() && m_pixList.empty())
    return;

  PrintStream ps(*m_pPovOut);
  PrintStream ips(*m_pIncOut);

  ps.format("//\n");
  ps.format("// rendering properties for %s\n", getSecName().c_str());
  ps.format("//\n");
  ps.format("#ifndef (_show%s)\n", getSecName().c_str());
  ps.format("#declare _show%s = 1;\n", getSecName().c_str());
  ps.format("#end\n");
  
  ips.format("\n#if (_show%s)\n", getSecName().c_str());

  dumpClut(m_pIncOut);

  blin = writeLines();

  if (m_bEnableEdgeLines &&
      (m_nEdgeLineType==ELT_OPQ_EDGES||
       m_nEdgeLineType==ELT_OPQ_SILHOUETTE)) {
    // opaque edges/silhouettes
    m_pIntData->convSpheres();
    m_pIntData->convCylinders();
    
    writeMeshes();
    ips.format("\n#end\n");
    
    /*
    // write mask meshes
    ips.format("\n#if (!_show%s)\n", getSecName().c_str());
    writeMeshes(true);
    ips.format("\n#end\n");
    */
    
    // TO DO: clip the occluded edges by visibility calculation
    ips.format("\n#if (_show%s_edges)\n", getSecName().c_str());
    writeSilEdges();
    ips.format("\n#end\n");
    
    ps.format("#ifndef (_show%s_edges)\n", getSecName().c_str());
    ps.format("#declare _show%s_edges = 1;\n", getSecName().c_str());
    ps.format("#end\n");
    ps.format("\n");
  }
  else if (m_bEnableEdgeLines &&
           (m_nEdgeLineType==ELT_EDGES||
            m_nEdgeLineType==ELT_SILHOUETTE)) {
    // normal edges/silhouettes
    m_pIntData->convSpheres();
    m_pIntData->convCylinders();
    writeMeshes();
    writeSilEdges();
    ips.format("\n#end\n");
    ps.format("\n");
  }
  else {
    // no edges/silhouettes
    bcyl = writeCyls();
    bsph = writeSpheres();
    bmes = writeMeshes();
    if (bcyl)
      ps.format("#declare %s_lw = 1.00;\n", getSecName().c_str());
    ips.format("\n#end\n");
    ps.format("\n");

  }

}

/// dump CLUT to POV file
void PovDisplayContext::dumpClut(OutStream *fp)
{
  PrintStream ps(*fp);
  StyleMgr *pSM = StyleMgr::getInstance();
  double defalpha = getAlpha();

  bool bDefAlpha = false;
  if (!isPostBlend() &&
      !qlib::Util::isNear4(defalpha, 1.0))
    bDefAlpha =true;

  int i;
  const int nclutsz = m_pIntData->m_clut.size();
  for (i=0; i<nclutsz; i++) {
    RendIntData::ColIndex cind;
    cind.cid1 = i;
    cind.cid2 = -1;

    // get color
    Vector4D vc;
    m_pIntData->m_clut.getRGBAVecColor(cind, vc);
      
    // write color
    ps.format("#declare %s_col_%d = ", getSecName().c_str(), i);
    if (!bDefAlpha && qlib::Util::isNear4(vc.w(), 1.0))
      ps.format("<%f,%f,%f>;\n", vc.x(), vc.y(), vc.z());
    else
      ps.format("<%f,%f,%f,%f>;\n", vc.x(), vc.y(), vc.z(), 1.0-(vc.w()*defalpha));

    LString colortext = LString::format("%s_col_%d", getSecName().c_str(), i);

    // get material
    LString mat;
    m_pIntData->m_clut.getMaterial(cind, mat);
    if (mat.isEmpty()) mat = "default";
    LString matdef = pSM->getMaterial(mat, "pov");
    matdef = matdef.trim(" \r\n\t");
      
    // write material
    ps.format("#declare %s_tex_%d = ", getSecName().c_str(), i);
    if (!matdef.isEmpty()) {
      if (matdef.replace("@COLOR@", colortext)>0)
        m_matColReplTab.insert(mat);
      ps.println(matdef);
    }
    else
      ps.println("texture {pigment{color rgbt "+colortext+"}}");

  }
}

void PovDisplayContext::writeColor(const RendIntData::ColIndex &ic)
{
  PrintStream ips(*m_pIncOut);

  const char *nm = getSecName().c_str();
  if (ic.cid2<0) {
    //
    // Non-gradient color
    //
    ips.format("texture{%s_tex_%d}", nm, ic.cid1);
  }
  else{
    //
    // Gradient color
    //
    RendIntData::ColIndex cind;
    cind.cid2 = -1;
    
    LString mat1, mat2;
    cind.cid1 = ic.cid1;
    m_pIntData->m_clut.getMaterial(cind, mat1);
    if (mat1.isEmpty()) mat1 = "default";
    cind.cid1 = ic.cid2;
    m_pIntData->m_clut.getMaterial(cind, mat2);
    if (mat2.isEmpty()) mat2 = "default";
    
    bool bMatRepl1 = getMatColRepl(mat1);
    bool bMatRepl2 = getMatColRepl(mat2);
    
    if (mat1.equals(mat2) && bMatRepl1 && bMatRepl2) {
      ips.format("texture{%s_tex_%d ", nm, ic.cid1);
      ips.format(
        "pigment {color rgbt %s_col_%d*%f+%s_col_%d*%f}}",
        nm, ic.cid1, ic.getRhoF(), nm, ic.cid2, 1.0-ic.getRhoF());
    }
    else {
      ips.format(
        "texture{function{%.6f}texture_map{[0 %s_tex_%d][1 %s_tex_%d]}}",
        1.0f-ic.getRhoF(), nm, ic.cid1, nm, ic.cid2);
    }
  }
}

bool PovDisplayContext::writeLines()
{
  if (m_pIntData->m_lines.size()<=0)
    return false;

  PrintStream ps(*m_pPovOut);
  PrintStream ips(*m_pIncOut);

  // write INC file
  BOOST_FOREACH(RendIntData::Line *p, m_pIntData->m_lines) {

    Vector4D v1 = p->v1, v2 = p->v2;
    double w = p->w;

    // always keep v1.z < v2.z
    if (v1.z()>v2.z())
      std::swap(v1, v2);

    Vector4D nn = v2 - v1;
    double len = nn.length();
    if (len<=F_EPS4) {
      // ignore degenerated cylinder
      delete p;
      continue;
    }
    
    if (m_pIntData->m_dClipZ<0) {
      ips.format("cylinder{<%f, %f, %f>, ", v1.x(), v1.y(), v1.z());
      ips.format("<%f, %f, %f>, ", v2.x(), v2.y(), v2.z());
      ips.format("%s_lw*%f ", getSecName().c_str(), w);
      writeColor(p->col);
      ips.format("}\n");
    }
    else if (m_pIntData->m_dClipZ > v1.z()) {

      if (m_pIntData->m_dClipZ < v2.z())
        v2 = nn.scale((m_pIntData->m_dClipZ-v1.z())/(nn.z())) + v1;

      ips.format("cylinder{<%f, %f, %f>, ", v1.x(), v1.y(), v1.z());
      ips.format("<%f, %f, %f>, ", v2.x(), v2.y(), v2.z());
      ips.format("%s_lw*%f ", getSecName().c_str(), w);
      writeColor(p->col);

      ips.format("}\n");
    }
    delete p;
  }

  m_pIntData->eraseLines();

  const double line_scale = getLineScale();
  // write POV file
  ps.format("#declare %s_lw = %.3f;\n", getSecName().c_str(), line_scale);
  ps.format("#declare %s_tex = texture {\n", getSecName().c_str());
  ps.format("  pigment {color rgbft <0,0,0,1,1>}\n");
  ps.format("  normal {granite 0.0 scale 1.0}\n");
  ps.format("  finish {\n");
  ps.format("   ambient 0.3\n");
  ps.format("   diffuse 1.0\n");
  ps.format("   specular 0.0\n");
  ps.format("  }\n");
  ps.format(" }\n");

  return true;
}

bool PovDisplayContext::writeCyls()
{
  if (m_pIntData->m_cylinders.size()<=0)
    return false;

  PrintStream ps(*m_pPovOut);
  PrintStream ips(*m_pIncOut);

  const double clipz = m_pIntData->m_dClipZ;

  BOOST_FOREACH (RendIntData::Cyl *p, m_pIntData->m_cylinders) {

    Vector4D v1 = p->v1, v2 = p->v2;
    double w1 = p->w1, w2 = p->w2;
    Vector4D nn = v1 - v2;
    double len = nn.length();
    if (len<=F_EPS4) {
      // ignore the degenerated cylinder
      delete p;
      continue;
    }

    // elongate cyl. for connectivity
    nn = nn.scale(1.0/len);
    v1 += nn.scale(0.01);
    v2 -= nn.scale(0.01);

    // always keep v1.z < v2.z
    if (v1.z()>v2.z()) {
      std::swap(v1, v2);
      std::swap(w1, w2);
    }
    //const double dz = v2.z() - v1.z();
    //const double dh = qlib::abs(v2.y() - v1.y());
    //const double l = ::sqrt(dz*dz+dh*dh);
    const double delw = qlib::max(w1, w2);
    const double thr1 = v1.z() - delw;
    const double thr2 = v2.z() + delw;

    MB_ASSERT(v2.z()>v1.z());

    if (clipz<0) {
      // no clipping Z
      if (qlib::isNear4(w1, w2)) {
        // cyliner
        ips.format("cylinder{<%f,%f,%f>,", v1.x(), v1.y(), v1.z());
        ips.format("<%f,%f,%f>,", v2.x(), v2.y(), v2.z());
        ips.format("%s_lw*%f ", getSecName().c_str(), w1);
      }
      else {
        // cone
        ips.format("cone{<%f,%f,%f>,", v1.x(), v1.y(), v1.z());
        ips.format("%s_lw*%f,", getSecName().c_str(), w1);
        ips.format("<%f,%f,%f>,", v2.x(), v2.y(), v2.z());
        ips.format("%s_lw*%f ", getSecName().c_str(), w2);
      }

      writeColor(p->col);
      ips.format("}\n");
    }
    else {
      if (clipz > thr1) {
        if (qlib::isNear4(w1, w2)) {
          // cyliner
          ips.format("cylinder{<%f,%f,%f>,", v1.x(), v1.y(), v1.z());
          ips.format("<%f,%f,%f>,", v2.x(), v2.y(), v2.z());
          ips.format("%s_lw*%f ", getSecName().c_str(), w1);
        }
        else {
        // cone
          ips.format("cone{<%f,%f,%f>,", v1.x(), v1.y(), v1.z());
          ips.format("%s_lw*%f,", getSecName().c_str(), w1);
          ips.format("<%f,%f,%f>,", v2.x(), v2.y(), v2.z());
          ips.format("%s_lw*%f ", getSecName().c_str(), w2);
        }
        
        writeColor(p->col);
        
        if (p->pTransf!=NULL) {
          const Matrix4D &m = *p->pTransf;
          ips.format(" matrix <");
          ips.format("%f, %f, %f, ", m.aij(1,1), m.aij(2,1), m.aij(3,1) );
          ips.format("%f, %f, %f, ", m.aij(1,2), m.aij(2,2), m.aij(3,2) );
          ips.format("%f, %f, %f, ", m.aij(1,3), m.aij(2,3), m.aij(3,3) );
          ips.format("%f, %f, %f>" , m.aij(1,4), m.aij(2,4), m.aij(3,4) );
        }
        else if (clipz < thr2) {
          ips.format("\n bounded_by {");
          ips.format("  plane {z, %f} ", clipz);
          ips.format("}");
          ips.format("clipped_by { bounded_by }");
        }
        ips.format("}\n");
      }
    }

    delete p;
  }

  m_pIntData->eraseCyls();
  return true;
}

bool PovDisplayContext::writeSpheres()
{
  if (m_pIntData->m_spheres.size()<=0)
    return false;

  PrintStream ps(*m_pPovOut);
  PrintStream ips(*m_pIncOut);

  const double clipz = m_pIntData->m_dClipZ;

  BOOST_FOREACH (RendIntData::Sph *p, m_pIntData->m_spheres) {

    if (clipz<0) {
      // no clipping
      ips.format("sphere{<%f, %f, %f>, ", p->v1.x(), p->v1.y(), p->v1.z());
      ips.format("%f ", p->r);
      writeColor(p->col);
      ips.format("}\n");
    }
    else if (clipz > (p->v1.z() - p->r)) {
      ips.format("sphere{<%f, %f, %f>, ", p->v1.x(), p->v1.y(), p->v1.z());
      ips.format("%f ", p->r);
      writeColor(p->col);
      if (clipz < (p->v1.z() + p->r)) {
        ips.format("\n bounded_by {");
        ips.format("  plane {z, %f} ", clipz);
        ips.format("}");
        ips.format("clipped_by { bounded_by }");
      }
      ips.format("}\n");
    }
    
    delete p;
  }

  m_pIntData->eraseSpheres();
  return true;
}

bool PovDisplayContext::writeMeshes(bool bMask/*=false*/)
{
  int i, j;
  const char *nm = getSecName().c_str();
  const double clipz = m_pIntData->m_dClipZ;

  if (m_pIntData->m_mesh.getVertexSize()<=0 || m_pIntData->m_mesh.getFaceSize()<1)
    return false;
  
  Mesh *pMesh = &m_pIntData->m_mesh;
  bool bdel = false;
  if (clipz>0.0) {
    Mesh *pRes = m_pIntData->calcMeshClip();
    if (pRes!=NULL) {
      pMesh = pRes;
      bdel = true;
    }
  }

  int nverts = pMesh->getVertexSize();
  int nfaces = pMesh->getFaceSize();

  // convert vertex list to array
  MeshVert **pmary = MB_NEW MeshVert *[nverts];
  i=0;
  BOOST_FOREACH (MeshVert *pelem, pMesh->m_verts) {
    pmary[i] = pelem;
    ++i;
  }
  
  //
  // generate mesh2 statement
  //
  
  PrintStream ps(*m_pPovOut);
  PrintStream ips(*m_pIncOut);

  ips.format("mesh2{\n");
  
  // write vertex_vectors
  ips.format("vertex_vectors{ %d", nverts);
  for (i=0; i<nverts; i++) {
    MeshVert *p = pmary[i];
    if (i%6==0)
      ips.format(",\n");
    else
      ips.format(",");

    if (!qlib::isFinite(p->v.x()) ||
        !qlib::isFinite(p->v.y()) ||
        !qlib::isFinite(p->v.z())) {
      LOG_DPRINTLN("PovWriter> ERROR: invalid mesh vertex");
      ips.format("<0, 0, 0>");
    }
    else {
      ips.format("<%f, %f, %f>", p->v.x(), p->v.y(), p->v.z());
    }
  }
  ips.format("}\n");
  
  if (!bMask) {
    // write normal_vectors
    ips.format("normal_vectors{ %d", nverts);
    for (i=0; i<nverts; i++) {
      MeshVert *p = pmary[i];
      if (i%6==0)
        ips.format(",\n");
      else
        ips.format(",");
      
      if (!qlib::isFinite(p->n.x()) ||
          !qlib::isFinite(p->n.y()) ||
          !qlib::isFinite(p->n.z())) {
        LOG_DPRINTLN("PovWriter> ERROR: invalid mesh normal");
        ips.format("<1, 0, 0>");
      }
      else {
        ips.format("<%f, %f, %f>", p->n.x(), p->n.y(), p->n.z());
      }
    }
    ips.format("}\n");
    
    //
    // write texture_list
    //
    writeTextureList();
    
    //
    // write gradient textures
    //
    writeGradTexture();
  }
  
  //
  // write face_indices
  //
  ips.format("face_indices{ %d", nfaces);

  Mesh::FCIter iter2 = pMesh->m_faces.begin();
  Mesh::FCIter iend2 = pMesh->m_faces.end();
  for (i=0; iter2!=iend2; iter2++, i++) {
    if (i%4==0)
      ips.format(",\n");
    else
      ips.format(",");
    
    const int i1 = iter2->iv1;
    const int i2 = iter2->iv2;
    const int i3 = iter2->iv3;

    if (bMask) {
      ips.format("<%d,%d,%d>",
                 i1, i2, i3);
    }
    else {
      const int itx1 = convTexInd(pmary[i1]);
      const int itx2 = convTexInd(pmary[i2]);
      const int itx3 = convTexInd(pmary[i3]);

      ips.format("<%d,%d,%d>,%d,%d,%d",
                 i1, i2, i3,
                 itx1, itx2, itx3);
    }
  }
  ips.format("}\n");
  
  if (bMask) {
    double br = 1.0, bg = 1.0, bb = 1.0;
    if (!m_bgcolor.isnull()) {
      br = m_bgcolor->fr();
      bg = m_bgcolor->fg();
      bb = m_bgcolor->fb();
    }
    ips.format("texture { %s_sl_tex pigment { color rgb <%f,%f,%f> }}\n",
               nm, br, bg, bb);
  }

  ips.format("}\n");
  
  //
  // clean up
  //
  if (bdel)
    delete pMesh;
  delete [] pmary;

  // m_pIntData->m_mesh.clear();

  return true;
}

void PovDisplayContext::writeTextureList()
{
  PrintStream ips(*m_pIncOut);

  const int nclutsz = m_pIntData->m_clut.size();
  int txsize = nclutsz + m_pIntData->m_clut.m_grads.size()*256;
  ips.format("texture_list{ %d", txsize);

  // write simple textures
  for (int i=0; i<nclutsz; i++) {
    if (i%2==0)
      ips.format(",\n");
    else
      ips.format(",");

    RendIntData::ColIndex pic;
    pic.cid1 = i;
    pic.cid2 = -1;
    writeColor(pic);
  }
}

void PovDisplayContext::writeGradTexture()
{
  PrintStream ips(*m_pIncOut);

  m_pIntData->m_clut.indexGradients();
  
  BOOST_FOREACH(ColorTable::grads_type::value_type &entry, m_pIntData->m_clut.m_grads) {

    const RendIntData::ColIndex &gd = entry.first;
    for (int j=0; j<256; j++) {
      double rho = double(j)/255.0f;
      ips.format(",\n");
      RendIntData::ColIndex pic;
      pic.cid1 = gd.cid1;
      pic.cid2 = gd.cid2;
      pic.setRhoI(j);
      writeColor(pic);
    }
  }
  ips.format("}\n");
}

/// convert gradient-map index to the POV's mesh texture index
int PovDisplayContext::convTexInd(MeshVert *p1)
{
  if ( p1->c.cid2 < 0 ) {
    return p1->c.cid1;
  }
  else {
    int gind = m_pIntData->m_clut.getGradIndex(p1->c);
    if (gind<0) {
      LOG_DPRINTLN("FATAL ERROR: cannot convert gradient index!!");
      return 0;
    }

    return m_pIntData->m_clut.size() + gind*256 + p1->c.getRhoI();
  }
}

void PovDisplayContext::drawPixels(const Vector4D &pos,
                                   const gfx::PixelBuffer &data,
                                   const gfx::ColorPtr &acol)
{
  Vector4D v(pos);
  xform_vec(v);

  if (!m_bWritePix)
    return;

  gfx::ColorPtr col = acol;
  if (col.isnull()) {
    col = getCurrentColor();
  }

  int img_w = data.getWidth();
  int img_h = data.getHeight();
  int ndep = data.getDepth()/8;
  MB_DPRINTLN("POV> Draw pixels %d x %d, %d", img_w, img_h, ndep);

  PixData img;
  img.m_pos = v;
  img.m_nWidth = img_w / getPixSclFac();
  img.m_nHeight = img_h / getPixSclFac();
  img.m_pData = MB_NEW gfx::PixelBuffer();

  img.m_pData->setWidth(img_w);
  img.m_pData->setHeight(img_h);
  img.m_pData->setDepth(8*4);
  const int nsize = img_w * img_h * 4;
  img.m_pData->resize(nsize);
  QUE_BYTE *pnew = img.m_pData->data();
  QUE_BYTE cr = (QUE_BYTE)col->r();
  QUE_BYTE cg = (QUE_BYTE)col->g();
  QUE_BYTE cb = (QUE_BYTE)col->b();

  if (ndep==1) {
    for (int j=0; j<img_h; ++j)
      for (int i=0; i<img_w; ++i) {
        QUE_BYTE pix = data.at(j*img_w+i);
        pnew[(j*img_w+i)*4 + 0] = cr;
        pnew[(j*img_w+i)*4 + 1] = cg;
        pnew[(j*img_w+i)*4 + 2] = cb;
        pnew[(j*img_w+i)*4 + 3] = pix;
      }
  }
  else if (ndep==4) {
    for (int i=0; i<nsize; ++i)
      pnew[i] = data.at(i);
  }
  
  m_pixList.push_back(img);
}

#include <libpng/png.h>

namespace {
  void user_error_fn(png_structp png_ptr,
                     png_const_charp error_msg)
  {
    LOG_DPRINTLN("PNG: error %s", error_msg);
  }
  
  void user_warning_fn(png_structp png_ptr,
                       png_const_charp warning_msg)
  {
    LOG_DPRINTLN("PNG: warning %s", warning_msg);
  }
}

void PovDisplayContext::writePixData()
{
  if (m_pixList.empty())
    return;

  PrintStream ips(*m_pIncOut);

  
  
  int i = 0, j, k;
  BOOST_FOREACH (PixData &img, m_pixList) {
    LString fname = LString::format("%s_%04d.png", m_incFileName.c_str(), i);
    
    int nWidth, nHeight, nRow;
    int nBitDepth, nColorType;
    unsigned char **ppImage;

    nWidth = img.m_pData->getWidth();
    nRow = nWidth * 4;
    nHeight = img.m_pData->getHeight();
    nBitDepth = 8;
    nColorType = PNG_COLOR_TYPE_RGB_ALPHA;

    ppImage = new unsigned char *[nHeight];
    for (j=0; j<nHeight; ++j)
      ppImage[j] = new unsigned char [nRow];

    for (j=0; j<nHeight; ++j)
      for (k=0; k<nRow; ++k)
        ppImage[j][k] = img.m_pData->at((nHeight-1-j)*nRow + k);

    png_structp     png_ptr;
    png_infop       info_ptr;
    
    FILE *fp = fopen(fname.c_str(), "wb");

    png_ptr = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
    info_ptr = png_create_info_struct(png_ptr);
    png_init_io(png_ptr, fp);

    png_set_IHDR(png_ptr, info_ptr, nWidth, nHeight,
                 nBitDepth, nColorType, PNG_INTERLACE_NONE,
		 PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);

    png_write_info(png_ptr, info_ptr);
    png_write_image(png_ptr, ppImage);
    png_write_end(png_ptr, info_ptr);
    png_destroy_write_struct(&png_ptr, &info_ptr);
    fclose(fp);

    for (j=0; j<nHeight; ++j)
      delete [] ppImage[j];
    delete [] ppImage;

    delete img.m_pData;

    //////////

    m_imgFileNames.push_back(fname);
    fname = fname.escapeQuots();

    Vector4D v1 = img.m_pos;
    ips.format("make_label(<%f, %f, %f>, %d, %d, \"%s\")\n",
               img.m_pos.x(), img.m_pos.y(), img.m_pos.z(),
               img.m_nWidth, img.m_nHeight, fname.c_str());

    ++i;
  }

  m_pixList.clear();
}

