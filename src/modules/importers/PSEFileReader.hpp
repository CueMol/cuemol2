// -*-Mode: C++;-*-
//
//  PyMOL Session File Reader
//

#ifndef PSE_FILE_READER_HPP_INCLUDED
#define PSE_FILE_READER_HPP_INCLUDED

#include "importers.hpp"

#include <qsys/Scene.hpp>
#include <qsys/InOutHandler.hpp>
#include <modules/molstr/molstr.hpp>
#include <qlib/LVarList.hpp>


namespace importers {

  using qlib::LString;
  using qsys::ScenePtr;

  class IMPORTERS_API PSEFileReader : public qsys::InOutHandler
  {
    MC_SCRIPTABLE;

  private:

    ScenePtr m_pClient;

    //////////

  public:
    PSEFileReader();

    ~PSEFileReader() override;

    /// Get category ID
    int getCatID() const override;

    virtual void read();

    ////////////////////////////////////////
    // Client management

    /// attach to and lock the target object
    virtual void attach(ScenePtr pScene);

    /// detach from the target object
    virtual ScenePtr detach();

    ScenePtr getClient() const { return m_pClient; }

    /////////////////////////////////
    // Attributes

    /// Get name of the writer
    const char *getName() const override;

    /// Get file-type description
    const char *getTypeDescr() const override;

    /// Get file extension
    const char *getFileExt() const override;

  private:

    /// Settings table indexed by PyMOL setting ID (owns its entries)
    qlib::LVarList *m_pSet;

    /// Set once an unknown color index has been reported for this read
    bool m_bColorWarned;

    unsigned int convColor(int ncol);

    void procViewSettings(qlib::LVarList *pView);

    void procNames(qlib::LVarList *pNames);

    void parseObject(qlib::LVarList *pData, qsys::ObjectPtr pObj);
    void parseObjectMolecule(qlib::LVarList *pData, molstr::MolCoordPtr pMol);

    void parseObjectMeas(qlib::LVarList *pData, molstr::MolCoordPtr pMol);

    double getRealSetting(int id)
    {
      return m_pSet->getReal(id);
    }

    bool hasRealSetting(int id) {
      if (m_pSet->at(id)==NULL) return false;
      if (!m_pSet->at(id)->isReal()) return false;
      return true;
    }

    int getIntSetting(int id)
    {
      return m_pSet->getInt(id);
    }

    bool hasIntSetting(int id) {
      if (m_pSet->at(id)==NULL) return false;
      if (!m_pSet->at(id)->isInt()) return false;
      return true;
    }

    void setupSettingList(qlib::LVarList *pSet);
    
  };

  ////////////////////////////////////////////////////////////


}

#endif

