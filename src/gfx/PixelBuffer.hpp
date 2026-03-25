// -*-Mode: C++;-*-
//
// Pixel buffer object
//

#pragma once

#include "gfx.hpp"

#include <qlib/LString.hpp>

namespace gfx {

using qlib::LString;

class GFX_API PixRep
{
public:
    virtual ~PixRep() {}
    virtual void bind(int texUnit) = 0;
    virtual void unbind() = 0;
};

/// Abstract interface for buffer texture (GL_TEXTURE_BUFFER equivalent).
/// Paired with a CPU-side data holder (e.g., xtal::MapBufTex).
class GFX_API BufTexRep
{
public:
    virtual ~BufTexRep() {}

    /// Allocate GPU buffer and upload data (called on first use or size change).
    virtual void create(size_t sz, const void *data) = 0;

    /// Update GPU buffer in-place (same size as create()).
    virtual void update(size_t sz, const void *data) = 0;

    /// Bind the buffer texture to the given texture unit.
    virtual void bind(int texUnit) = 0;

    /// Unbind the buffer texture.
    virtual void unbind() = 0;
};

class GFX_API PixelBuffer
{
private:
    int m_nWidth;
    int m_nHeight;
    int m_nDepth;
    typedef std::vector<QUE_BYTE> data_t;

    data_t *m_pData;

    /// buffer ID (for impl)
    mutable PixRep *m_pPixRep;

public:
    PixelBuffer()
        : m_nWidth(0), m_nHeight(0), m_nDepth(8), m_pData(nullptr), m_pPixRep(nullptr)
    {
    }

    /// copy ctor
    PixelBuffer(const PixelBuffer &src);

    ~PixelBuffer();

    PixRep *getRep() const
    {
        return m_pPixRep;
    }
    void setRep(PixRep *p) const
    {
        m_pPixRep = p;
    }

    int getWidth() const
    {
        return m_nWidth;
    }
    int getHeight() const
    {
        return m_nHeight;
    }
    int getDepth() const
    {
        return m_nDepth;
    }

    void setHeight(int aValue)
    {
        m_nHeight = aValue;
    }
    void setWidth(int aValue)
    {
        m_nWidth = aValue;
    }
    void setDepth(int aValue)
    {
        m_nDepth = aValue;
    }

    QUE_BYTE *data()
    {
        if (m_pData == NULL) return NULL;
        return &(m_pData->operator[](0));
    }

    const QUE_BYTE *data() const
    {
        if (m_pData == NULL) return NULL;
        return &(m_pData->operator[](0));
    }

    size_t size() const
    {
        if (m_pData == NULL) return 0;
        return m_pData->size();
    }

    void resize(size_t n);

    QUE_BYTE at(int index) const
    {
        return m_pData->at(index);
    }

    void clear();
};

}  // namespace gfx
