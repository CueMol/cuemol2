// -*-Mode: C++;-*-
//
// QDF MolCoord File writer class
//
// $Id: QdfMolWriter.cpp,v 1.5 2011/04/16 07:40:51 rishitani Exp $
//

#include <common.h>

#include "QdfMolWriter.hpp"

#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>

//#include <qlib/BinStream.hpp>

#include "MolResidue.hpp"
#include "MolCoord.hpp"
#include "MolChain.hpp"
#include "MolAtom.hpp"
// #include "ChainIterator.hpp"

using namespace molstr;

MC_DYNCLASS_IMPL(QdfMolWriter, QdfMolWriter, qlib::LSpecificClass<QdfMolWriter>);

QdfMolWriter::QdfMolWriter()
{
}

QdfMolWriter::~QdfMolWriter()
{
}

void QdfMolWriter::attach(qsys::ObjectPtr pMol)
{
  if (!canHandle(pMol)) {
    MB_THROW(qlib::InvalidCastException, "QdfMolWriter");
    return;
  }
  super_t::attach(pMol);
}

const char * QdfMolWriter::getTypeDescr() const
{
  return "CueMol data file (*.qdf)";
}

const char * QdfMolWriter::getFileExt() const
{
  return "*.qdf";
}

const char *QdfMolWriter::getName() const
{
  return "qdfmol";
}

bool QdfMolWriter::canHandle(qsys::ObjectPtr pobj) const
{
  return (dynamic_cast<MolCoord *>(pobj.get())!=NULL);
}

/////////

bool QdfMolWriter::write(qlib::OutStream &outs)
{
  MolCoord *pMol = mol();

  if (pMol==NULL) {
    LOG_DPRINTLN("PDBWriter> MolCoord is not attached !!");
    return false;
  }

  m_pMol = pMol;
  setFileType("MOL1");

  start(outs);

  writeChainData();

  writeResidData();

  writeAtomData();

  end();

  m_pMol = NULL;
  return true;
}

void QdfMolWriter::writeChainData()
{
  MolCoord::ChainIter iter = m_pMol->begin();
  MolCoord::ChainIter iend = m_pMol->end();
  int nChains = m_pMol->getChainSize();
  
  defineData("chai", nChains);

  defineRecord("name", QDF_TYPE_UTF8STR);
  defineRecord("id", QDF_TYPE_INT32);
  
  startData();

  for (int ind=0; iter!=iend; ++iter, ++ind) {
    MolChainPtr pChn = iter->second;
    LString chnam = (pChn->getName().c_str()); 
    startRecord();
    setRecValStr("name", chnam);
    setRecValInt32("id", ind);
    endRecord();
  }

  endData();
}

void QdfMolWriter::writeResidData()
{
  int nresid = 0;
  std::map<LString, int> propset;
  {
    MolCoord::ChainIter iter = m_pMol->begin();
    MolCoord::ChainIter cend = m_pMol->end();
    for (; iter!=cend; ++iter) {
      MolChainPtr pChn = iter->second;
      nresid += pChn->getSize();

      MolChain::ResidCursor riter = pChn->begin();
      MolChain::ResidCursor rend = pChn->end();
      for (; riter!=rend; ++riter) {
        MolResiduePtr pRes = *riter;
        MolResidue::StrPropTab::const_iterator rpiter = pRes->m_strProps.begin();
        MolResidue::StrPropTab::const_iterator rpend = pRes->m_strProps.end();
        for (; rpiter!=rpend; ++rpiter) {
          const LString &key = rpiter->first;
          const int type = QDF_TYPE_UTF8STR;
          propset.insert(std::pair<LString, int>(key, type));
        }
      }
    }
  }

  defineData("resi", nresid);

  defineRecord("name", QDF_TYPE_UTF8STR);
  defineRecord("id", QDF_TYPE_INT32);
  defineRecord("sind", QDF_TYPE_UTF8STR);
  defineRecord("chid", QDF_TYPE_INT32);

  startData();

  // define resid props
  {
    std::map<LString, int>::const_iterator rpiter = propset.begin();
    std::map<LString, int>::const_iterator rpend = propset.end();
    for (; rpiter!=rpend; ++rpiter) {
      defineRecord("prop_"+rpiter->first, rpiter->second);
    }
  }

  {
    m_ridmap.clear();
    MolCoord::ChainIter citer = m_pMol->begin();
    MolCoord::ChainIter cend = m_pMol->end();
    for (int ind=0; citer!=cend; ++citer, ++ind) {
      MolChainPtr pChn = citer->second;
      MolChain::ResidCursor riter = pChn->begin();
      MolChain::ResidCursor rend = pChn->end();
      for (int rind=0; riter!=rend; ++riter, ++rind) {
        MolResiduePtr pRes = *riter;
        startRecord();

        setRecValStr("name", pRes->getName());
        setRecValInt32("id", rind);
        setRecValStr("sind", pRes->getStrIndex());
        setRecValInt32("chid", ind);

        MolResidue::StrPropTab::const_iterator rpiter = pRes->m_strProps.begin();
        MolResidue::StrPropTab::const_iterator rpend = pRes->m_strProps.end();
        for (; rpiter!=rpend; ++rpiter) {
          const LString &key = rpiter->first;
          setRecValStr("prop_"+key, rpiter->second);
        }
        
        endRecord();

        // make rid map
        MolResidue::AtomCursor aiter = pRes->atomBegin();
        MolResidue::AtomCursor aiend = pRes->atomEnd();
        for (; aiter!=aiend; ++aiter) {
          m_ridmap.insert(std::pair<int,int>(aiter->second, rind));
        }

      }
    }
  }

  endData();
}

void QdfMolWriter::writeAtomData()
{
  int natoms = m_pMol->getAtomSize();
  defineData("atom", natoms);
  
  // name of atom
  defineRecord("name", QDF_TYPE_UTF8STR);
  // aid of atom
  defineRecord("id", QDF_TYPE_INT32);
  // residue index
  defineRecord("rid", QDF_TYPE_INT32);

  // element
  defineRecord("elem", QDF_TYPE_INT8);

  // conf ID
  defineRecord("conf", QDF_TYPE_INT8);

  defineRecord("posx", QDF_TYPE_FLOAT32);
  defineRecord("posy", QDF_TYPE_FLOAT32);
  defineRecord("posz", QDF_TYPE_FLOAT32);
  defineRecord("bfac", QDF_TYPE_FLOAT32);
  defineRecord("occ", QDF_TYPE_FLOAT32);

  startData();

  MolCoord::AtomIter aiter = m_pMol->beginAtom();
  MolCoord::AtomIter aiend = m_pMol->endAtom();

  for (; aiter!=aiend; ++aiter) {
    MolAtomPtr pAtom = aiter->second;
    int aid = aiter->first;
    std::map<int,int>::const_iterator irid = m_ridmap.find(aid);
    int rid = -1;
    if (irid!=m_ridmap.end())
      rid = irid->second;
    startRecord();
    setRecValStr("name", pAtom->getName());
    setRecValInt32("id", aiter->first);
    setRecValInt32("rid", rid);
    setRecValInt8("elem", pAtom->getElement());
    setRecValInt8("conf", pAtom->getConfID());

    setRecValFloat32("posx", qfloat32(pAtom->getPos().x()));
    setRecValFloat32("posy", qfloat32(pAtom->getPos().y()));
    setRecValFloat32("posz", qfloat32(pAtom->getPos().z()));
    setRecValFloat32("bfac", qfloat32(pAtom->getBfac()));
    setRecValFloat32("occ", qfloat32(pAtom->getOcc()));
    endRecord();
  }

  endData();
}

