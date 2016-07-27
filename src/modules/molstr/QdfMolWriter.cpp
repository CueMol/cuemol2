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

#define PROP_PFX "$"

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

  writeBondData();

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
  // residue name
  os.defFixedStr("name", nmax_name);
  // residue index (and insertion code)
  os.defInt32("idx");
  if (bHasIns)
    os.defInt8("ins");

  // define resid props
  {
    std::map<LString, int>::const_iterator rpiter = propset.begin();
    std::map<LString, int>::const_iterator rpend = propset.end();
    for (; rpiter!=rpend; ++rpiter) {
      os.defFixedStr(PROP_PFX+(rpiter->first), rpiter->second);
      MB_DPRINTLN("QdfMolWriter> resid prop <%s> defined", rpiter->first.c_str());
    }
    MB_DPRINTLN("QdfMolWriter> %d resid props defined", propset.size());
  }

  startData();

  {
    quint32 iResID = 0;

    //m_ridmap.clear();
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

        {
          LString value;
          std::map<LString, int>::const_iterator rpiter = propset.begin();
          std::map<LString, int>::const_iterator rpend = propset.end();
          for (; rpiter!=rpend; ++rpiter) {
            const LString &key = rpiter->first;
            if (!pRes->getPropStr(key, value))
              value = LString();
            os.writeFixedStr(PROP_PFX+key, value);
          }
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
  int nmax_name = 0;
  
  typedef std::map<LString, RecElem> TypeMap;

  MolCoord::AtomIter aiter, aiend = m_pMol->endAtom();
  TypeMap prop_typemap;
  for (aiter = m_pMol->beginAtom(); aiter!=aiend; ++aiter) {
    MolAtomPtr pAtom = aiter->second;
    nmax_name = qlib::max(nmax_name, pAtom->getName().length());
    std::set<LString> propnames;
    pAtom->getAtomPropNames(propnames);
    BOOST_FOREACH (const LString &nm, propnames) {
      
      LString type = pAtom->getPropTypeName(nm);
      RecElem re;
      re.first = nm;
      if (type.equals("boolean")) {
        re.second = QDF_TYPE_BOOL;
      }
      else if (type.equals("integer")) {
        re.second = QDF_TYPE_INT32;
      }
      else if (type.equals("real")) {
        re.second = QDF_TYPE_FLOAT32;
      }
      else if (type.equals("string")) {
        re.second = QDF_TYPE_FIXSTR8;
        LString value = pAtom->getAtomPropStr(nm);
        re.nmaxlen = value.length();
      }
      else {
        MB_THROW(qlib::RuntimeException, "");
      }

      TypeMap::iterator ii = prop_typemap.find(nm);
      if (ii==prop_typemap.end()) {
        prop_typemap.insert(TypeMap::value_type(nm, re));
      }
      else {
        if (re.second==QDF_TYPE_FIXSTR8) {
          re.nmaxlen = qlib::max(ii->second.nmaxlen, re.nmaxlen);
        }
        ii->second = re;
      }
    } // BOOST_FOREACH (const LString &nm, propnames) {
  }
  
  int natoms = m_pMol->getAtomSize();
  qsys::QdfOutStream &os = getStream();

  os.defData("atom", natoms);

  // Atom UID
  os.defUID("id");

  // parent UID (residue UID)
  os.defUID("pid");

  // atom name
  os.defFixedStr("name", nmax_name);

  // XXX TO DO: save cname!!

  // conf ID
  os.defInt8("conf");

  // element ID
  os.defUInt8("elem");

  // xyzob
  os.defFloat32("posx");
  os.defFloat32("posy");
  os.defFloat32("posz");
  os.defFloat32("bfac");
  os.defFloat32("occ");

  // XXX TO DO: save ANISOU!!

  // props
  BOOST_FOREACH (const TypeMap::value_type &elem, prop_typemap) {
    const LString &nm = elem.first;
    const RecElem &re = elem.second;
    LString recname = PROP_PFX+nm;
    if (re.second==QDF_TYPE_FIXSTR8)
      os.defFixedStr(recname, re.nmaxlen);
    else
      os.defineRecord(recname, re.second);
    MB_DPRINTLN("QdfMolWriter> atom prop <%s> defined", nm.c_str());
  }
  MB_DPRINTLN("QdfMolWriter> %d atom props defined", prop_typemap.size());

  startData();

  aiter = m_pMol->beginAtom();
  quint32 iAtomID = 0;
  for (; aiter!=aiend; ++aiter, ++iAtomID) {
    MolAtomPtr pAtom = aiter->second;
    MolResiduePtr pRes = pAtom->getParentResidue();
    quint32 iResID = getResidUID(pRes);

    startRecord();
    os.writeUInt32("id", iAtomID);
    os.writeUInt32("pid", iResID);
    os.writeFixedStr("name", pAtom->getName());
    
    // XXX TO DO: save cname!!
    
    os.writeInt8("conf", pAtom->getConfID());
    os.writeUInt8("elem", pAtom->getElement());

    os.writeFloat32("posx", qfloat32(pAtom->getPos().x()));
    os.writeFloat32("posy", qfloat32(pAtom->getPos().y()));
    os.writeFloat32("posz", qfloat32(pAtom->getPos().z()));
    os.writeFloat32("bfac", qfloat32(pAtom->getBfac()));
    os.writeFloat32("occ", qfloat32(pAtom->getOcc()));

    // XXX TO DO: save ANISOU!!

    // XXX TO DO: save PROPS!!

    endRecord();

    m_atommap.insert(std::pair<int, quint32>(aiter->first, iAtomID));
  }

  endData();
}

void QdfMolWriter::writeBondData()
{
  int nbons = m_pMol->getBondSize();
  qsys::QdfOutStream &os = getStream();

  os.defData("bond", nbons);

  // Bond UID
  os.defUID("id");

  // Atom UID 1,1
  os.defUID("aid1");
  os.defUID("aid2");

  // Bond valence type
  os.defUInt8("type");

  // User-defined bond flag
  os.defUInt8("udef");

  startData();

  MolCoord::BondIter iter = m_pMol->beginBond();
  MolCoord::BondIter iend = m_pMol->endBond();
  quint32 iBondID = 0;
  for (; iter!=iend; ++iter, ++iBondID) {
    MolBond *pBond = iter->second;

    quint32 aid1 = getAtomUID(pBond->getAtom1());
    quint32 aid2 = getAtomUID(pBond->getAtom2());

    startRecord();

    os.writeUInt32("id", iBondID);
    os.writeUInt32("aid1", aid1);
    os.writeUInt32("aid2", aid2);

    os.writeUInt8("type", pBond->getType());
    os.writeUInt8("udef", pBond->isPersist()?1:0 );

    endRecord();
  }

  endData();
}

