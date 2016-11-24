// -*-Mode: C++;-*-
//
// QDF MolCoord Reader class
//

#ifndef MOLSTR_QDFMOLREADER_HPP
#define MOLSTR_QDFMOLREADER_HPP

#include "molstr.hpp"

#include <qlib/mcutils.hpp>
#include <qlib/LExceptions.hpp>
#include <qsys/QdfAbsReader.hpp>

namespace molstr {

  using qlib::LString;

  class QdfMolReader : public qsys::QdfAbsReader
  {
    //MC_SCRIPTABLE;
    MC_DYNCLASS;

  private:
    typedef qsys::QdfAbsReader super_t;

  public:
    
    QdfMolReader();

    virtual ~QdfMolReader();

    //////////////////////////////////////////////
    // Information query methods

    /// Get the nickname of this reader (referred from script interface)
    virtual const char *getName() const;

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;

    /// Create default object for this reader
    virtual qsys::ObjectPtr createDefaultObj() const;

    //////////////////////////////////////////////
    // Read/build methods
  
    ///
    ///  Read from the input stream ins, and build the attached object.
    ///
    virtual bool read(qlib::InStream &ins);

  private:

    MolCoord *m_pMol;

    typedef std::map<quint32, MolChainPtr> ChainTab;
    ChainTab m_chainTab;
    
    typedef std::map<quint32, MolResiduePtr> ResidTab;
    ResidTab m_residTab;

#ifdef HAVE_UNORDERED_MAP
    typedef std::unordered_map<quint32, MolAtomPtr> AtomTab;
#else
    typedef boost::unordered_map<quint32, MolAtomPtr> AtomTab;
#endif
    AtomTab m_atomTab;

    void readMolData();

    void readChainData();
    
    void readResidData();

    void readAtomData();

    void readBondData();

  };

} // namespace molstr

#endif

