// -*-Mode: C++;-*-
//
//  Name label renderer class
//

#ifndef NAME_LABEL_RENDERER_H__
#define NAME_LABEL_RENDERER_H__

#include "molstr.hpp"

#include "TextRenderer.hpp"
#include <gfx/LabelCacheImpl.hpp>

class NameLabelRenderer_wrap;

namespace molstr {

  struct NameLabel;
  struct NameLabelList;
  
  class MOLSTR_API NameLabelRenderer : public TextRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    friend class ::NameLabelRenderer_wrap;

  private:
    typedef TextRenderer super_t;

    /// implementation
    NameLabelList *m_pdata;

    /// max labels
    int m_nMax;

    /// label pixbuf cache
    gfx::LabelCacheImpl m_pixCache;

    //////////////////////////////////////////////////////

  public:
    NameLabelRenderer();
    virtual ~NameLabelRenderer();

    //////////////////////////////////////////////////////

    virtual bool isCompatibleObj(qsys::ObjectPtr pobj) const;
    virtual LString toString() const;

    virtual void render(DisplayContext *pdc);

    virtual Vector4D getCenter() const;

    virtual const char *getTypeName() const;

    //////
    // Serialization / deserialization impl for non-prop data

    virtual void writeTo2(qlib::LDom2Node *pNode) const;
    virtual void readFrom2(qlib::LDom2Node *pNode);

    //////////////////////////////////////////////////////

    MolCoordPtr getClientMol() const;

    bool addLabelByID(int aid, const LString &label = LString());
    bool addLabel(MolAtomPtr patom, const LString &label = LString());

    bool removeLabelByID(int aid);

    void setMaxLabel(int nmax) { m_nMax = nmax; }
    int getMaxLabel() const { return m_nMax; }

    // void makeLabelImg();
    virtual void invalidatePixCache();

  private:
    bool makeLabelStr(NameLabel &n, LString &lab,Vector4D &pos);

  };

} // namespace

#endif
