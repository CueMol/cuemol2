// -*-Mode: C++;-*-
//
//  Direct molecular surface renderer
//

#include <common.h>

#include "DirectSurfRenderer.hpp"

#include <modules/molstr/MolCoord.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/AtomIterator.hpp>

#include "edtsurf/CommonPara.h"
#include "edtsurf/ProteinSurface.h"

using namespace surface;
using molstr::MolCoordPtr;
using molstr::MolAtomPtr;
using molstr::AtomIterator;

DirectSurfRenderer::DirectSurfRenderer()
{
  m_nSurfAlgor = DS_EDTSURF;
}

DirectSurfRenderer::~DirectSurfRenderer()
{
}

const char *DirectSurfRenderer::getTypeName() const
{
  return "dsurface";
}

namespace {
  int getRadiusIndex(MolAtomPtr pAtom)
  {
  switch (pAtom->getElement()) {
  case molstr::ElemSym::H:
    return 0;

  case molstr::ElemSym::C:
    return 1;

  case molstr::ElemSym::N:
    return 2;
    
  case molstr::ElemSym::O:
    return 3;
    
  case molstr::ElemSym::S:
    return 4;
    
  case molstr::ElemSym::P:
    return 5;
    
  default:
    return 6;
  }
  }
}

void DirectSurfRenderer::buildMeshCache()
{
  MolCoordPtr pmol = getClientMol();

  AtomIterator aiter(pmol, getSelection());
  int i, natoms=0;

  // count atom number
  for (aiter.first(); aiter.hasMore(); aiter.next()) {
    MolAtomPtr pAtom = aiter.get();
    MB_ASSERT(!pAtom.isnull());
    ++natoms;
  }
  if (natoms==0) {
    // no atoms to be rendered
    return;
  }

  edtsurf::ProteinSurface pps;

  pps.rasrad[0] = m_vdwr_H;
  pps.rasrad[1] = m_vdwr_C;
  pps.rasrad[2] = m_vdwr_N;
  pps.rasrad[3] = m_vdwr_O;
  pps.rasrad[4] = m_vdwr_S;
  pps.rasrad[5] = m_vdwr_P;
  pps.rasrad[6] = m_vdwr_X;
  // getRadiusIndex() only yields 0..6; give the remaining slots a real value
  for (i=7; i<edtsurf::ProteinSurface::NO_RAD_TYPES; ++i)
    pps.rasrad[i] = m_vdwr_X;

  pps.proberadius = m_probeRadius;
  pps.fixsf = 1.0 + qlib::trunc<int>(m_nDetail-1, 0, 99)*0.2;

  edtsurf::atom *proseq = new edtsurf::atom[natoms];
  std::vector<int> aidmap(natoms);

  // make atom array
  for (aiter.first(), i=0; aiter.hasMore() && i<natoms; aiter.next()) {
    MolAtomPtr pAtom = aiter.get();
    if (pAtom.isnull()) continue;

    // ATOM/HEATAM (??)
    proseq[i].simpletype = 1;

    // index number (atom index no)
    proseq[i].seqno = i;

    // atom type ID
    proseq[i].detail = getRadiusIndex(pAtom);

    // coordinates
    const Vector4D &pos = pAtom->getPos();
    proseq[i].x = (float) pos.x();
    proseq[i].y = (float) pos.y();
    proseq[i].z = (float) pos.z();
    
    proseq[i].ins = ' ';

    aidmap[i] = pAtom->getID();
    ++i;
  }

  int seqinit = 0;
  int seqterm = natoms-1;

  ///////////////////////

  if (m_nSurfType==DS_VDW) {
    MB_DPRINTLN("Initialize...");
    
    pps.initpara(seqinit, seqterm, proseq,
                 false, false);
    
    MB_DPRINTLN("actual boxlength %3d, box[%3d*%3d*%3d], scale factor %6.3f",
                pps.boxlength,
                pps.plength,
                pps.pwidth,
                pps.pheight,
                pps.scalefactor);
    
    MB_DPRINTLN("Build van der Waals solid");
    pps.fillvoxels(seqinit, seqterm, false,
                   proseq, true);
    pps.buildboundary();
    
    MB_DPRINTLN("Build triangulated surface");
    //if(inum[0]==1)
    //pps.marchingcubeorigin2(1);
    //  else if(inum[0]==2)
    pps.marchingcube(1);
  }
  else if (m_nSurfType==DS_SAS) {

    MB_DPRINTLN("Initialize...");
    pps.initpara(seqinit, seqterm,
                 proseq, false, true);
    MB_DPRINTLN("actual boxlength %3d, box[%3d*%3d*%3d], scale factor %6.3f",
                pps.boxlength,pps.plength,pps.pwidth,pps.pheight,pps.scalefactor);
    MB_DPRINTLN("Build solvent-accessible solid");
    pps.fillvoxels(seqinit, seqterm, false, proseq, true);
    pps.buildboundary();
    printf("Build triangulated surface\n");
    //if(inum[0]==1)
    //pps.marchingcubeorigin2(3);
    //    else if(inum[0]==2)
    pps.marchingcube(3);
  }
  else if (m_nSurfType==DS_SES) {

    MB_DPRINTLN("Initialize...");
    pps.initpara(seqinit, seqterm, proseq, true, true);
    MB_DPRINTLN("actual boxlength %3d, box[%3d*%3d*%3d], scale factor %6.3f",
                pps.boxlength,pps.plength,pps.pwidth,pps.pheight,pps.scalefactor);
    MB_DPRINTLN("Build solvent-accessible solid");
    pps.fillvoxels(seqinit, seqterm, true, proseq, true);
    pps.buildboundary();
    MB_DPRINTLN("Euclidean Distance Transform");
    pps.fastdistancemap();
    MB_DPRINTLN("Build triangulated surface");
    //if(inum[0]==1)
    //pps.marchingcubeorigin2(4);
    //    else if(inum[0]==2)
    pps.marchingcube(4);
  }
  else {
    MB_ASSERT(false);
    return;
  }
  
  ///////////////////////

  // pps.checkEuler();
  MB_DPRINTLN("No. vertices %d, No. triangles %d", pps.vertnumber, pps.facenumber);	

  pps.laplaciansmooth(1);
  pps.computenorm();
  MB_DPRINTLN("Output 3D model");
  // pps.checkinoutpropa();
  
  int nverts = pps.vertnumber;
  int nfaces = pps.facenumber;

  m_verts.resize(nverts);
  m_faces.resize(nfaces);

  double sfac = pps.scalefactor;
  Vector4D ptran(pps.ptran.x, pps.ptran.y, pps.ptran.z);
  for (i=0; i<nverts; ++i) {
    int ind = pps.verts[i].atomid;
    int aid = -1;
    if (ind>=0 && ind<aidmap.size()) {
      aid = aidmap[ind];
    }
    Vector4D norm(pps.verts[i].pn.x,
                  pps.verts[i].pn.y,
                  pps.verts[i].pn.z);

    Vector4D pos(pps.verts[i].x,
                 pps.verts[i].y,
                 pps.verts[i].z);
    pos = pos.divide(sfac) - ptran;

    m_verts.at(i).x = (float) pos.x();
    m_verts.at(i).y = (float) pos.y();
    m_verts.at(i).z = (float) pos.z();

    m_verts.at(i).nx = (float) norm.x();
    m_verts.at(i).ny = (float) norm.y();
    m_verts.at(i).nz = (float) norm.z();

    m_verts.at(i).info = aid;
  }

  for (i=0; i<nfaces; ++i) {
    m_faces.at(i).id1 = pps.faces[i].a;
    m_faces.at(i).id2 = pps.faces[i].b;
    m_faces.at(i).id3 = pps.faces[i].c;
  }

  delete [] proseq;
}

