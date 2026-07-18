// -*-Mode: C++;-*-
//
// Draw element object
//

#pragma once

#include "gfx.hpp"
#include <qlib/Vector4D.hpp>
#include <qlib/LTypes.hpp>
#include "SolidColor.hpp"
#include "AbstDrawElem.hpp"

namespace gfx {

using qlib::Vector4D;

class AbstDrawAttrs;

/// Draw element class
/// abstraction of VA/VBO implementation of OpenGL
class GFX_API DrawElem : public AbstDrawElem
{
    typedef AbstDrawElem super_t;

public:
    DrawElem();
    ~DrawElem() override;

    virtual bool vertex(int ind, const Vector4D &v) = 0;

    // bool color(int ind, const ColorPtr &c) {
    // return color(ind, c->getCode());
    // }
    virtual bool color(int ind, quint32 cc);

    virtual bool normal(int ind, const Vector4D &v);

    // void startPoints(int nsize);
    // void startLines(int nsize);
    // void startTriangles(int nsize);

    float getLineWidth() const
    {
        return m_fLineWidth;
    }
    void setLineWidth(float f)
    {
        m_fLineWidth = f;
    }

    quint32 getDefColor() const
    {
        return m_nDefColor;
    }
    void setDefColor(quint32 cc)
    {
        m_nDefColor = cc;
    }
    void setDefColor(const ColorPtr &col);

private:
    /// line width/point size
    float m_fLineWidth;

    /// default color
    quint32 m_nDefColor;
};

}  // namespace gfx

