// -*-Mode: C++;-*-
//
// Undo/Redo manager
//
// $Id: UndoManager.hpp,v 1.5 2011/02/03 15:25:14 rishitani Exp $

#ifndef QSYS_UNDO_MANAGER_HPP_INCLUDED
#define QSYS_UNDO_MANAGER_HPP_INCLUDED

#include "qsys.hpp"
#include "EditInfo.hpp"

namespace qsys {

  using qlib::LString;

  ///
  ///  Undo/Redo manager class
  ///
  class QSYS_API UndoManager
  {
  private:

    ///
    ///  Undo/Redo infomation class
    ///
    class UndoInfo {
    private:
      std::list<EditInfo *> m_data;
      LString m_desc;

    public:

      ~UndoInfo() {
        clear();
      }

      int size() const { return m_data.size(); }

      void setDesc(const char *ds) { m_desc = ds; }
      LString getDesc() const { return m_desc; }

      void add(EditInfo *pei) {
        m_data.push_front(pei);
      }

      void clear() {
        while (m_data.size()>0) {
          EditInfo *pei = m_data.front();
          m_data.pop_front();
          delete pei;
        }
      }

      /// Perform undo
      bool undo() {
        std::list<EditInfo *>::const_iterator iter = m_data.begin();
        for (; iter!=m_data.end(); iter++) {
          if (!(*iter)->undo()) return false;
        }
        return true;
      }

      /// Perform redo
      bool redo() {
        std::list<EditInfo *>::reverse_iterator iter = m_data.rbegin();
        for (; iter!=m_data.rend(); iter++) {
          if (!(*iter)->redo()) return false;
        }
        return true;
      }

      bool isUndoable() const {
        std::list<EditInfo *>::const_iterator iter = m_data.begin();
        for (; iter!=m_data.end(); iter++) {
          if (!(*iter)->isUndoable()) return false;
        }
        return true;
      }

      bool isRedoable() const {
        std::list<EditInfo *>::const_iterator iter = m_data.begin();
        for (; iter!=m_data.end(); iter++) {
          if (!(*iter)->isRedoable()) return false;
        }
        return true;
      }
    };

    //////////////////////////////////////////

    typedef std::list<UndoInfo *> UndoInfoList;

    UndoInfoList m_udata;
    UndoInfoList m_rdata;

    /// disable UNDO/REDO recording
    bool m_fDisable;

    /// pending Undo/Redo infomation
    UndoInfo *m_pPendInfo;

    /// nesting level of transaction
    unsigned int m_nTxnNestLevel;

    //  /// UNDO/REDO buffer size
    //  unsigned int m_nLimit;

  public:
    UndoManager();
    virtual ~UndoManager();

    bool isUndoable() const;
    bool isRedoable() const;

    bool undo(int n);
    bool redo(int n);
    bool undo();
    bool redo();

    bool getUndoDesc(int n, LString &str) const;
    bool getRedoDesc(int n, LString &str) const;

    void getUndoDescList(std::list<LString> &str) const;
    void getRedoDescList(std::list<LString> &str) const;

    /// Discard all Undo/Redo infomation
    void clearAllInfo();

    void startTxn(const LString &desc);
    void addEditInfo(EditInfo *pei);
    void rollbackTxn();
    void commitTxn();

    /// return true if in transaction
    bool isInTxn() const { return m_pPendInfo!=NULL; }
    bool isDisabled() const { return m_fDisable; }
    bool isOK() const { return isInTxn() && !isDisabled(); }

    int getUndoSize() const { return m_udata.size(); }
    int getRedoSize() const { return m_rdata.size(); }

    //void setUndoLimit(int n);
    //int getUndoLimit() const { return m_nLimit; }

    //void loadPreferences();

  };

  /// utility class for editinfo recording
  class QSYS_API UndoUtil
  {
  private:
    UndoManager *m_pUM;

  public:
    UndoUtil(qlib::uid_t nSceneID);

    UndoUtil(ScenePtr pScene);

    UndoUtil(const Scene *pScene);

    bool isOK() const
    {
      if (m_pUM==NULL) return false;
      return m_pUM->isOK();
    }

    void add(EditInfo *pei) const
    {
      MB_ASSERT(m_pUM!=NULL);
      m_pUM->addEditInfo(pei);
    }
  };

}

#endif
