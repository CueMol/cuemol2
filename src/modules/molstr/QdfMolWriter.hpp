// -*-Mode: C++;-*-
//
// QDF MolCoord File writer class
//

#ifndef MOLSTR_QDFMOL_WRITER_HPP
#define MOLSTR_QDFMOL_WRITER_HPP

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/QdfAbsWriter.hpp>

namespace molstr {

using qlib::LString;

class QdfMolWriter : public qsys::QdfAbsWriter
{
  //MC_SCRIPTABLE;
  MC_DYNCLASS;

private:
  typedef qsys::QdfAbsWriter super_t;

  MolCoord *m_pMol;

public:
  QdfMolWriter();
  virtual ~QdfMolWriter();

  /// Attach to and lock the target object
  virtual void attach(qsys::ObjectPtr pObj);

  /// Write to the stream
  virtual bool write(qlib::OutStream &outs);

  /// Get file-type description
  virtual const char *getTypeDescr() const;

  /// Get file extension
  virtual const char *getFileExt() const;

  virtual const char *getName() const;

  virtual bool canHandle(qsys::ObjectPtr pobj) const;

  /////////
  
private:
  //

  /// chain obj ptr --> chain UID table
  std::map<qlib::qvoidp, quint32> m_chmap;
  
  quint32 getChainUID(MolChainPtr pCh) const {
    qlib::qvoidp p = (qlib::qvoidp) pCh.get();
    std::map<qlib::qvoidp, quint32>::const_iterator i = m_chmap.find(p);
    if (i==m_chmap.end()) {
      MB_THROW(qlib::RuntimeException, "inconsistent mol data in QdfMolWriter");
    }
    return i->second;
  }

  /// resid obj ptr --> resid UID table
#ifdef HAVE_UNORDERED_MAP
  typedef std::unordered_map<qlib::qvoidp, quint32> ResidMap;
#else
  typedef boost::unordered_map<qlib::qvoidp, quint32> ResidMap;
#endif
  ResidMap m_resmap;

  quint32 getResidUID(MolResiduePtr pRes) const {
    qlib::qvoidp p = (qlib::qvoidp) pRes.get();
    ResidMap::const_iterator i = m_resmap.find(p);
    if (i==m_resmap.end()) {
      MB_THROW(qlib::RuntimeException, "inconsistent mol data in QdfMolWriter");
    }
    return i->second;
  }


  /// atom obj ptr --> atom UID table
#ifdef HAVE_UNORDERED_MAP
  typedef std::unordered_map<int, quint32> AtomMap;
#else
  typedef boost::unordered_map<int, quint32> AtomMap;
#endif
  AtomMap m_atommap;

  quint32 getAtomUID(int aid) const {
    AtomMap::const_iterator i = m_atommap.find(aid);
    if (i==m_atommap.end()) {
      MB_THROW(qlib::RuntimeException, "inconsistent mol data in QdfMolWriter");
    }
    return i->second;
  }

  ///// aid-->rid table
  //std::map<int, int> m_ridmap;

  void writeMolData();
  void writeChainData();
  void writeResidData();
  void writeAtomData();
  void writeBondData();

  MolCoord *mol() const {
    return super_t::getTarget<MolCoord>();
  }

};

} // namespace molstr

#endif
