// -*-Mode: C++;-*-
//
// Test helpers: serialize a renderer to qsc XML and read it back the way a
// real scene load does (readFrom2 followed by reapplyStyle, which resets any
// property still flagged "default"). Shared by the surface renderer
// serialization tests.
//

#ifndef SURFACE_TEST_QSC_ROUNDTRIP_UTIL_HPP
#define SURFACE_TEST_QSC_ROUNDTRIP_UTIL_HPP

#include <common.h>

#include <qsys/Renderer.hpp>
#include <qsys/RendererFactory.hpp>
#include <qlib/LDOM2Tree.hpp>
#include <qlib/LDOM2Stream.hpp>
#include <qlib/PipeStream.hpp>

#include <string>

namespace surftest {

inline std::string drainPipe(qlib::PipeStreamImpl &impl)
{
    std::string result;
    char buf[256];
    while (impl.ready()) {
        int n = impl.read(buf, 0, sizeof buf);
        if (n <= 0) break;
        result.append(buf, static_cast<size_t>(n));
    }
    return result;
}

/// Write a DOM tree as qsc XML text.
inline std::string writeTree(qlib::LDom2Tree &tree)
{
    auto impl = qlib::sp<qlib::PipeStreamImpl>(new qlib::PipeStreamImpl());
    qlib::PipeOutStream raw_out;
    raw_out.setImpl(impl);
    qlib::LDom2OutStream out(raw_out);
    out.write(&tree);
    impl->o_close();
    return drainPipe(*impl);
}

/// Parse qsc XML text into a DOM tree.
inline void parseRawXML(const std::string &xml, qlib::LDom2Tree &tree)
{
    auto impl = qlib::sp<qlib::PipeStreamImpl>(new qlib::PipeStreamImpl());
    impl->write(xml.c_str(), 0, static_cast<int>(xml.size()));
    impl->o_close();
    qlib::PipeInStream raw_in;
    raw_in.setImpl(impl);
    qlib::LDom2InStream in(raw_in);
    in.read(tree);
}

/// Serialize pSrc, parse the XML back into a fresh renderer of `typeName`,
/// and run the post-load steps of a real scene load.
inline qsys::RendererPtr roundTrip(qsys::RendererFactory *pRF,
                                   const char *typeName,
                                   const qsys::RendererPtr &pSrc)
{
    qlib::LDom2Tree tree("renderer");
    pSrc->writeTo2(tree.top());
    std::string xml = writeTree(tree);

    qlib::LDom2Tree rtree;
    parseRawXML(xml, rtree);

    qsys::RendererPtr pDst = pRF->create(typeName);
    pDst->readFrom2(rtree.top());
    pDst->reapplyStyle();
    return pDst;
}

/// Load a renderer of `typeName` from literal qsc XML, as a scene load does.
inline qsys::RendererPtr loadFromXML(qsys::RendererFactory *pRF,
                                     const char *typeName,
                                     const char *xml)
{
    qlib::LDom2Tree rtree;
    parseRawXML(xml, rtree);
    qsys::RendererPtr pRend = pRF->create(typeName);
    pRend->readFrom2(rtree.top());
    pRend->reapplyStyle();
    return pRend;
}

}  // namespace surftest

#endif  // SURFACE_TEST_QSC_ROUNDTRIP_UTIL_HPP
