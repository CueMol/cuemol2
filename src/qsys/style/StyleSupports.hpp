// -*-Mode: C++;-*-
//
// Style support interface
//

#ifndef QSYS_STYLE_SUPPORTS_HPP_INCLUDED
#define QSYS_STYLE_SUPPORTS_HPP_INCLUDED

#include <qsys/qsys.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/LEvent.hpp>
#include <qlib/LString.hpp>

namespace qsys {

  class StyleSheet;

  class QSYS_API StyleEvent : public qlib::LEvent
  {
  public:
    StyleEvent() {}
    
    StyleEvent(const StyleEvent &ev)
         : qlib::LEvent(ev)
    {}
  
    virtual ~StyleEvent();

    virtual LCloneableObject *clone() const;
  };

  ////////////////////////////////////////////

  ///
  /// Stylesheet supporting class
  /// getStyleSheet() should be implemented so as to return the applied style sheet object.
  ///
  class QSYS_API StyleSupports //: public StyleEventListener
  {
  public:
    virtual ~StyleSupports();
    virtual StyleSheet *getStyleSheet() const =0;
    virtual void styleChanged(StyleEvent &) =0;
    virtual qlib::uid_t getStyleCtxtID() const =0;
  };

/*
  /// Style supports implementation
  class StyleSupportsImpl
  {
  private:
    StyleSheet *m_pStyle;

  public:
    StyleSupportsImpl() : m_pStyle(NULL) {}
    
    StyleSheet *getStyleSheet() const
    {
      return m_pStyle;
    }

    void styleChanged(StyleEvent &ev, qlib::LDefSupportScrObjBase *pOuter)
    {
      m_pStyles->applyStyle(pOuter);
    }
      
    // bool resetPropImpl(const LString &propnm, qlib::LDefSupportScrObjBase *pOuter);

    LString getStyleNames() const
    {
      return m_pStyles->getStyleNames();
    }
  };
*/
  
  /////////////////////
  
  ///
  /// Interface of style event listeners
  ///
  typedef StyleSupports StyleEventListener;

  ////////////////////////////////////////////

  ///
  /// Style's reset property implementation
  ///
  class QSYS_API StyleResetPropImpl
  {
  public:
    /// Utility method: reset property to default/style value
    bool resetProperty(const qlib::LString &propnm, qlib::LDefSupportScrObjBase *pThat);
  };
  

/*
  ///
  /// Scriptable object class with stylesheet client implementation
  ///   resetProperty() implements reseting the prop value to the style-sheet defined value.
  ///
  class QSYS_API StyleScrObject : public qlib::LSimpleCopyScrObject
  {
  public:
    typedef qlib::LSimpleCopyScrObject super_t;

    virtual ~StyleScrObject();

    virtual bool resetProperty(const LString &propnm);

  };
*/
  
}

#endif

