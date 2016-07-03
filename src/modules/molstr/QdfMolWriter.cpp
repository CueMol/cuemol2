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
  setFileType("MOL2");

  start(outs);

  // TO DO: write mol-level properties (cell params, etc)
  
  writeChainData();

  writeResidData();

  writeAtomData();

  end();

  m_pMol = NULL;
  return true;
}

void QdfMolWriter::writeChainData()
{
  MolCoord::ChainIter iter, iend = m_pMol->end();

  int nmax_name = 0;
  for (iter = m_pMol->begin(); iter!=iend; ++iter) {
    MolChainPtr pChn = iter->second;
    int len = pChn->getName().length();
    nmax_name = qlib::max(len, nmax_name);
  }
  MB_DPRINTLN("QdfMolWr> max chain name length: %d", nmax_name);
  
  int nChains = m_pMol->getChainSize();
  qsys::QdfOutStream &os = getStream();
  
  os.defData("chai", nChains);

  os.defUID("id");
  os.defFixedStr("name", nmax_name);
  
  startData();
  
  quint32 ind=0;
  iter = m_pMol->begin();
  for (; iter!=iend; ++iter, ++ind) {
    MolChainPtr pChn = iter->second;
    LString chnam = pChn->getName();
    startRecord();
    os.writeUInt32("id", ind);
    os.writeFixedStr("name", chnam);
    endRecord();
    m_chmap.insert(std::pair<qlib::qvoidp, quint32>((qlib::qvoidp)pChn.get(), ind));
  }

  endData();
}

void QdfMolWriter::writeResidData()
{
  int nresid = 0;
  int nmax_name = 0;
  bool bHasIns = false;

  // propset (property name --> value str's max length
  std::map<LString, int> propset;
  {
    MolCoord::ChainIter citer = m_pMol->begin();
    MolCoord::ChainIter cend = m_pMol->end();
    for (; citer!=cend; ++citer) {
      MolChainPtr pChn = citer->second;
      nresid += pChn->getSize();

      MolChain::ResidCursor riter = pChn->begin();
      MolChain::ResidCursor rend = pChn->end();
      for (; riter!=rend; ++riter) {
        MolResiduePtr pRes = *riter;

        // check name length
        nmax_name = qlib::max( nmax_name, pRes->getName().length() );

        // check ins code
        ResidIndex resid = pRes->getIndex();
        if (resid.second!='\0')
          bHasIns = true;

        // check strprops (and value maxlen)
        MolResidue::StrPropTab::const_iterator rpiter = pRes->m_strProps.begin();
        MolResidue::StrPropTab::const_iterator rpend = pRes->m_strProps.end();
        for (; rpiter!=rpend; ++rpiter) {
          const LString &key = rpiter->first;
          const LString &val = rpiter->second;
          std::map<LString, int>::iterator ii = propset.find(key);
          if (ii==propset.end()) {
            propset.insert(std::pair<LString, int>(key, val.length()));
          }
          else {
            int nmax = qlib::max(ii->second, val.length());
            ii->second = nmax;
          }
        } // for (; rpiter!=rpend; ++rpiter) {

      } // for (; riter!=rend; ++riter) {

    } // for (; iter!=cend; ++iter) {
  }

  qsys::QdfOutStream &os = getStream();

  os.defData("resi", nresid);

  // residue UID
  os.defUID("id");
  // parent UID (chain ID)
  os.defUID("pid");
  os.defFixedStr("name", nmax_name);
  os.defInt32("idx");
  if (bHasIns)
    os.defInt8("ins");

  // define resid props
  {
    std::map<LString, int>::const_iterator rpiter = propset.begin();
    std::map<LString, int>::const_iterator rpend = propset.end();
    for (; rpiter!=rpend; ++rpiter) {
      os.defFixedStr("prop_"+(rpiter->first), rpiter->second);
    }
  }

  startData();

  {
    quint32 iResID = 0;

    m_ridmap.clear();
    MolCoord::ChainIter citer = m_pMol->begin();
    MolCoord::ChainIter cend = m_pMol->end();
    for (; citer!=cend; ++citer) {
      MolChainPtr pChn = citer->second;
      quint32 iChID = getChainUID(pChn);
      MolChain::ResidCursor riter = pChn->begin();
      MolChain::ResidCursor rend = pChn->end();
      for (; riter!=rend; ++riter, ++iResID) {
        MolResiduePtr pRes = *riter;
        startRecord();

        os.writeUInt32("id", iResID);
        os.writeUInt32("pid", iChID);
        os.writeFixedStr("name", pRes->getName());
        ResidIndex idx = pRes->getIndex();
        os.writeInt32("idx", idx.first);
        if (bHasIns)
          os.writeInt8("ins", idx.second);

        MolResidue::StrPropTab::const_iterator rpiter = pRes->m_strProps.begin();
        MolResidue::StrPropTab::const_iterator rpend = pRes->m_strProps.end();
        for (; rpiter!=rpend; ++rpiter) {
          const LString &key = rpiter->first;
          os.writeFixedStr("prop_"+key, rpiter->second);
        }
        
        endRecord();
        m_resmap.insert(std::pair<qlib::qvoidp, quint32>((qlib::qvoidp)pRes.get(), iResID));

        /*
        // make rid map
        MolResidue::AtomCursor aiter = pRes->atomBegin();
        MolResidue::AtomCursor aiend = pRes->atomEnd();
        for (; aiter!=aiend; ++aiter) {
          m_ridmap.insert(std::pair<int,int>(aiter->second, iResID));
        }
         */
      }
    }
  }

  endData();
}

void QdfMolWriter::writeAtomData()
{
  int natoms = m_pMol->getAtomSize();
  int nmax_name = 0;
  
  MolCoord::AtomIter aiter, aiend = m_pMol->endAtom();
  std::map<LString, RecElem> prop_typemap;
  for (aiter = m_pMol->beginAtom(); aiter!=aiend; ++aiter) {
    MolAtomPtr pAtom = aiter->second;
    nmax_name = qlib::max(nmax_name, pAtom->getName().length());
    std::set<LString> propnames;
    pAtom->getAtomPropNames(propnames);
    BOOST_FOREACH (const LString &elem, propnames) {
      LString type = pAtom->getPropTypeName(elem);
      //if (type.
      prop_typemap.insert(std::pair<LString, LString>(elem, type));
    }
  }
  
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

