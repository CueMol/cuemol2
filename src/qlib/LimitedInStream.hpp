// -*-Mode: C++;-*-
//
// Byte-capped input filter stream. Wraps another InStream and signals
// EOF once the configured maximum number of bytes has been delivered,
// even if the underlying source still has data. Used by content-sniff
// paths to bound how much of a file each reader sees.
//

#ifndef QLIB_LIMITED_IN_STREAM_HPP_
#define QLIB_LIMITED_IN_STREAM_HPP_

#include "FilterStream.hpp"
#include "LTypes.hpp"

namespace qlib {

namespace detail {

class QLIB_API LimitedInFilterImpl : public InFilterImpl
{
private:
    qint64 m_remaining;

public:
    typedef InFilterImpl super_t;

    LimitedInFilterImpl() : super_t(), m_remaining(0) {}

    LimitedInFilterImpl(const impl_type &in, qint64 maxBytes)
        : super_t(in), m_remaining(maxBytes < 0 ? 0 : maxBytes)
    {
    }

    bool ready() override
    {
        if (m_remaining <= 0) return false;
        return getImpl()->ready();
    }

    int read() override
    {
        if (m_remaining <= 0) return -1;
        int c = getImpl()->read();
        if (c < 0) return -1;
        --m_remaining;
        return c;
    }

    int read(char *buf, int off, int len) override
    {
        if (m_remaining <= 0) return -1;
        int reqLen = len;
        if (static_cast<qint64>(reqLen) > m_remaining)
            reqLen = static_cast<int>(m_remaining);
        int n = getImpl()->read(buf, off, reqLen);
        if (n > 0) m_remaining -= n;
        return n;
    }

    int skip(int n) override
    {
        if (m_remaining <= 0) return 0;
        int reqN = n;
        if (static_cast<qint64>(reqN) > m_remaining)
            reqN = static_cast<int>(m_remaining);
        int skipped = getImpl()->skip(reqN);
        if (skipped > 0) m_remaining -= skipped;
        return skipped;
    }
};

}  // namespace detail

class QLIB_API LimitedInStream : public InStreamAdaptor
{
private:
    sp<detail::LimitedInFilterImpl> m_pimpl;

public:
    LimitedInStream(InStream &r, qint64 maxBytes)
        : m_pimpl(MB_NEW detail::LimitedInFilterImpl(r.getImpl(), maxBytes))
    {
    }

    InStream::impl_type getImpl() const override { return m_pimpl; }
};

}  // namespace qlib

#endif
