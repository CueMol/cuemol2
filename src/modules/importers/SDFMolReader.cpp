// -*-Mode: C++;-*-
//
// MOL/SDF format molecule structure reader class
//

#include <common.h>

#include "SDFMolReader.hpp"

#include <qlib/LineStream.hpp>

#include <modules/molstr/MolChain.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/ResidIterator.hpp>
#include <modules/molstr/TopparManager.hpp>

using namespace molstr;
using namespace importers;

SDFMolReader::SDFMolReader()
{
  m_bLoadAltConf = true;
  m_bLoadAnisoU = true;
  m_bLoadSecstr = true;
  m_nReadAtoms = 0;
}

SDFMolReader::~SDFMolReader()
{
  MB_DPRINTLN("SDFMolReader destructed (%p)", this);
}

/////////////

const char *SDFMolReader::getName() const
{
  return "sdf";
}

const char *SDFMolReader::getTypeDescr() const
{
  return "MOL/SDF Coordinates (*.mol;*.sdf)";
}

const char *SDFMolReader::getFileExt() const
{
  return "*.mol; *.sdf";
}

qsys::ObjectPtr SDFMolReader::createDefaultObj() const
{
  return qsys::ObjectPtr(MB_NEW MolCoord());
}

/////////

/// read SDF from stream
bool SDFMolReader::read(qlib::InStream &ins)
{
  m_pMol = MolCoordPtr(getTarget<MolCoord>());

  m_nReadAtoms = 0;
  m_chainName = "_";
  m_nResInd = 0;

  qlib::LineStream lin(ins);
  LString str;
  
  for (;;) {
    readMol(lin);
    m_nResInd ++;
    
    for (;;) {
      str = lin.readLine();
      if (str.trim().isEmpty())
	return true;

      if (str.startsWith("$$$$"))
	break;
    }
  }
  
  // NOT REACHED
  return true;
}

/// read one MOL entry from stream
void SDFMolReader::readMol(qlib::LineStream &lin)
{
  LString cmpd_name = lin.readLine();
  cmpd_name = cmpd_name.trim(" \t\r\n");
  if (cmpd_name.isEmpty() && !lin.ready())
    return;
  lin.readLine();
  lin.readLine();
  LOG_DPRINTLN("SDFMolReader> reading compound <%s>", cmpd_name.c_str());

  LString str_ct = lin.readLine();

  LString str_natom = str_ct.substr(0,3);
  LString str_nbond = str_ct.substr(3,3);
  LString str_ver = str_ct.substr(33,6);

  if (!str_ver.equals(" V2000")) {
    LString msg = LString::format("Unsupported MOL/SDF version <%s>", str_ver.c_str());
    MB_THROW(SDFFormatException, msg);
  }

  int natom;
  if (!str_natom.toInt(&natom)) {
    LString msg = LString::format("Invalid natom <%s> in CT line", str_natom.c_str());
    MB_THROW(SDFFormatException, msg);
  }
  int nbond;
  if (!str_nbond.toInt(&nbond)) {
    LString msg = LString::format("Invalid nbond <%s> in CT line", str_nbond.c_str());
    MB_THROW(SDFFormatException, msg);
  }

  LOG_DPRINTLN("SDFMolReader> natom: %d", natom);
  LOG_DPRINTLN("SDFMolReader> nbond: %d", nbond);

  int i;
  LString str, sx, sy, sz, satom, aname;
  double xx, yy, zz;

  std::vector<int> elem_counts(ElemSym::MAX, 0);
  std::map<int,int> atommap;

  for (i=0; i<natom; ++i) {
    str = lin.readLine();
    if (str.trim().isEmpty())
      MB_THROW(SDFFormatException, "Atom lines too short");

    sx = str.substr(0,10);
    sy = str.substr(10,10);
    sz = str.substr(20,10);
    satom = str.substr(31,3).trim();
    // LOG_DPRINTLN("<%s>", sx.c_str());

    if (!sx.toDouble(&xx))
      MB_THROW(SDFFormatException, "invalid atom line (x coord):"+str);
    if (!sy.toDouble(&yy))
      MB_THROW(SDFFormatException, "invalid atom line (y coord):"+str);
    if (!sz.toDouble(&zz))
      MB_THROW(SDFFormatException, "invalid atom line (z coord):"+str);

    ElemID eleid = ElemSym::str2SymID(satom);
    elem_counts[eleid] += 1;
    aname = LString::format("%s%d", ElemSym::symID2Str(eleid).c_str(), elem_counts[eleid]);

    // LOG_DPRINTLN("Atom: %f, %f, %f, <%s> %d", xx, yy, zz, aname.c_str(), eleid);

    MolAtomPtr pAtom = MolAtomPtr(MB_NEW MolAtom());
    pAtom->setParentUID(m_pMol->getUID());
    pAtom->setName(aname);
    pAtom->setElement(eleid);

    pAtom->setChainName(m_chainName);
    pAtom->setResIndex(m_nResInd);
    pAtom->setResName(cmpd_name);
    
    pAtom->setPos(Vector4D(xx,yy,zz));
    pAtom->setBfac(0.0);
    pAtom->setOcc(1.0);
    
    int naid = m_pMol->appendAtom(pAtom);
    if (naid<0)
      MB_THROW(SDFFormatException, "invalid SDF format, appendAtom() failed!!");

    atommap.insert(std::pair<int,int>(i, naid));
    m_nReadAtoms++;
  }

  LOG_DPRINTLN("SDFMolReader> read %d atoms", m_nReadAtoms);

  int natm1, natm2, nbont;
  int natm_id1, natm_id2;
  std::map<int,int>::const_iterator iter;
  
  for (i=0; i<nbond; ++i) {
    str = lin.readLine();
    if (str.trim().isEmpty())
      MB_THROW(SDFFormatException, "Bond lines too short");

    if (!str.substr(0, 3).toInt(&natm1)) {
      MB_THROW(SDFFormatException, "Invalid bond line (atom1)");
    }
    if (!str.substr(3, 3).toInt(&natm2)) {
      MB_THROW(SDFFormatException, "Invalid bond line (atom2)");
    }
    if (!str.substr(6, 3).toInt(&nbont)) {
      MB_THROW(SDFFormatException, "Invalid bond line (bond type)");
    }

    iter = atommap.find(natm1-1);
    if (iter==atommap.end())
      MB_THROW(SDFFormatException, "Invalid bond line (bond atom1 not found)");
    natm_id1 = iter->second;

    iter = atommap.find(natm2-1);
    if (iter==atommap.end())
      MB_THROW(SDFFormatException, "Invalid bond line (bond atom2 not found)");
    natm_id2 = iter->second;

    MolBond *pB = m_pMol->makeBond(natm_id1, natm_id2, true);
    if (pB==NULL)
      MB_THROW(SDFFormatException, "makeBond failed");

    if (nbont==1)
      pB->setType(MolBond::SINGLE);
    else if (nbont==2)
      pB->setType(MolBond::DOUBLE);
    else if (nbont==3)
      pB->setType(MolBond::TRIPLE);
    else if (nbont>=4)
      pB->setType(MolBond::DELOC);

    //LOG_DPRINTLN("bond %d<-->%d: %d", natm_id1, natm_id2, nbont);
  }

}

