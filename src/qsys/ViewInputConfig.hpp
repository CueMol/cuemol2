// -*-Mode: C++;-*-
//
//  View-input event configuration
//
//  $Id$

#ifndef QSYS_VIEW_INPUT_CONFIG_HPP
#define QSYS_VIEW_INPUT_CONFIG_HPP

#include "qsys.hpp"
#include <boost/unordered_map.hpp>

#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/SingletonBase.hpp>
#include <qlib/mcutils.hpp>

#include "style/StyleSupports.hpp"

namespace qsys {

  class InDevEvent;
  class StyleSheet;
  using qlib::LString;

  class QSYS_API ViewInputConfig :
    public qlib::LSingletonScrObject,
    public qlib::SingletonBase<ViewInputConfig>,
    public StyleSupports,
    public StyleResetPropImpl
  {
    MC_SCRIPTABLE;

  private:
    typedef qlib::LSingletonScrObject super_t;
    typedef boost::unordered_map<int, int> ModifMap;
    //typedef std::map<int, int> ModifMap;
    ModifMap m_modifTab;

    /// axis/modifier mask (the same as in the InDevEvent defs)
    enum {
      INDEV_SHIFT= (1 << 0),
      INDEV_CTRL = (1 << 1),
      INDEV_ALT  = (1 << 2),
      INDEV_LBTN = (1 << 3),
      INDEV_MBTN = (1 << 4),
      INDEV_RBTN = (1 << 5),
      INDEV_AXIS = (0x0F << 6),
    };

  public:
    /// Device axis/value definition (0-15, 4bit)
    enum {
      MOUSE_XAXIS = 0,
      MOUSE_YAXIS = 1,
      MOUSE_WHEEL1 = 2,
      MOUSE_WHEEL2 = 3,
      GSTR_PANN_X = 4,
      GSTR_PANN_Y = 5,
      GSTR_PINCH = 6,
      GSTR_ROTATE = 7,
      GSTR_SWIPE_X = 8,
      GSTR_SWIPE_Y = 9
    };

    /// Operation ID definition
    enum {
      VIEW_ROTX=0,
      VIEW_ROTY=1,
      VIEW_ROTZ=2,
      
      VIEW_TRAX=3,
      VIEW_TRAY=4,
      VIEW_TRAZ=5,

      VIEW_SLAB=6,
      VIEW_ZOOM=7,
      VIEW_DIST=8,

      EID_SIZE=9
    };

    /// View rotation trackball radius
    double m_tbrad;

    /// Hittest precision for mouse pick
    double m_dHitPrec;

  public:
    ViewInputConfig();
    ~ViewInputConfig();

    bool setBinding(int nID, int nModifAxis);

    bool setBinding(int nID, const LString &modifStr);

    //bool getBinding(int nID, int &nModifAxisID);
    LString getBinding(int nID) const;

    bool removeBindings(int nID);
    
    bool setBinding(int nID, int nModifAxis, int nAxisID) {
      return setBinding(nID, nModifAxis|(nAxisID<<6));
    }

    //bool unreg(int nID);
    //bool isRegistered(int nID) const;
    //LString getName(int nID) const;

    /// Find operation bound to the event ev
    int findEvent(int nAxisID, const InDevEvent &ev);

    /////////////////////////////////////////////////////////////

    // Input configuration
    void setConfRotX(const LString &modif);
    LString getConfRotX() const;

    void setConfRotY(const LString &modif);
    LString getConfRotY() const;

    void setConfRotZ(const LString &modif);
    LString getConfRotZ() const;

    void setConfTraX(const LString &modif);
    LString getConfTraX() const;

    void setConfTraY(const LString &modif);
    LString getConfTraY() const;

    void setConfTraZ(const LString &modif);
    LString getConfTraZ() const;

    void setConfZoom(const LString &modif);
    LString getConfZoom() const;

    void setConfSlab(const LString &modif);
    LString getConfSlab() const;

    void setConfDist(const LString &modif);
    LString getConfDist() const;

    /// trackball rotation

    void setTbRad(double d) { m_tbrad = d; }
    double getTbRad() const { return m_tbrad; }

    void setHitPrec(double d) { m_dHitPrec = d; }
    double getHitPrec() const { return m_dHitPrec; }

    ////////////////////////////////////////
    // Style supports

  private:
    StyleSheet *m_pStyles;

    void fireStyleEvents();

  public:
    /// Reset to the stylesheet values (impl)
    virtual bool resetProperty(const LString &propnm);

    virtual StyleSheet *getStyleSheet() const;
    virtual void styleChanged(StyleEvent &);
    virtual qlib::uid_t getStyleCtxtID() const;
    
    /// Apply style sheet
    void applyStyle(const LString &name);

    /// Get stylesheet name
    LString getStyleName() const;

    ////////////////////////////////////////

  private:
    /// build modifier table from m_config
    //void buildModifTab();

    static int parseModifStr(const LString &str);
  };

}

SINGLETON_BASE_DECL(qsys::ViewInputConfig);

#endif
