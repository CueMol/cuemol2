// -*-Mode: C++;-*-
//
//  STL (Stereolithography) Display context implementation class
//

#include <common.h>

#include "LuxRendDisplayContext.hpp"
#include "LuxRendSceneExporter.hpp"
#include "RendIntData.hpp"
#include <qlib/PrintStream.hpp>
#include <qlib/BinStream.hpp>
#include <qlib/Utils.hpp>
#include <gfx/SolidColor.hpp>
#include <qsys/style/StyleMgr.hpp>

using namespace render;

using qlib::PrintStream;
using qlib::BinOutStream;
//using qlib::Matrix4D;
using qlib::Matrix3D;
using qlib::MapPtrTable;

using qsys::StyleMgr;
//using qsys::SceneManager;

LuxRendDisplayContext::LuxRendDisplayContext()
     : FileDisplayContext(), m_pParent(NULL)
{
}

LuxRendDisplayContext::~LuxRendDisplayContext()
{
}

//////////////////////////////

void LuxRendDisplayContext::init(qlib::OutStream *pOut, LuxRendSceneExporter *pParent)
{
  super_t::init();

  m_pParent = pParent;
  m_pOut = pOut;
}

void LuxRendDisplayContext::startRender()
{
  writeHeader();
}

void LuxRendDisplayContext::endRender()
{
  if (m_pOut==NULL)
    return;

  writeTailer();

/*
  qlib::MapPtrTable<RendIntData>::iterator iter = m_data.begin();
  qlib::MapPtrTable<RendIntData>::iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    RendIntData *pDat = iter->second;
  }
*/  
  m_pOut->close();
}

//////////////////////////////

void LuxRendDisplayContext::startSection(const LString &name)
{
  if (m_pIntData!=NULL) {
    MB_THROW(qlib::RuntimeException, "Invalid start section call for LuxRendDisplayContext");
    return ;
  }

  // create RendIntData (m_pIntData), etc.
  super_t::startSection(name);
}

void LuxRendDisplayContext::endSection()
{
  if (m_pIntData==NULL) {
    MB_THROW(qlib::RuntimeException, "Invalid end section call for LuxRendDisplayContext");
    return ;
  }
  m_pIntData->end();

  // Write this section's objects
  writeObjects();

  // m_data.forceSet(m_pIntData->m_name, m_pIntData);
  // m_pIntData = NULL;
  
  // cleanup RendIntData
  super_t::endSection();
}

//////////////////////////////

void LuxRendDisplayContext::writeHeader()
{
  int width = m_pParent->getWidth();
  int height = m_pParent->getHeight();

  double zoomy = m_dZoom;
  double zoomx = zoomy * double(width) / double(height);
  double fovx = qlib::toDegree(::atan((zoomx/2.0)/m_dViewDist))*2.0;
  double fovy = qlib::toDegree(::atan((zoomy/2.0)/m_dViewDist))*2.0;

  double fov;
  if (height<width)
    fov = fovy;
  else
    fov = fovx;

  bool bPerspec = m_fPerspective;

  if (bPerspec) {
    if (fov<10.0) {
      // fov is too small --> change to orthographic
      bPerspec = false;
    }
  }

  // 
  PrintStream ps(*m_pOut);
  
  ps.format("# CueMol LuxRender exporter output\n");
  ps.format("\n");

  if (bPerspec)  {
    ps.format("LookAt 0 0 %f 0 0 0 0 1 0\n", m_dViewDist);
    ps.format("Camera \"perspective\" \"float fov\" [%f]\n", fov);
  }
  else {
    ps.format("LookAt 0 0 %f 0 0 0 0 1 0\n", m_dSlabDepth);
    ps.format("Camera \"orthographic\"\n");
    ps.format("       \"float screenwindow\" [%f %f %f %f]\n", -zoomx/2.0, zoomx/2.0, -zoomy/2.0, zoomy/2.0);
  }

  ps.format("\n");
  ps.format("Film \"fleximage\"\n");
  ps.format("     \"integer xresolution\" [%d]\n", width);
  ps.format("     \"integer yresolution\" [%d]\n", height);
  ps.format("     \"string filename\" [\"test1\"]\n");
  ps.format("     \"bool premultiplyalpha\" [\"true\"]\n");
  ps.format("     \"bool write_png\" [\"true\"]\n");
  ps.format("     \"string write_png_channels\" [\"RGB\"]\n");
  ps.format("     \"integer displayinterval\" [1]\n");
  ps.format("     \"integer writeinterval\" [600]\n");
  ps.format("\n");
  ps.format("PixelFilter \"mitchell\" \"float xwidth\" [2] \"float ywidth\" [2] \"bool supersample\" [\"true\"]\n");
  ps.format("Sampler \"metropolis\"\n");
  ps.format("WorldBegin\n");
  ps.format("\n");

  writeLights();
}

void LuxRendDisplayContext::writeTailer()
{
  PrintStream ps(*m_pOut);
  ps.format("WorldEnd\n");
  ps.format("\n");
}

/// Write light sources, etc
void LuxRendDisplayContext::writeLights()
{
  PrintStream ps(*m_pOut);

  m_vSpotLightPos = Vector4D(-100, 100, 100);
  double zback = -m_dSlabDepth;

  int width = m_pParent->getWidth();
  int height = m_pParent->getHeight();
  double zoomy = m_dZoom;
  double zoomx = zoomy * double(width) / double(height);
  double disksize = qlib::max(zoomx/2.0, zoomy/2.0)+10.0;

  ps.format("AttributeBegin # Spot light\n");
  ps.format("Translate %f %f %f\n", m_vSpotLightPos.x(), m_vSpotLightPos.y(), m_vSpotLightPos.z());
  ps.format("AreaLightSource \"area\" \"float gain\" [1000] \"color L\" [1.0 1.0 1.0]\n");
  ps.format("Shape \"sphere\" \"float radius\" [10]\n");
  ps.format("AttributeEnd\n");
  ps.format("\n");
  ps.format("AttributeBegin # Infinit light\n");
  ps.format("LightSource \"infinite\" \"color L\" [1.0 1.0 1.0] \"float gain\" [0.1]\n");
  ps.format("AttributeEnd\n");
  ps.format("\n");

  ps.format("AttributeBegin # Background\n");
  ps.format("Translate 0 0 %f\n", zback);
  ps.format("Material \"matte\"\n");
  ps.format("Shape \"disk\" \"float radius\" [%f] \"float height\" [0]\n", disksize);
  ps.format("AttributeEnd\n");
  ps.format("\n");
}

void LuxRendDisplayContext::writeObjects()
{
  // convert dot primitive to spheres
  m_pIntData->convDots();

  // write material/texture section
  writeMaterials();

  PrintStream ps(*m_pOut);

  ps.format("AttributeBegin # Object %s\n", getSecName().c_str());

  // write sphere primitives
  writeSpheres();
  writeCyls();
  writeMeshes();

  ps.format("AttributeEnd\n");
  ps.format("\n");
}

void LuxRendDisplayContext::writeMaterials()
{
  PrintStream ps(*m_pOut);

  StyleMgr *pSM = StyleMgr::getInstance();
  double defalpha = getAlpha();

  bool bDefAlpha = false;
  if (!qlib::Util::isNear4(defalpha, 1.0))
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
      
    LString matname = makeColorMatName(i);
    ps.print("MakeNamedMaterial \""+matname+"\"\n");
    ps.format("    \"color Kd\" [%f %f %f]\n", vc.x(), vc.y(), vc.z());
    ps.format("    \"string type\" [\"matte\"]\n");
    ps.format("\n");


/*
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
*/
    
  }
}

void LuxRendDisplayContext::writeSpheres()
{
  if (m_pIntData->m_spheres.size()<=0)
    return;

  PrintStream ps(*m_pOut);

  // const double clipz = m_pIntData->m_dClipZ;

  BOOST_FOREACH (RendIntData::Sph *p, m_pIntData->m_spheres) {
    // no clipping
    //ps.format("sphere{<%f, %f, %f>, ", p->v1.x(), p->v1.y(), p->v1.z());
    //ps.format("%f ", p->r);
    //writeColor(p->col);
    //ps.format("}\n");
    
    const RendIntData::ColIndex &ic = p->col;
    if (ic.cid2<0) {
      LString matname = makeColorMatName(ic.cid1);
      ps.format("NamedMaterial \""+matname+"\"\n");
    }
    else {
      // gradient color (TO DO: implementation)
    }

    ps.format("Transform [1 0 0 0  0 1 0 0  0 0 1 0  %f %f %f 1]\n", p->v1.x(), p->v1.y(), p->v1.z());
    //ps.format("Material \"matte\"\n");
    ps.format("Shape \"sphere\" \"float radius\" [%f]\n", p->r);


    // TO DO: Clipping implementation
  }

  m_pIntData->eraseSpheres();
}

void LuxRendDisplayContext::writeCyls()
{
  if (m_pIntData->m_cylinders.size()<=0)
    return;

  PrintStream ps(*m_pOut);

  // const double clipz = m_pIntData->m_dClipZ;

  BOOST_FOREACH (RendIntData::Cyl *p, m_pIntData->m_cylinders) {

    Vector4D v1 = p->v1, v2 = p->v2;
    double w1 = p->w1, w2 = p->w2;

    {
      Vector4D nn = v1 - v2;
      double len = nn.length();
      if (len<=F_EPS4) {
        // ignore the degenerated cylinder
        continue;
      }
      
      // elongate cyl. for connectivity
      nn = nn.scale(1.0/len);
      v1 += nn.scale(0.01);
      v2 -= nn.scale(0.01);
    }
    
    // always keep v1.z < v2.z
    if (v1.z()>v2.z()) {
      std::swap(v1, v2);
      std::swap(w1, w2);
    }
    MB_ASSERT(v2.z()>v1.z());

    // calculate transformation matrix
    Vector4D v21 = v2-v1;
    double len = v21.length();
    Vector4D vec = v21.divide(len);
    double a = sqrt(vec.x() * vec.x() + vec.y() * vec.y());
    if (a > 1.0e-6) {
      double f = 1.0/a;

      ps.format("Transform [%f %f %f 0  ",
                vec.x()*vec.z()*f, vec.y()*vec.z()*f, -a);
      
      ps.format("%f %f 0 0  ",
                -vec.y()*f, vec.x()*f);
      
      ps.format("%f %f %f 0  ",
                vec.x(), vec.y(), vec.z());
      
      ps.format("%f %f %f 1]\n",
                v1.x(), v1.y(), v1.z());

    }
    else {
      // no transformation required
      ps.format("Transform [1 0 0 0  0 1 0 0  0 0 1 0  %f %f %f 1]\n",
                v1.x(), v1.y(), v1.z());
    }

    const RendIntData::ColIndex &ic = p->col;
    if (ic.cid2<0) {
      LString matname = makeColorMatName(ic.cid1);
      ps.format("NamedMaterial \""+matname+"\"\n");
    }
    else {
      // gradient color (TO DO: implementation)
    }

    // no clipping Z
    if (qlib::isNear4(w1, w2)) {
      // cyliner

      ps.format("Shape \"cylinder\" \"float radius\" [%f] ", w1);
      ps.print("\"float zmin\" [0] ");
      ps.format("\"float zmax\" [%f]\n", len);
      

      //ips.format("cylinder{<%f,%f,%f>,", v1.x(), v1.y(), v1.z());
      //ips.format("<%f,%f,%f>,", v2.x(), v2.y(), v2.z());
      //ips.format("%s_lw*%f ", getSecName().c_str(), w1);
    }
    else {
      // TO DO: cone
      //ips.format("cone{<%f,%f,%f>,", v1.x(), v1.y(), v1.z());
      //ips.format("%s_lw*%f,", getSecName().c_str(), w1);
      //ips.format("<%f,%f,%f>,", v2.x(), v2.y(), v2.z());
      //ips.format("%s_lw*%f ", getSecName().c_str(), w2);
    }
    
    // TO DO: Clipping implementation
  }

  m_pIntData->eraseCyls();
}

void LuxRendDisplayContext::writeMeshes()
{
  Mesh *pMesh = &m_pIntData->m_mesh;
  int i;
  int nverts = pMesh->getVertexSize();
  int nfaces = pMesh->getFaceSize();


  if (nverts<=0 || nfaces<=0)
    return;

  PrintStream ps(*m_pOut);

  // convert vertex list to array
  MeshVert **pmary = MB_NEW MeshVert *[nverts];
  int nsolid=0, ngrad=0;
  i=0;
  BOOST_FOREACH (MeshVert *pelem, pMesh->m_verts) {
    ColorTable::elem_t ic = pelem->c;
    if (!ic.isGrad())
      ++nsolid;
    else
      ++ngrad;
    pmary[i] = pelem;
    ++i;
  }
  LOG_DPRINTLN("Mesh verts=%d (solid color=%d, grad color=%d)", nverts, nsolid, ngrad);

  // Enumerate used colors
  Mesh::FCIter iter2, iend2;

  typedef std::map<short, short> ColorMap;
  ColorMap solidcols;



  int nsolidf = 0, nsolidc=0;
  int nhomo = 0;
  int nhetero = 0;

  iter2 = pMesh->m_faces.begin();
  iend2 = pMesh->m_faces.end();
  for (i=0; iter2!=iend2; iter2++, i++) {
    const int i1 = iter2->iv1;
    const int i2 = iter2->iv2;
    const int i3 = iter2->iv3;
    ColorTable::elem_t ic1 = pmary[i1]->c;
    ColorTable::elem_t ic2 = pmary[i2]->c;
    ColorTable::elem_t ic3 = pmary[i3]->c;
    if (!ic1.isGrad() &&
        !ic2.isGrad() &&
        !ic3.isGrad() &&
        ic1.cid1==ic2.cid1 &&
        ic2.cid1==ic3.cid1) {
      nsolidf ++;
      std::map<short, short>::const_iterator mi = solidcols.find(ic1.cid1);
      if (mi==solidcols.end()) {
        solidcols.insert(std::pair<short, short>(ic1.cid1, nsolidc));
        ++nsolidc;
      }
    }
    else {
      if (isEqualGradCol(ic1, ic2) &&
          isEqualGradCol(ic2, ic3) &&
          isEqualGradCol(ic3, ic1)) {
        nhomo ++;
        short icol1 = ic1.cid1;
        short icol2 = icol1;
        if (ic1.cid2>=0 && ic1.cid2!=icol1)
          icol2 = ic1.cid2;
        else if (ic2.cid1!=icol1)
          icol2 = ic2.cid1;
        else if (ic2.cid2>=0 && ic2.cid2!=icol1)
          icol2 = ic2.cid2;
        else if (ic3.cid1!=icol1)
          icol2 = ic3.cid1;
        else if (ic3.cid2>=0 && ic3.cid2!=icol1)
          icol2 = ic3.cid2;
        MB_ASSERT(icol1!=icol2);
        if (icol1>icol2)
          std::swap(icol1, icol2);
      }
      else {
        nhetero ++;
      }
    }
  }
  
  LOG_DPRINTLN("Mesh faces=%d (solid color=%d, homograd=%d, heterograd=%d)", nfaces, nsolidf, nhomo, nhetero);
  LOG_DPRINTLN("Mesh solid cols=%d", nsolidc);

  BOOST_FOREACH (ColorMap::value_type &elem, solidcols) {
    short ic_out = elem.first;
    MB_DPRINTLN("write solid color: %d", ic_out);

    LString matname = makeColorMatName(ic_out);
    ps.format("NamedMaterial \""+matname+"\"\n");

    writeMeshVerts(ps, nverts, pmary);
    
    // Write triangle face indices
    ps.print("\"integer indices\" [");
    iter2 = pMesh->m_faces.begin();
    iend2 = pMesh->m_faces.end();
    int npr=0;
    for (i=0; iter2!=iend2; iter2++, i++) {
      if (npr%4==0)
        ps.format("\n");
      
      const int i1 = iter2->iv1;
      const int i2 = iter2->iv2;
      const int i3 = iter2->iv3;
      
      ColorTable::elem_t ic1 = pmary[i1]->c;
      ColorTable::elem_t ic2 = pmary[i2]->c;
      ColorTable::elem_t ic3 = pmary[i3]->c;
      if (!ic1.isGrad() &&
          !ic2.isGrad() &&
          !ic3.isGrad()) {
        if (ic1.cid1==ic2.cid1 && ic2.cid1==ic3.cid1 && ic1.cid1==ic_out) {
          ps.format("%d %d %d ", i1, i2, i3);
          ++npr;
        }
      }

    }
    ps.print("]\n");
  }

  // clean up
  delete [] pmary;
}

void LuxRendDisplayContext::writeMeshVerts(PrintStream &ps, int nverts, MeshVert **pmary)
{
  int i;

  // Write vertex points
  //ps.format("# Mesh nvert=%d, nface=%d\n", nverts, nfaces);
  ps.format("# Mesh nvert=%d\n", nverts);
  ps.print("Shape \"trianglemesh\" \"point P\" [");
  for (i=0; i<nverts; i++) {
    MeshVert *p = pmary[i];
    if (i%6==0)
      ps.print("\n");

    if (!qlib::isFinite(p->v.x()) ||
        !qlib::isFinite(p->v.y()) ||
        !qlib::isFinite(p->v.z())) {
      LOG_DPRINTLN("PovWriter> ERROR: invalid mesh vertex");
      ps.print("0 0 0 ");
    }
    else {
      ps.format("%f %f %f ", p->v.x(), p->v.y(), p->v.z());
    }
  }
  ps.print("]\n");

  // Write vertex normals
  ps.print("\"normal N\" [");
  for (i=0; i<nverts; i++) {
    MeshVert *p = pmary[i];
    if (i%6==0)
      ps.print("\n");

    if (!qlib::isFinite(p->n.x()) ||
        !qlib::isFinite(p->n.y()) ||
        !qlib::isFinite(p->n.z())) {
      LOG_DPRINTLN("PovWriter> ERROR: invalid mesh vertex");
      ps.print("0 0 0 ");
    }
    else {
      ps.format("%f %f %f ", p->n.x(), p->n.y(), p->n.z());
    }
  }
  ps.print("]\n");
}

