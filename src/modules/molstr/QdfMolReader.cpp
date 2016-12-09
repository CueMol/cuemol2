// -*-Mode: C++;-*-
//
// QdfMol Reader
//

#include <common.h>

#include "QdfMolReader.hpp"
#include <qlib/ClassRegistry.hpp>
#include <qlib/LClassUtils.hpp>
#include <qlib/Utils.hpp>
#include <qsys/ObjExtData.hpp>
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
  return "CueMol coordinates file (*.qdf)";
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

  LString sft = getFileType();
  if (!sft.equals("MOL2")) {
    LString msg = LString::format("QdfMol invalid file format signature %s", sft.c_str());
    MB_THROW(qlib::FileFormatException, msg);
    return false;
  }

  readMolData();
  
  readChainData();

  readResidData();

  readAtomData();

  readBondData();
  
  end();

  m_chainTab.clear();
  m_residTab.clear();
  m_atomTab.clear();

  // Apply automatic topology/linkage information
  m_pMol->applyTopology();

  m_pMol = NULL;

  return true;
}

void QdfMolReader::readMolData()
{
  qsys::QdfInStream &in = getStream();
  int nelems = in.readDataDef("mol");
  if (nelems==0)
    return;

  if (nelems>1) {
    MB_THROW(qlib::FileFormatException, "invalid moldata size");
    return;
  }

  qsys::ObjExtData::DataTab values;
  std::set<LString> clsnames;

  in.readRecordDef();
  in.startRecord();
  while (!in.isRecEnd()) {
    const RecElem &re = in.getNextElem();
	    
    if (re.second!=QDF_TYPE_FIXSTR8 &&
        re.second!=QDF_TYPE_FIXSTR16 &&
        re.second!=QDF_TYPE_FIXSTR32) {
      MB_THROW(qlib::FileFormatException, "invalid moldata valuetype");
      return;
    }
    // 1==strlen(PROP_PFX)
    LString propname = re.first;
    LString value = in.readStr(re.first);
    values.forceSet(propname, value);

    int dotpos = propname.indexOf('.');
    LString clsname = propname.substr(0, dotpos);
    clsnames.insert(clsname);
  }

  BOOST_FOREACH (const LString &elem, clsnames) {
    qsys::ObjExtDataPtr pExt = m_pMol->getCreateExtData(elem);
    if (!pExt.isnull())
      pExt->readQdfData(values);
  }

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
  LOG_DPRINTLN("QdfMol> read %d chains.", m_chainTab.size());
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

    // Read residue props
    while (!in.isRecEnd()) {
      const RecElem &re = in.getNextElem();
      if (!re.first.startsWith(PROP_PFX)) {
        break;
      }
      if (re.second!=QDF_TYPE_FIXSTR8 &&
          re.second!=QDF_TYPE_FIXSTR16 &&
          re.second!=QDF_TYPE_FIXSTR32) {
        break;
      }
      // 1==strlen(PROP_PFX)
      LString propname = re.first.substr(1);
      LString value = in.readStr(re.first);
      pRes->setPropStr(propname, value);
    }

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

  LOG_DPRINTLN("QdfMol> read %d residues.", m_residTab.size());
}

void QdfMolReader::readAtomData()
{
  qsys::QdfInStream &in = getStream();
  int nelems = in.readDataDef("atom");
  in.readRecordDef();
  
  bool bHasAnisou = false;
  if (in.isDefined("u00"))
    bHasAnisou = true;

  MolAtomPtr pAtom;
  MolResiduePtr pRes;
  MolChainPtr pCh;
  ResidTab::const_iterator riter;

  for (int i=0; i<nelems; ++i) {
    in.startRecord();
    quint32 id = in.readUInt32("id");
    quint32 pid = in.readUInt32("pid");
    LString atomname = in.readStr("name");
    LString cname = in.readStr("cnam");
    qint8 conf = in.readInt8("conf");
    ElemID elem = in.readUInt8("elem");
    qfloat32 posx = in.readFloat32("posx");
    qfloat32 posy = in.readFloat32("posy");
    qfloat32 posz = in.readFloat32("posz");
    qfloat32 bfac = in.readFloat32("bfac");
    qfloat32 occ = in.readFloat32("occ");

    qfloat32 u00 = 0.0f;
    qfloat32 u01 = 0.0f;
    qfloat32 u02 = 0.0f;
    qfloat32 u11 = 0.0f;
    qfloat32 u12 = 0.0f;
    qfloat32 u22 = 0.0f;
    if (bHasAnisou) {
      u00 = in.readFloat32("u00");
      u01 = in.readFloat32("u01");
      u02 = in.readFloat32("u02");
      u11 = in.readFloat32("u11");
      u12 = in.readFloat32("u12");
      u22 = in.readFloat32("u22");
    }
    
    pAtom = MolAtomPtr(MB_NEW MolAtom());

    pAtom->setParentUID(m_pMol->getUID());
    pAtom->setName(atomname);
    pAtom->setCName(cname);
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

    if (qlib::isNear(u00, 0.0f) &&
        qlib::isNear(u01, 0.0f) &&
        qlib::isNear(u02, 0.0f) &&
        qlib::isNear(u11, 0.0f) &&
        qlib::isNear(u12, 0.0f) &&
        qlib::isNear(u22, 0.0f)) {
      ;
    }
    else {
      pAtom->setU(0,0,u00);
      pAtom->setU(0,1,u01);
      pAtom->setU(0,2,u02);
      pAtom->setU(1,1,u11);
      pAtom->setU(1,2,u12);
      pAtom->setU(2,2,u22);
    }

    // Set Atom Props
    while (!in.isRecEnd()) {
      const RecElem &re = in.getNextElem();
      if (!re.first.startsWith(PROP_PFX))
        break;
      LString nm = re.first.substr(1);
      switch (re.second) {
      case QDF_TYPE_BOOL:
        pAtom->setAtomPropBool(nm, in.readBool(re.first));
        break;
      case QDF_TYPE_INT32:
        pAtom->setAtomPropInt(nm, in.readInt32(re.first));
        break;
      case QDF_TYPE_FLOAT32:
        pAtom->setAtomPropReal(nm, in.readFloat32(re.first));
        break;
      case QDF_TYPE_FIXSTR8:
      case QDF_TYPE_FIXSTR16:
      case QDF_TYPE_FIXSTR32:
        pAtom->setAtomPropStr(nm, in.readStr(re.first));
        break;
      default:
        break;
      }
    }

    // Append atom to the molecule
    int naid = m_pMol->appendAtom(pAtom);
    if (naid<0) {
      // ERROR, inconsistent data
      LOG_DPRINTLN("QdfMol> ERROR: appendAtom failed!!!");
      continue;
    }

    m_atomTab.insert(AtomTab::value_type(id, pAtom));
    in.endRecord();
  }
  
  LOG_DPRINTLN("QdfMol> read %d atoms.", m_atomTab.size());
}

void QdfMolReader::readBondData()
{
  qsys::QdfInStream &in = getStream();
  int nelems = in.readDataDef("bond");
  if (nelems==0)
    return;
  
  in.readRecordDef();
  
  AtomTab::const_iterator aiter;
  MolAtomPtr pAtom1;
  MolAtomPtr pAtom2;
  int nread_bonds = 0;
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
    
    if (nudef==1) {
      // load only the user-defined bonds
      // (other bonds will be created by applyTopology())
      MolBond *pBond = m_pMol->makeBond(pAtom1->getID(), pAtom2->getID(), true);
      pBond->setType(ntype);
      ++nread_bonds;
    }

    in.endRecord();
  }

  LOG_DPRINTLN("QdfMol> read %d user defined bonds.", nread_bonds);
}

