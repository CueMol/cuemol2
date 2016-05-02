// -*-Mode: C++;-*-
//
//  Metaseq display context implementation
//

#include <common.h>

#include "MqoDisplayContext.hpp"
#include "RendIntData.hpp"
#include <qlib/PrintStream.hpp>
#include <qlib/Utils.hpp>
#include <gfx/SolidColor.hpp>
// #include "SceneManager.hpp"
// #include "style/StyleMgr.hpp"

using namespace render;

using qlib::PrintStream;
using qlib::Matrix4D;
using qlib::Matrix3D;

MqoDisplayContext::MqoDisplayContext()
     : FileDisplayContext()
{
  m_nGradDiv = 4;
}

MqoDisplayContext::~MqoDisplayContext()
{
  m_data.clearAndDelete();
}

//////////////////////////////

void MqoDisplayContext::init(qlib::OutStream *pMqoOut)
{
  clearMatStack();

  pushMatrix();
  loadIdent();
  m_linew = 1.0;
//  m_color = LColor();
  m_nDrawMode = POV_NONE;
  m_fPrevPosValid = false;
  m_nTriIndex = 0;
  m_dZoom = 100;
  m_dViewDist = 100;
  m_dSlabDepth = 100;

  if (m_pIntData!=NULL)
    delete m_pIntData;
  m_pIntData = NULL;

  m_pMqoOut = pMqoOut;
}

void MqoDisplayContext::startRender()
{
  writeHeader();
}

void MqoDisplayContext::endRender()
{
  if (m_pMqoOut==NULL)
    return;

  writeMaterials();

  qlib::MapPtrTable<RendIntData>::iterator iter;
  for (iter = m_data.begin(); iter!=m_data.end(); ++iter)
    writeObject(iter->second);

  writeTailer();

  m_pMqoOut->close();
}

//////////////////////////////

void MqoDisplayContext::startSection(const LString &name)
{
  if (m_pIntData!=NULL) {
    MB_THROW(qlib::RuntimeException, "Invalid start section call for MqoDisplayContext");
    return ;
  }
  m_pIntData = MB_NEW RendIntData(this);
  m_pIntData->start(name);
}

void MqoDisplayContext::endSection()
{
  // End of rendering
  if (m_pIntData==NULL) {
    MB_THROW(qlib::RuntimeException, "Invalid end section call for MqoDisplayContext");
    return ;
  }
  m_pIntData->end();
  m_data.forceSet(m_pIntData->m_name, m_pIntData);
  m_pIntData = NULL;
}

//////////////////////////////

void MqoDisplayContext::writeHeader()
{
  double fovy = qlib::toDegree(::atan((m_dZoom/2.0)/m_dViewDist))*2.0;

  PrintStream ps(*m_pMqoOut);

  ps.println("Metasequoia Document");
  ps.println("Format Text Ver 1.0");
  ps.println("");

  ps.println("Scene {");
  ps.println("    pos 0.0000 0.0000 100.0000");
  ps.println("    lookat 0.0000 0.0000 0.0000");
  ps.println("    head 0.0000");
  ps.println("    pich 0.0000");
  ps.println("    ortho 0");
  ps.println("    zoom2 10.0000");
  ps.println("    amb 0.250 0.250 0.250");
  ps.println("}");
}

void MqoDisplayContext::writeTailer()
{
  PrintStream ps(*m_pMqoOut);
  ps.println("Eof");
}

using qlib::MapPtrTable;

void MqoDisplayContext::writeColor(int index, RendIntData *pdat, const RendIntData::ColIndex &ic)
{
  PrintStream ps(*m_pMqoOut);

  const char *nm = pdat->m_name.c_str();

  // Get color
  Vector4D vc;
  pdat->m_clut.getRGBAVecColor(ic, vc);
  //double defalpha = pdat->getDefaultAlpha();
  double defalpha = getAlpha();
  vc.w() *= defalpha;

  LString name;
  if (ic.cid2<0) {
    // Non-gradient color
    name = LString::format("%s_col%d",
                           pdat->m_name.c_str(),
                           index);
  }
  else{
    // Gradient color
    name = LString::format("%s_col%d_col%d_g%d",
                           pdat->m_name.c_str(),
                           ic.cid1, ic.cid2, index);
  }
  m_mattab.forceSet(name, m_nMatInd);
  ps.format("    \"%s\" col(%f %f %f %f) dif(0.7) amb(0.1) emi(0.000) spc(0.3) power(0.00) // ind=%d\n",
            name.c_str(), vc.x(), vc.y(), vc.z(), vc.w(), m_nMatInd);
  ++m_nMatInd;

  // Set color
  m_coltab.forceSet(name, vc);

  // Get/Set material (in style def)
  LString smat;
  pdat->m_clut.getMaterial(ic, smat);
  if (!smat.isEmpty()) {
    m_styMatTab.forceSet(name, smat);
  }

}


void MqoDisplayContext::writeMaterials()
{
  PrintStream ps(*m_pMqoOut);

  MapPtrTable<RendIntData>::const_iterator iter = m_data.begin();
  MapPtrTable<RendIntData>::const_iterator eiter = m_data.end();
  int nmat = 0, i, j;

  // enumerate materials
  for (; iter!=eiter; ++iter) {
    RendIntData *pdat = iter->second;
    nmat += pdat->m_clut.size();

    // generate gradient color map
    pdat->m_clut.indexGradients();

    nmat += pdat->m_clut.m_grads.size() * (m_nGradDiv-1);
  }

  // make the material chunk
  ps.format("Material %d {\n", nmat);

  m_nMatInd = 0;
  for (iter = m_data.begin(); iter!=eiter; ++iter) {
    RendIntData *pdat = iter->second;

    // generate solid color map
    for (i=0; i<pdat->m_clut.size(); ++i) {
      RendIntData::ColIndex cind;
      cind.cid1 = i;
      cind.cid2 = -1;
      writeColor(i, pdat, cind);
    }

    BOOST_FOREACH(ColorTable::grads_type::value_type &entry, pdat->m_clut.m_grads) {
      const RendIntData::ColIndex &gd = entry.first;
      for (int j=1; j<=m_nGradDiv-1; j++) {
        double rho = double(j)/double(m_nGradDiv);

        RendIntData::ColIndex pic;
        pic.cid1 = gd.cid1;
        pic.cid2 = gd.cid2;
        pic.setRhoF(rho);
        writeColor(j, pdat, pic);
      }
    }
  }

  ps.println("}");
}

namespace {
  int mixColHelper(const RendIntData::ColIndex &c1, const RendIntData::ColIndex &cret)
  {
    if (c1.cid2>=0)
      return c1.getRhoI();
    else if (c1.cid1 == cret.cid1)
      return 255;
    else
      return 0;
  }

  RendIntData::ColIndex mixColor(const RendIntData::ColIndex &c1,
                                   const RendIntData::ColIndex &c2,
                                   const RendIntData::ColIndex &c3)
  {
    std::set<int> cidset;
    cidset.insert(c1.cid1);
    cidset.insert(c2.cid1);
    cidset.insert(c3.cid1);
    if (c1.cid2>=0) cidset.insert(c1.cid2);
    if (c2.cid2>=0) cidset.insert(c2.cid2);
    if (c3.cid2>=0) cidset.insert(c3.cid2);

    if (cidset.size()==1)
      return c1;
    if (cidset.size()>2) {
      MB_DPRINTLN("MQO Warning: failed in tricolor mixing");
      return c1;
    }

    RendIntData::ColIndex cret;
    cret.cid1 = *(cidset.begin());
    cret.cid2 = *(++cidset.begin());
    
    const int ir1 = mixColHelper(c1, cret);
    const int ir2 = mixColHelper(c2, cret);
    const int ir3 = mixColHelper(c3, cret);
    cret.setRhoI((ir1+ir2+ir3)/3);
    return cret;
  }
}

int MqoDisplayContext::getMatIndex(RendIntData *pDat, const RendIntData::ColIndex &col)
{
  const double rho = col.getRhoF();
  const int ic1 = col.cid1;
  const int ic2 = col.cid2;
  LString name;
  if (ic2<0) {
    // simple color
    name = LString::format("%s_col%d", pDat->m_name.c_str(), ic1);
  }
  else {
    const double N2 = 2.0*double(m_nGradDiv);
    if ( rho < 1.0/N2 ) {
      name = LString::format("%s_col%d", pDat->m_name.c_str(), ic2);
    }
    else if ( (N2-1.0)/N2 <= rho  ) {
      name = LString::format("%s_col%d", pDat->m_name.c_str(), ic1);
    }
    else {
      for (int j=1; j<=m_nGradDiv-1; j++) {
        if ( (2*j-1.0)/N2 <= rho && rho < (2*j+1.0)/N2 ) {
          name = LString::format("%s_col%d_col%d_g%d",
                                 pDat->m_name.c_str(),
                                 ic1, ic2, j);
        }
      }
      //MB_DPRINTLN("gradient %f color %s", rho, name.c_str());
      if (!m_mattab.containsKey(name)) {
        LOG_DPRINTLN("MQOWriter> Warning: color %s not defined!!", name.c_str());
        if ( rho < 0.5 ) {
          name = LString::format("%s_col%d", pDat->m_name.c_str(), ic2);
        }
        else {
          name = LString::format("%s_col%d", pDat->m_name.c_str(), ic1);
        }
      }
    }
  }

  if (!m_mattab.containsKey(name)) {
    LOG_DPRINTLN("MQOWriter> Internal error: color %s not defined!!", name.c_str());
    return -1;
  }

  return m_mattab.get(name);
}

void MqoDisplayContext::writeObject(RendIntData *pDat)
{
  pDat->convLines();
  pDat->convDots();
  
  pDat->convSpheres();
  pDat->convCylinders();

  PrintStream ps(*m_pMqoOut);

  ps.format("Object \"%s\" {\n", pDat->m_name.c_str());
  ps.format("    visible 15\n");
  ps.format("    locking 0\n");
  ps.format("    shading 1\n");
  ps.format("    facet 59.5\n");
  ps.format("    color 1 1 1\n");
  ps.format("    color_type 0\n");

  buildMeshes(pDat);
  writeMeshes();

  ps.format("}\n");
}

static inline bool isVertNear(MeshVert *p1,
                              MeshVert *p2)
{
  const double dv = ((p1->v)-(p2->v)).length();
  if (dv>0.001)
    return false;

  const double dn = ((p1->n) - (p2->n)).length();
  //const double dn = (p1->n).dot(p2->n);
  if (dn>0.001)
    return false;
  return true;
}

/// Make internal mesh buffer (m_verts/m_faces)
void MqoDisplayContext::buildMeshes(RendIntData *pDat)
{
  int i, j;

  const int nverts = pDat->m_mesh.getVertexSize();
  const int nfaces = pDat->m_mesh.getFaceSize();

  if (nverts<=0 || nfaces<=0)
    return;
  
  // convert mesh list to array
  MeshVert **pmary = MB_NEW MeshVert *[nverts];
  std::deque<MeshVert *>::iterator iter = pDat->m_mesh.m_verts.begin();
  std::deque<MeshVert *>::iterator eiter = pDat->m_mesh.m_verts.end();
  for (i=0; iter!=eiter; iter++, i++)
    pmary[i] = *iter;
  

  // make positional alias map
  int *palias = MB_NEW int[nverts];
  int *puid = MB_NEW int[nverts];
  int iuniq=0;
  for (i=0; i<nverts; ++i) {
    for (j=qlib::max(0, i-256); j<i; ++j) {
      if (isVertNear(pmary[i], pmary[j]) &&
          puid[j]>=0) {
        palias[i] = j;
        puid[i] = -1;
        break;
      }
    }
    if (j==i) {
      palias[i] = i;
      puid[i] = iuniq;
      ++iuniq;
    }
  }  

  /////////////////////
  // write vertex_vectors

  int nvbase = m_verts.size();
  for (i=0; i<nverts; i++) {
    if (palias[i] != i)
      continue;
    MeshVert *p = pmary[i];
    putVert(p->v);
  }

  /////////////////////
  // write face_indices
  // fprintf(m_fp, "    face %d {\n", nfaces);
  Mesh::FCIter iter2 = pDat->m_mesh.m_faces.begin();
  Mesh::FCIter eiter2 = pDat->m_mesh.m_faces.end();
  for (i=0; iter2!=eiter2; iter2++, i++) {
    //int i1 = *iter2;
    //iter2++; MB_ASSERT(iter2!=eiter2);
    //int i2 = *iter2;
    //iter2++; MB_ASSERT(iter2!=eiter2);
    //int i3 = *iter2;
    
    int i1 = iter2->iv1;
    int i2 = iter2->iv2;
    int i3 = iter2->iv3;

    {
      Vector4D v12 = pmary[i2]->v - pmary[i1]->v;
      Vector4D v23 = pmary[i3]->v - pmary[i2]->v;
      Vector4D n1 = v12.cross(v23).normalize();
      double d1 = n1.dot(pmary[i1]->n);
      double d2 = n1.dot(pmary[i2]->n);
      double d3 = n1.dot(pmary[i3]->n);
      if (d1<-0.5||d2<-0.5||d3<-0.5) {
        MB_DPRINTLN("xxx (%d %d %d)=(%f,%f,%f)", i1, i2, i3, d1, d2, d3);
        //continue;
        //binv = true;
      }
    }

    int ui1 = puid[palias[i1]];
    int ui2 = puid[palias[i2]];
    int ui3 = puid[palias[i3]];

    if (ui1<0) MB_DPRINTLN("ERROR!! face %d i1<0");
    if (ui2<0) MB_DPRINTLN("ERROR!! face %d i2<0");
    if (ui3<0) MB_DPRINTLN("ERROR!! face %d i3<0");

    if (ui1==ui2 || ui2==ui3 || ui1==ui3)
      continue;

    int im1 = getMatIndex(pDat, mixColor(pmary[i1]->c, pmary[i2]->c, pmary[i3]->c) );

    putFace(ui1+nvbase, ui2+nvbase, ui3+nvbase, im1);

    //fprintf(m_fp, "3 V(%d %d %d) M(%d)\n", ui1, ui3, ui2, im1);
  }
  //fprintf(m_fp, "    }\n");

  // clean up
  delete [] pmary;
  delete [] puid;
  delete [] palias;
}

/// Write internal mesh buffer (m_verts/m_faces) to the stream
void MqoDisplayContext::writeMeshes()
{
  //
  // write vertex_vectors
  //

  PrintStream ps(*m_pMqoOut);
  int i;

  ps.format("    vertex %d {\n", m_verts.size());

  for (i=0; i<m_verts.size(); i++) {
    const Vector4D ve = m_verts[i];
    ps.format("%f %f %f\n", ve.x(), ve.y(), ve.z());
  }
  ps.format("    }\n");

  ps.format("    face %d {\n", m_faces.size()/4);
  std::deque<int>::iterator iter2 = m_faces.begin();
  for (i=0; iter2!=m_faces.end(); iter2++, i++) {
    int i1 = *iter2;
    iter2++; MB_ASSERT(iter2!=m_faces.end());
    int i2 = *iter2;
    iter2++; MB_ASSERT(iter2!=m_faces.end());
    int i3 = *iter2;
    iter2++; MB_ASSERT(iter2!=m_faces.end());
    int im = *iter2;

    //int im3 = getMatIndex(pDat, pmary[i3]);

    ps.format("3 V(%d %d %d) M(%d)\n", i1, i3, i2, im);
  }
  ps.format("    }\n");

  m_verts.clear();
  m_faces.clear();
}

int MqoDisplayContext::getMqoMatNames(std::deque<LString> &names) const
{
  qlib::MapTable<int>::const_iterator iter = m_mattab.begin();
  qlib::MapTable<int>::const_iterator eiter = m_mattab.end();
  int nmat = 0;
  for (; iter!=eiter; ++iter) {
    names.push_back(iter->first);
    ++nmat;
  }

  return nmat;
}

bool MqoDisplayContext::getMqoMatColor(const LString name, Vector4D &vcol) const
{
  if (!m_coltab.containsKey(name)) {
    // undefined mqo mat name
    return false;
  }

  vcol = m_coltab.get(name);
  return true;
}

int MqoDisplayContext::getMqoObjNames(std::deque<LString> &names) const
{
  qlib::MapPtrTable<RendIntData>::const_iterator iter = m_data.begin();
  qlib::MapPtrTable<RendIntData>::const_iterator eiter = m_data.end();
  int nobj = 0;
  for (; iter!=eiter; ++iter) {
    names.push_back(iter->first);
    ++nobj;
  }

  return nobj;
}


