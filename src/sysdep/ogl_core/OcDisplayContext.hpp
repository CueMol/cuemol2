// -*-Mode: C++;-*-
//
//  OpenGL display context interface
//

#pragma once

#include <sysdep/sysdep.hpp>
#include <qsys/GUIDisplayContext.hpp>

namespace gfx {
class AbstDrawAttrs;
}  // namespace gfx

namespace sysdep {

class OcPixDraw;

class SYSDEP_API OcDisplayContext : public qsys::GUIDisplayContext
{
private:
    typedef qsys::GUIDisplayContext super_t;

    OcPixDraw *m_pOcPixDraw;

public:
    OcDisplayContext();
    virtual ~OcDisplayContext();

    virtual void enableDepthTest(bool);

    virtual void setCullFace(bool f = true);

    virtual void drawPixels(const Vector4D &pos, const gfx::PixelBuffer &data,
                            const gfx::ColorPtr &col);

    virtual void drawElem(const gfx::AbstDrawElem &l);

    ///////////////////////////////
    // Display List support

    virtual gfx::DisplayContext *createDisplayList();

    virtual void callDisplayList(DisplayContext *pdl);
    virtual bool isCompatibleDL(DisplayContext *pdl) const;

    //////////

    virtual gfx::DrawObjSet *createDrawObjSet() const;

    virtual void drawObjSet(const gfx::DrawObjSet &dos);

    /// Clear the target buffer with the specified color.
    virtual void clearBuffer(const gfx::ColorPtr &pcol);
};

}  // namespace sysdep
