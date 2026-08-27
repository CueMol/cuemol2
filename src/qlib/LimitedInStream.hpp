// -*-Mode: C++;-*-
//
// Byte-capped input filter stream. Wraps another InStream and signals
// EOF once the configured maximum number of bytes has been delivered,
// even if the underlying source still has data. Used by content-sniff
// paths to bound how much of a file each reader sees.
//
// Besides capping, the filter records whether the cap was actually
// reached (isLimitHit) so that a caller can tell "the reader stopped
// because we cut it off" apart from "the reader stopped because the
// source ran dry". Content sniffing uses this to retry a reader with a
// larger budget only when the budget was the limiting factor.
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
    qint64 m_limit;
    qint64 m_remaining;
    qint64 m_consumed;

    /// Set when a read/skip request was refused or shortened because
    /// of the budget. Never set by a short read from the source.
    bool m_bClamped;

public:
    typedef InFilterImpl super_t;

    LimitedInFilterImpl()
        : super_t(), m_limit(0), m_remaining(0), m_consumed(0), m_bClamped(false)
    {
    }

    LimitedInFilterImpl(const impl_type &in, qint64 maxBytes)
        : super_t(in),
          m_limit(maxBytes < 0 ? 0 : maxBytes),
          m_remaining(maxBytes < 0 ? 0 : maxBytes),
          m_consumed(0),
          m_bClamped(false)
    {
    }

    bool ready() override
    {
        if (m_remaining <= 0) return false;
        return getImpl()->ready();
    }

    int read() override
    {
        if (m_remaining <= 0) {
            m_bClamped = true;
            return -1;
        }
        int c = getImpl()->read();
        if (c < 0) return -1;
        --m_remaining;
        ++m_consumed;
        return c;
    }

    int read(char *buf, int off, int len) override
    {
        if (m_remaining <= 0) {
            m_bClamped = true;
            return -1;
        }
        int reqLen = len;
        if (static_cast<qint64>(reqLen) > m_remaining) {
            reqLen = static_cast<int>(m_remaining);
            m_bClamped = true;
        }
        int n = getImpl()->read(buf, off, reqLen);
        if (n > 0) {
            m_remaining -= n;
            m_consumed += n;
        }
        return n;
    }

    int skip(int n) override
    {
        if (m_remaining <= 0) {
            m_bClamped = true;
            return 0;
        }
        int reqN = n;
        if (static_cast<qint64>(reqN) > m_remaining) {
            reqN = static_cast<int>(m_remaining);
            m_bClamped = true;
        }
        int skipped = getImpl()->skip(reqN);
        if (skipped > 0) {
            m_remaining -= skipped;
            m_consumed += skipped;
        }
        return skipped;
    }

    /// Byte budget given at construction.
    qint64 limit() const { return m_limit; }

    /// Bytes delivered (or skipped) so far.
    qint64 consumed() const { return m_consumed; }

    /// True when the budget limited what the consumer could read: it
    /// is exhausted, or a request had to be refused / shortened. A
    /// consumer that stopped before touching the budget (source EOF,
    /// early verdict) leaves this false.
    bool isLimitHit() const { return m_remaining <= 0 || m_bClamped; }
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

    qint64 limit() const { return m_pimpl->limit(); }
    qint64 consumed() const { return m_pimpl->consumed(); }
    bool isLimitHit() const { return m_pimpl->isLimitHit(); }
};

}  // namespace qlib

#endif
