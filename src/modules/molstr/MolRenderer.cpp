// -*-Mode: C++;-*-
//
//  Superclass of molecular renderers
//
//  $Id: MolRenderer.cpp,v 1.34 2011/04/27 14:40:30 rishitani Exp $

#include <common.h>

#include "MolRenderer.hpp"
#include "MolCoord.hpp"
#include "AtomIterator.hpp"
// #include "BondIterator.hpp"
// #include "Selection.hpp"
#include "SelCommand.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/Hittest.hpp>

#include <qlib/Array.hpp>
#include <qlib/RangeSet.hpp>

// for $molcol implementation
#include <gfx/MolColorRef.hpp>
#include "MolCoord.hpp"
#include "AnimMol.hpp"

using namespace molstr;

MolRenderer::MolRenderer()
  : super_t(), ColSchmHolder()
{
  m_bUseAnim = false;
}

MolRenderer::MolRenderer(const MolRenderer &r)
  : super_t(r)
{
  m_pSel = r.m_pSel;
}

MolRenderer::~MolRenderer()
{
}

//////////////////////////////////////////////////////////////////////////

void MolRenderer::setSelection(SelectionPtr pSel)
{
  m_pSel = pSel;
}

SelectionPtr MolRenderer::getSelection() const
{
  return m_pSel;
}

void MolRenderer::attachObj(qlib::uid_t obj_uid)
{
  super_t::attachObj(obj_uid);
  
  MolCoordPtr pObj = getClientMol();
  qlib::LScrSp<AnimMol> pAM(pObj, qlib::no_throw_tag());
  if (pAM.isnull())
    m_bUseAnim = false;
  else
    m_bUseAnim = true;

  LOG_DPRINTLN("MolRenderer> UseAnim = %d", m_bUseAnim);
}


MolCoordPtr MolRenderer::getClientMol() const
{
  return MolCoord::getMolByID(getClientObjID(), qlib::no_throw_tag());
}

bool MolRenderer::isCompatibleObj(qsys::ObjectPtr pobj) const
{
  MolCoord *ptest = dynamic_cast<MolCoord *>(pobj.get());
  return ptest!=NULL;
}

LString MolRenderer::toString() const
{
  return LString::format("MolRenderer %p", this);
}

void MolRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("sel")) {
    invalidateDisplayCache();
    LOG_DPRINTLN("MolRenderer(%s) cache invalidated.", getName().c_str());
  }
  else if (ev.getName().equals("defaultcolor")||
           ev.getName().equals("coloring")||
           ev.getParentName().equals("coloring")||
           ev.getParentName().startsWith("coloring.")) {
    invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void MolRenderer::objectChanged(qsys::ObjectEvent &ev)
{
  if (ev.getType()==qsys::ObjectEvent::OBE_PROPCHG) {
    qlib::LPropEvent *pPE = ev.getPropEvent();
    if (pPE) {
      if (pPE->getName().equals("defaultcolor")||
          pPE->getName().equals("coloring")||
          pPE->getParentName().equals("coloring")||
          pPE->getParentName().startsWith("coloring.")) {
        invalidateDisplayCache();
        return;
      }
    }
  }

  if (isUseVer2Iface()) {
    // Default update behavior for renderer ver2 interface
    if (isVisible() &&
        ev.getType()==qsys::ObjectEvent::OBE_CHANGED_DYNAMIC &&
        ev.getDescr().equals("atomsMoved")) {
      // OBE_CHANGED_DYNAMIC && descr=="atomsMoved"
      if (isUseAnim()) {
        // If shader is available
        // --> Enter the GLSL mode
        if (isShaderAvail() && !isShaderEnabled()) {
          setShaderEnable(true);
        }

        if (!isCacheAvail()) {
          // Cache is NOT available
          // --> create/update coord and color
          createDisplayCache();
          return;
        }

        // Cache is available
        // --> only update coordinates
        if (isUseShader()) {
          if (isUseAnim())
            updateDynamicGLSL();
          else
            updateStaticGLSL();
        }
        else {
          if (isUseAnim())
            updateDynamicVBO();
          else
            updateStaticVBO();
        }
        return;
      }
    }
    else if (ev.getType()==qsys::ObjectEvent::OBE_CHANGED_FIXDYN) {
      MB_DPRINTLN("MolRend (%d/%p) > OBE_CHANGED_FIXDYN called!!", getUID(), this);
      
      if (!isForceGLSL()) {
	// reset to VBO mode
	setShaderEnable(false);
	// Clean-up the VBO data/cache to update the rendering
        invalidateDisplayCache();
      }

      return;
    }
  }

  super_t::objectChanged(ev);
}

LString MolRenderer::interpHitAidImpl(MolAtomPtr pAtom)
{
  LString rval;
  
  // Atom ID (for context menu)
  rval += LString::format("\"atom_id\": %d, ", pAtom->getID());

  // Message (for status line)
  if (!pAtom.isnull()) {
    rval += "\"message\": \""+ pAtom->formatMsg() + "\", ";
    rval += "\"occ\": "+ LString::format("%.2f", pAtom->getOcc()) + ", ";
    rval += "\"bfac\": "+ LString::format("%.2f", pAtom->getBfac()) + ", ";

    rval += "\"x\": "+ LString::format("%.2f", pAtom->getPos().x()) + ", ";
    rval += "\"y\": "+ LString::format("%.2f", pAtom->getPos().y()) + ", ";
    rval += "\"z\": "+ LString::format("%.2f", pAtom->getPos().z()) + ", ";
  }

  return rval;
}

LString MolRenderer::interpHit(const gfx::RawHitData &rhit)
{
  qlib::uid_t rend_id = getUID();
  int nsize = rhit.getDataSize(rend_id);
  if (nsize<=0)
    return LString();

  LString rval;
  int aid;

  rval += "\"objtype\": \"MolCoord\",\n";
  rval += LString::format("\"size\": %d, ", nsize);

  if (nsize==1) {
    // Single hit
    aid = rhit.getDataAt(rend_id, 0, 0);

    if (aid<0) {
      MB_DPRINTLN("MolRend> invalid hitdata entry ignored");
      return LString();
    }

    // Selection str
    rval += LString::format("\"sel\": \"aid %d\", ", aid);

    MolAtomPtr pAtom = getClientMol()->getAtom(aid);
    rval += interpHitAidImpl(pAtom);

  }
  else {
    // Multiple hit (--> selection string only)
    qlib::RangeSet<int> range;

    for (int ii=0; ii<nsize; ++ii) {
      aid = rhit.getDataAt(rend_id, ii, 0);
      if (aid<0) {
        MB_DPRINTLN("MolRend> invalid hitdata entry (%d) ignored", ii);
        continue;
      }
      range.append(aid, aid+1);
    }

    // Selection str
    if (range.isEmpty())
      rval += "\"sel\": \"none\", ";
    else
      rval += "\"sel\": \"aid "+ qlib::rangeToString(range) +"\", ";

    return rval;
  }
  
  return rval;

}

Vector4D MolRenderer::getCenter() const
{
  // MolAtomRenderer *pthis = const_cast<MolAtomRenderer *>(this);
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull()) return Vector4D();
  
  AtomIterator iter(pMol, getSelection());
    
  Vector4D pos;
  int i=0;
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolAtomPtr pAtom = iter.get();
    pos += pAtom->getPos();
    i++;
  }

  if (i==0) {
    // TO DO: throw exception
    MB_DPRINT("MolRenderer> cannot determine the center for ");
    MB_DPRINTLN("%s (UID=%d)", getClientMol()->getName().c_str(), getClientMol()->getUID());
    //LOG_DPRINTLN("%s:%s",
    //(pthis->getClientMol()->getName()).c_str(),
    //getName().c_str());
    return Vector4D();
  }

  pos = pos.divide(double(i));
  return pos;
}

bool MolRenderer::hasCenter() const
{
  MolCoordPtr pMol = getClientMol();
  if (pMol.isnull())
    return false;
  
  AtomIterator iter(pMol, getSelection());
    
  // check if the selection matches more than one atoms.
  int i=0;
  for (iter.first(); iter.hasMore(); iter.next()) {
    //MolAtomPtr pAtom = iter.get();
    //pos += pAtom->getPos();
    i++;
    break;
  }

  if (i==0) {
    return false;
  }

  return true;
}


//static
ColorPtr MolRenderer::evalMolColor(ColorPtr pCol, ColorPtr pCol2)
{
  gfx::MolColorRef *pNmcol = dynamic_cast<gfx::MolColorRef *>(pCol.get());
  if (pNmcol==NULL)
    return pCol;

  // apply modifications of pCol(molcol) to pCol2 (refcol)
  return pNmcol->modifyColor(pCol2);
}


void MolRenderer::createDisplayCache()
{
  if (isUseShader()) {
    createGLSL();
    if (isUseAnim())
      updateDynamicGLSL();
    else
      updateStaticGLSL();
    updateGLSLColor();
  }
  else {
    createVBO();
    if (isUseAnim())
      updateDynamicVBO();
    else
      updateStaticVBO();
    updateVBOColor();
  }
}

