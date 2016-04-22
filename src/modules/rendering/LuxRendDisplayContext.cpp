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
  if (!m_pParent->m_sOutputBase.isEmpty())
    ps.format("     \"string filename\" [\"%s\"]\n", m_pParent->m_sOutputBase.c_str());
  ps.format("     \"bool premultiplyalpha\" [\"true\"]\n");
  ps.format("     \"bool write_png\" [\"true\"]\n");
  ps.format("     \"bool write_exr\" [\"true\"]\n");
  ps.format("     \"string write_png_channels\" [\"RGB\"]\n");
  ps.format("     \"integer displayinterval\" [1]\n");
  ps.format("     \"integer writeinterval\" [60]\n");
  if (m_pParent->m_nHaltSPP>0)
    ps.format("     \"integer haltspp\" [%d]\n", m_pParent->m_nHaltSPP);
  ps.format("\n");
  ps.format("PixelFilter \"mitchell\" \"float xwidth\" [2] \"float ywidth\" [2] \"bool supersample\" [\"true\"]\n");
  ps.format("Sampler \"metropolis\"\n");
  ps.format("WorldBegin\n");
  ps.format("\n");

  ps.print("Texture \"utex\" \"float\" \"bilerp\"\n");
  ps.print(" \"float v00\" [0]\n");
  ps.print(" \"float v10\" [1]\n");
  ps.print(" \"float v01\" [0]\n");
  ps.print(" \"float v11\" [1]\n");
  ps.print("\n");
  
  ps.print("MakeNamedMaterial \"NullMat\" \"string type\" [\"null\"]\n");
  ps.print("\n");

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
  double zoomd = sqrt(zoomx*zoomx + zoomy*zoomy);

  double disksize = (m_dSlabDepth + m_dViewDist) * zoomd / m_dViewDist;
  //double disksize = qlib::max(zoomx/2.0, zoomy/2.0)+10.0;

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

  // bool bDefAlpha = false;
  // if (!qlib::Util::isNear4(defalpha, 1.0))
  // bDefAlpha =true;

  // write solid color entries
  int i;
  const int nclutsz = m_pIntData->m_clut.size();
  for (i=0; i<nclutsz; i++) {
    RendIntData::ColIndex cind;
    cind.cid1 = i;
    cind.cid2 = -1;

    // get color
    Vector4D vc;
    m_pIntData->m_clut.getRGBAVecColor(cind, vc);
    double alpha = vc.w() * defalpha;

    bool bUseAlpha = false;
    if (!qlib::Util::isNear4(alpha, 1.0))
      bUseAlpha =true;

    LString colname = LString::format("%s_tex_%d", getSecName().c_str(), i);
    ps.format("Texture \"%s\" \"color\" \"constant\" \"color value\" [%f %f %f]\n",
              colname.c_str(), vc.x(), vc.y(), vc.z());

    //LString icolname = LString::format("%s_inv_%d", getSecName().c_str(), i);
    //ps.format("Texture \"%s\" \"color\" \"constant\" \"color value\" [%f %f %f]\n",
    //icolname.c_str(), 1.0-vc.x(), 1.0-vc.y(), 1.0-vc.z());

    // Get material
    LString mat;
    m_pIntData->m_clut.getMaterial(cind, mat);
    if (mat.isEmpty()) mat = "default";
    LString matdef = pSM->getMaterial(mat, "lux");
    if (matdef.isEmpty()) {
      // hard-coded default
      matdef  = "    \"string type\" [\"glossy\"]\n";
      matdef += "    \"texture Kd\" [\"@COLOR@\"]\n";
      matdef += "    \"color Ks\" [0.2 0.2 0.2]\n";
      matdef += "    \"float uroughness\" [0.4]\n";
      matdef += "    \"float vroughness\" [0.4]\n";
    }
    matdef = matdef.trim(" \r\n\t");
    
    // perform color replacement
    matdef.replace("@COLOR@", colname);

    // write material
    LString matname = makeColorMatName(i);
    if (!bUseAlpha) {
      // opaque color
      ps.print("MakeNamedMaterial \""+matname+"\"\n");
      ps.println(matdef);
    }
    else {
      // have default alpha (transparent color)
      LString matname2 = matname + "_o";

      ps.print("MakeNamedMaterial \""+matname2+"\"\n");
      ps.println(matdef);

      ps.print("MakeNamedMaterial \""+matname+"\"\n");
      ps.format("    \"string type\" [\"mix\"]\n");
      ps.format("    \"string namedmaterial1\" [\"NullMat\"]\n");
      ps.format("    \"string namedmaterial2\" [\"%s\"]\n", matname2.c_str());
      ps.format("    \"float amount\" [%f]\n", alpha);
    }

    ps.print("\n");
  }


  // assign sequential index number to the gradients
  m_pIntData->m_clut.indexGradients();

  // write gradient color entries
  BOOST_FOREACH(ColorTable::grads_type::value_type &entry, m_pIntData->m_clut.m_grads) {
    const RendIntData::ColIndex &gd = entry.first;
    LString mat1 = makeColorMatName(gd.cid1);
    LString mat2 = makeColorMatName(gd.cid2);
    //LString gmat = makeGradMatName(gd);
    LString gmat = makeGradMatName(entry.second);

    ps.format("MakeNamedMaterial \"%s\"\n", gmat.c_str());
    ps.print("    \"string type\" [\"mix\"]\n");
    ps.format("    \"string namedmaterial1\" [\"%s\"]\n", mat1.c_str());
    ps.format("    \"string namedmaterial2\" [\"%s\"]\n", mat2.c_str());
    ps.print("    \"texture amount\" [\"utex\"]\n");
    ps.print("\n");
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
  std::vector<MeshVert *> pmary(nverts); // = MB_NEW MeshVert *[nverts];
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

  std::vector<const MeshFace *> vpfaces(nfaces);
  typedef std::pair<bool, short> facetype_t;
  std::vector<facetype_t> vfacetypes(nfaces);

  iter2 = pMesh->m_faces.begin();
  iend2 = pMesh->m_faces.end();
  for (i=0; iter2!=iend2; iter2++, i++) {
    vpfaces[i] = &(*iter2);
    vfacetypes[i].first = false;
    vfacetypes[i].second = -1;

    const int i1 = iter2->iv1;
    const int i2 = iter2->iv2;
    const int i3 = iter2->iv3;
    const ColorTable::elem_t &ic1 = pmary[i1]->c;
    const ColorTable::elem_t &ic2 = pmary[i2]->c;
    const ColorTable::elem_t &ic3 = pmary[i3]->c;

    if (!ic1.isGrad() &&
        !ic2.isGrad() &&
        !ic3.isGrad()) {
      // all three verts have solid color(s)
      if (ic1.cid1==ic2.cid1 &&
          ic2.cid1==ic3.cid1) {
        // all three verts have the same solid color
        vfacetypes[i].first = false;
        vfacetypes[i].second = ic1.cid1;
      }
      else if (ic1.cid1==ic2.cid1) {
        // ic1 == ic2 != ic3
        vfacetypes[i] = setFaceType1(ic1, ic3);
      }
      else if (ic2.cid1==ic3.cid1) {
        // ic1 != ic2 == ic3
        vfacetypes[i] = setFaceType1(ic1, ic2);
      }
      else if (ic3.cid1==ic1.cid1) {
        // ic3 == ic1 != ic2
        vfacetypes[i] = setFaceType1(ic1, ic2);
      }
      else {
        // all vertex colors are different!!
        vfacetypes[i].first = false;
        vfacetypes[i].second = ic1.cid1;
      }
    }
    else if (isEqualCol(ic1, ic2) &&
             isEqualCol(ic2, ic3)) {
      vfacetypes[i].first = true;
      vfacetypes[i].second = findEqualGradIndex(ic1, ic2, ic3);
      if (vfacetypes[i].second<0) {
        LOG_DPRINTLN("ERROR!!!");
      }
    }
    else if (isEqualCol(ic1, ic2)) {
      // ic1 == ic2 != ic3
      vfacetypes[i] = setFaceType2(ic1, ic2, ic3);
    }
    else if (isEqualCol(ic2, ic3)) {
      // ic1 != ic2 == ic3
      vfacetypes[i] = setFaceType2(ic2, ic3, ic1);
    }
    else if (isEqualCol(ic3, ic1)) {
      // ic3 == ic1 != ic2
      vfacetypes[i] = setFaceType2(ic3, ic1, ic2);
    }
    else {
      // all vertex colors are not equivalent!!
      vfacetypes[i].first = false;
      vfacetypes[i].second = ic1.cid1;
    }
  }

  std::set<facetype_t> tpflags;
  for (i=0; i<nfaces; ++i) {
    tpflags.insert(vfacetypes[i]);
  }

  int npr;
  std::vector<int> vidmap(nverts);
  
  BOOST_FOREACH (const facetype_t &elem, tpflags) {
    bool bGrad = elem.first;
    // make VID map
    for (i=0; i<nverts; ++i) vidmap[i] = -1;
    for (i=0; i<nfaces; ++i) {
      if (elem==vfacetypes[i]) {
        const MeshFace *pf = vpfaces[i];
        vidmap[pf->iv1] = 0;
        vidmap[pf->iv2] = 0;
        vidmap[pf->iv3] = 0;
      }
    }

    // Write materials
    if (bGrad) {
      LString matname = makeGradMatName(elem.second);
      ps.format("NamedMaterial \""+matname+"\"\n");
    }
    else {
      LString matname = makeColorMatName(elem.second);
      ps.format("NamedMaterial \""+matname+"\"\n");
    }

    // Write verts
    npr = 0;
    int idnew = 0;
    ps.print("Shape \"trianglemesh\" \"point P\" [");
    for (i=0; i<nverts; i++) {
      if (vidmap[i]<0) continue;
      vidmap[i] = idnew;
      ++idnew;
      MeshVert *p = pmary[i];

      if (!qlib::isFinite(p->v.x()) ||
          !qlib::isFinite(p->v.y()) ||
          !qlib::isFinite(p->v.z())) {
        LOG_DPRINTLN("PovWriter> ERROR: invalid mesh vertex");
        ps.print("0 0 0 ");
      }
      else {
        ps.format("%f %f %f ", p->v.x(), p->v.y(), p->v.z());
      }
      ++npr;

      if (npr>6) {
        ps.print("\n");
        npr = 0;
      }
      
    }
    ps.print("]\n");
    
    // Write vertex normals
    npr = 0;
    ps.print("\"normal N\" [");
    for (i=0; i<nverts; i++) {
      if (vidmap[i]<0) continue;
      MeshVert *p = pmary[i];
      
      if (!qlib::isFinite(p->n.x()) ||
          !qlib::isFinite(p->n.y()) ||
          !qlib::isFinite(p->n.z())) {
        LOG_DPRINTLN("PovWriter> ERROR: invalid mesh vertex");
        ps.print("0 0 0 ");
      }
      else {
        ps.format("%f %f %f ", p->n.x(), p->n.y(), p->n.z());
      }
      ++npr;

      if (npr>6) {
        ps.print("\n");
        npr = 0;
      }
      
    }
    ps.print("]\n");
    
    if (bGrad) {
      // Write UV vectors
      const ColorTable::elem_t *pgd = m_pIntData->m_clut.findGradByIndex(elem.second);
      if (pgd==NULL) {
        LOG_DPRINTLN("FATAL ERROR!!");
        continue;
      }
      npr = 0;
      ps.print("\"float uv\" [");
      for (i=0; i<nverts; i++) {
        if (vidmap[i]<0) continue;
        MeshVert *p = pmary[i];
        
        double u = 0.0;
        ColorTable::elem_t ic = p->c;
        if (ic.isGrad()) {
          if (ic.cid1==pgd->cid1 && ic.cid2==pgd->cid2) {
            u = 1.0-ic.getRhoF();
          }
          else if (ic.cid1==pgd->cid1) {
            u = 0.0;
          }
          else if (ic.cid1==pgd->cid2) {
            u = 1.0;
          }
          else {
            //LOG_DPRINTLN("FATAL ERROR!!");
            //continue;
            u = 0.0;
          }
        }
        else {
          if (ic.cid1==pgd->cid1)
            u = 0.0;
          else if (ic.cid1==pgd->cid2)
            u = 1.0;
        }
        ps.format("%f 0 ", u);
        ++npr;
        
        if (npr>12) {
          ps.print("\n");
          npr = 0;
        }
        
      }
      ps.print("]\n");
    } // if (bGrad)

    // Write triangle face indices
    npr = 0;
    ps.print("\"integer indices\" [");
    for (i=0; i<nfaces; i++) {
      if (elem==vfacetypes[i]) {
        const MeshFace *pf = vpfaces[i];
        
        const int i1 = vidmap[pf->iv1];
        const int i2 = vidmap[pf->iv2];
        const int i3 = vidmap[pf->iv3];

        ps.format("%d %d %d ", i1, i2, i3);
        ++npr;

        if (npr>12) {
          ps.print("\n");
          npr = 0;
        }
      }
    }
    ps.print("]\n");
  }

}

