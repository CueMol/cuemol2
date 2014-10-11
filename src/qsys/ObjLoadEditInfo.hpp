// -*-Mode: C++;-*-
//
// Object / Renderer loading/unloading edit info
//

#ifndef QSYS_OBJLOAD_EDIT_INFO_HPP_INCLUDED
#define QSYS_OBJLOAD_EDIT_INFO_HPP_INCLUDED

#include "qsys.hpp"

#include "EditInfo.hpp"
#include <qlib/LVariant.hpp>
#include <qlib/ObjectManager.hpp>

namespace qsys {

  ///
  /// Object / Renderer loading/unloading edit info
  ///
  class ObjLoadEditInfo : public EditInfo
  {
  private:
    qlib::uid_t m_nSceneID;
    ObjectPtr m_pTgtObj;

    qlib::uid_t m_nObjID;
    RendererPtr m_pTgtRend;

    enum {
      OLEI_OBJ_CREATE,
      OLEI_OBJ_DESTROY,
      OLEI_REND_CREATE,
      OLEI_REND_DESTROY
    };

    int m_nMode;

  public:

    ObjLoadEditInfo();
    virtual ~ObjLoadEditInfo();

    void setupObjCreate(qlib::uid_t scid, ObjectPtr pObj);

    void setupObjDestroy(qlib::uid_t scid, ObjectPtr pObj);

    void setupRendCreate(qlib::uid_t objid, RendererPtr pRend);

    void setupRendDestroy(qlib::uid_t objid, RendererPtr pRend);

    /** perform undo */
    virtual bool undo();

    /** perform redo */
    virtual bool redo();

    virtual bool isUndoable() const;

    virtual bool isRedoable() const;

  };

}

#endif
