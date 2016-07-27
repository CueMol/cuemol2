// -*-Mode: C++;-*-
//
// QdfMol Reader (PDB format version)
//

#include <common.h>

#include "QdfMolReader.hpp"
#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>
#include "MolCoord.hpp"

#define PROP_PFX "$"

using namespace molstr;

MC_DYNCLASS_IMPL(QdfMolReader, QdfMolReader, qlib::LSpecificClass<QdfMolReader>);

QdfMolReader::QdfMolReader()
     : super_t()
{
}

QdfMolReader::~QdfMolReader()
{
  MB_DPRINTLN("QdfMolReader destructed (%p)", this);
}

/////////////

const char *QdfMolReader::getTypeDescr() const
{
  return "CueMol data file (*.qdf)";
}

const char *QdfMolReader::getFileExt() const
{
  return "*.qdf";
}

const char *QdfMolReader::getName() const
{
  return "qdfmol";
}

qsys::ObjectPtr QdfMolReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW MolCoord());
}

/////////

// read PDB file from stream
bool QdfMolReader::read(qlib::InStream &ins)
{
  MolCoord *pObj = super_t::getTarget<MolCoord>();

  if (pObj==NULL) {
    LOG_DPRINTLN("QDFReader> MolCoord is not attached !!");
    return false;
  }

  m_pMol = pObj;

  start(ins);

  if (!getFileType().equals("MOL2")) {
    MB_THROW(qlib::FileFormatException, "invalid file format signature");
    return false;
  }

  // TO DO: read mol-level properties (cell params, etc)
  
  readChainData();

  readResidData();

  readAtomData();

  readBondData();
  
  end();

  m_chainTab.clear();
  m_residTab.clear();
  m_atomTab.clear();
  m_pMol = NULL;

  return true;
}

void QdfMolReader::readChainData()
{
  qsys::QdfInStream &in = getStream();
  int nelems = in.readDataDef("chai");
  in.readRecordDef();

  MolChainPtr pCh;

  for (int i=0; i<nelems; ++i) {
    in.startRecord();
    quint32 id = in.readUInt32("id");
    LString chname = in.readStr("name");

    pCh = MolChainPtr(MB_NEW MolChain());
    pCh->setParentUID(m_pMol->getUID());
    pCh->setName(chname);
    m_pMol->appendChain(pCh);
    m_chainTab.insert(ChainTab::value_type(id, pCh));

    in.endRecord();
  }
}

void QdfMolReader::readResidData()
{
  qsys::QdfInStream &in = getStream();
  int nelems = in.readDataDef("resi");
  in.readRecordDef();
  bool bHasIns = false;
  if (in.isDefined("ins"))
    bHasIns = true;
  
  MolResiduePtr pRes;
  ChainTab::const_iterator citer;

  for (int i=0; i<nelems; ++i) {
    in.startRecord();
    quint32 id = in.readUInt32("id");
    quint32 pid = in.readUInt32("pid");
    LString resname = in.readStr("name");

    qint32 idx = in.readInt32("idx");
    qint8 ins = 0;
    if (bHasIns)
      ins = in.readInt8("ins");
    ResidIndex resind(idx, ins);
    
    pRes = MolResiduePtr(MB_NEW MolResidue());

    // TO DO: read residue props

    citer = m_chainTab.find(pid);
    if (citer==m_chainTab.end()) {
      // ERROR, inconsistent data
      LOG_DPRINTLN("QdfMol> ERROR!!!");
      continue;
    }

    pRes->setParentUID(m_pMol->getUID());
    pRes->setIndex(resind);
    pRes->setName(resname);
    citer->second->appendResidue(pRes);
    
    m_residTab.insert(ResidTab::value_type(id, pRes));

    in.endRecord();
  }
}

void QdfMolReader::readAtomData()
{
  qsys::QdfInStream &in = getStream();
  int nelems = in.readDataDef("atom");
  in.readRecordDef();
  
  MolAtomPtr pAtom;
  MolResiduePtr pRes;
  MolChainPtr pCh;
  ResidTab::const_iterator riter;

  for (int i=0; i<nelems; ++i) {
    in.startRecord();
    quint32 id = in.readUInt32("id");
    quint32 pid = in.readUInt32("pid");
    LString atomname = in.readStr("name");
    qint8 conf = in.readInt8("conf");
    ElemID elem = in.readUInt8("elem");
    qfloat32 posx = in.readFloat32("posx");
    qfloat32 posy = in.readFloat32("posy");
    qfloat32 posz = in.readFloat32("posz");
    qfloat32 bfac = in.readFloat32("bfac");
    qfloat32 occ = in.readFloat32("occ");

    pAtom = MolAtomPtr(MB_NEW MolAtom());

    pAtom->setParentUID(m_pMol->getUID());
    pAtom->setName(atomname);
    pAtom->setConfID(conf);
    pAtom->setElement(elem);

    riter = m_residTab.find(pid);
    if (riter==m_residTab.end()) {
      // ERROR, inconsistent data
      LOG_DPRINTLN("QdfMol> ERROR!!!");
      continue;
    }

    pRes = riter->second;
    pCh = pRes->getParentChain();

    pAtom->setChainName(pCh->getName());
    pAtom->setResIndex(pRes->getIndex());
    pAtom->setResName(pRes->getName());

    pAtom->setPos(qlib::Vector4D(posx, posy, posz));
    pAtom->setBfac(bfac);
    pAtom->setOcc(occ);

    int naid = m_pMol->appendAtom(pAtom);
    if (naid<0) {
      // ERROR, inconsistent data
      LOG_DPRINTLN("QdfMol> ERROR!!!");
      continue;
    }

    m_atomTab.insert(AtomTab::value_type(id, pAtom));
    in.endRecord();
  }
  
}

void QdfMolReader::readBondData()
{
  qsys::QdfInStream &in = getStream();
  int nelems = in.readDataDef("bond");
  in.readRecordDef();
  
  AtomTab::const_iterator aiter;
  MolAtomPtr pAtom1;
  MolAtomPtr pAtom2;

  for (int i=0; i<nelems; ++i) {
    in.startRecord();
    quint32 id = in.readUInt32("id");
    quint32 aid1 = in.readUInt32("aid1");
    quint32 aid2 = in.readUInt32("aid2");

    aiter = m_atomTab.find(aid1);
    if (aiter==m_atomTab.end()) {
      // ERROR, inconsistent data
      LOG_DPRINTLN("QdfMol> ERROR!!!");
      continue;
    }
    pAtom1 = aiter->second;

    aiter = m_atomTab.find(aid2);
    if (aiter==m_atomTab.end()) {
      // ERROR, inconsistent data
      LOG_DPRINTLN("QdfMol> ERROR!!!");
      continue;
    }
    pAtom2 = aiter->second;

    quint8 ntype = in.readUInt8("type");
    quint8 nudef = in.readUInt8("udef");
    
    MolBond *pBond = m_pMol->makeBond(pAtom1->getID(), pAtom2->getID(), (nudef==1)?true:false);
    pBond->setType(ntype);

    in.endRecord();
  }
}

