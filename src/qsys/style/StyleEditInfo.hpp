// -*-Mode: C++;-*-
//
// Undo/Redo information for style editing
//
// $Id: StyleEditInfo.hpp,v 1.1 2011/05/02 12:42:55 rishitani Exp $

#ifndef QSYS_STYLE_EDIT_INFO_HPP_INCLUDED
#define QSYS_STYLE_EDIT_INFO_HPP_INCLUDED

#include <qsys/qsys.hpp>

#include <qsys/PropEditInfo.hpp>
#include <qsys/UndoManager.hpp>
#include <qsys/Scene.hpp>

#include <qlib/SmartPtr.hpp>

//#include <qlib/ObjectManager.hpp>
//#include <qlib/NestedPropHandler.hpp>

namespace qsys {

  class StyleSupports;

  MC_DECL_SCRSP(StyleSet);

  ///
  /// Edit info for StyleSet creation/destruction
  ///
  class StyleCreateEditInfo : public EditInfo
  {
  private:
    qlib::uid_t m_nSceneID;
    StyleSetPtr m_pTgt;

    bool m_bCreate;

    int m_nInsBefore;

  public:

    StyleCreateEditInfo();
    virtual ~StyleCreateEditInfo();

    void setupCreate(qlib::uid_t scid, StyleSetPtr pTgt, int nBefore);

    void setupDestroy(qlib::uid_t scid, StyleSetPtr pTgt, int nBefore);

    //////////

    /// perform undo
    virtual bool undo();

    /// perform redo
    virtual bool redo();

    virtual bool isUndoable() const;

    virtual bool isRedoable() const;

  };

  //////////

  ///
  /// Edit info for StyleSet change source path
  ///
  class StyleSrcEditInfo : public EditInfo
  {
  private:
    StyleSetPtr m_pTgt;

    LString m_before, m_after;

  public:

    StyleSrcEditInfo();
    virtual ~StyleSrcEditInfo();

    void setup(StyleSetPtr pTgt, LString before, LString after);

    //////////

    /// perform undo
    virtual bool undo();

    /// perform redo
    virtual bool redo();

    virtual bool isUndoable() const;

    virtual bool isRedoable() const;

  };


  //////////
  
  ///
  /// Edit info for style property in Renderer
  ///   (to be moved to RendStyleEditInfo.hpp/cpp files)
  ///
  class RendStyleEditInfo : public PropEditInfoBase
  {
  private:
    LString m_newvalue;
    LString m_oldvalue;

    bool m_bNewDef;
    bool m_bOldDef;

  public:
    RendStyleEditInfo() : PropEditInfoBase(), m_bNewDef(false), m_bOldDef(false)
    {
    }

    virtual ~RendStyleEditInfo();

    /// Setup edit info from old and new names of the styles
    void setup(qlib::uid_t uid, const LString &ov, const LString &nv)
    {
      setTargetUID(uid);
      setPropName("styles");
      m_oldvalue = ov;
      m_newvalue = nv;
    }

    /// Perform undo
    virtual bool undo();

    /// Perform redo
    virtual bool redo();

    virtual bool isUndoable() const;

    virtual bool isRedoable() const;

  private:
    void fireStyleEvents(StyleSupports *pTgt);

  };

}

#endif
