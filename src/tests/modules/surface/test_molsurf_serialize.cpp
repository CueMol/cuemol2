//
// Round-trip serialization tests for MolSurfRenderer coloring-target names.
//
// Regression guard for the multigrad target-wipe bug: color_mapname (multigrad
// mode) and elepot (potential mode) use independent storage. A real qsc load
// performs readFrom2() followed by reapplyStyle(); the latter resets any
// property still flagged "default", which previously wiped the shared storage.
// So a target must survive not just readFrom2() but also reapplyStyle().
//

#include <gtest/gtest.h>
#include <common.h>

#include "surface/MolSurfRenderer.hpp"

#include <qsys/RendererFactory.hpp>
#include <qlib/LDOM2Tree.hpp>
#include <qlib/LDOM2Stream.hpp>
#include <qlib/PipeStream.hpp>

#include <string>

using qlib::LString;
using qlib::LDom2Tree;
using qlib::LDom2OutStream;
using qlib::LDom2InStream;
using qlib::PipeStreamImpl;
using qlib::PipeInStream;
using qlib::PipeOutStream;
using surface::MolSurfRenderer;

namespace {

std::string drainPipe(PipeStreamImpl &impl)
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

std::string writeTree(LDom2Tree &tree)
{
    auto impl = qlib::sp<PipeStreamImpl>(new PipeStreamImpl());
    PipeOutStream raw_out;
    raw_out.setImpl(impl);
    LDom2OutStream out(raw_out);
    out.write(&tree);
    impl->o_close();
    return drainPipe(*impl);
}

void parseRawXML(const std::string &xml, LDom2Tree &tree)
{
    auto impl = qlib::sp<PipeStreamImpl>(new PipeStreamImpl());
    impl->write(xml.c_str(), 0, static_cast<int>(xml.size()));
    impl->o_close();
    PipeInStream raw_in;
    raw_in.setImpl(impl);
    LDom2InStream in(raw_in);
    in.read(tree);
}

MolSurfRenderer *asMolSurf(const qsys::RendererPtr &p)
{
    return dynamic_cast<MolSurfRenderer *>(p.get());
}

// Serialize pSrc to qsc XML, parse it back into a fresh molsurf renderer, and
// run the same post-load steps as a real scene load (readFrom2 + reapplyStyle).
qsys::RendererPtr roundTrip(qsys::RendererFactory *pRF, const qsys::RendererPtr &pSrc)
{
    LDom2Tree tree("renderer");
    pSrc->writeTo2(tree.top());
    std::string xml = writeTree(tree);

    LDom2Tree rtree;
    parseRawXML(xml, rtree);

    qsys::RendererPtr pDst = pRF->create("molsurf");
    pDst->readFrom2(rtree.top());
    // scene-load step that previously reset (wiped) the shared target storage
    pDst->reapplyStyle();
    return pDst;
}

}  // namespace

// multigrad target (color_mapname) survives write -> read -> reapplyStyle,
// and stays independent from the (unset) elepot storage.
TEST(MolSurfSerialize, MultiGradTargetRoundTrip)
{
    qsys::RendererFactory *pRF = qsys::RendererFactory::getInstance();
    qsys::RendererPtr pRend = pRF->create("molsurf");
    ASSERT_FALSE(pRend.isnull());

    pRend->setPropStr("colormode", "multigrad");
    pRend->setPropStr("color_mapname", "my_map.cif");

    MolSurfRenderer *pSrc = asMolSurf(pRend);
    ASSERT_NE(pSrc, nullptr);
    EXPECT_TRUE(pSrc->getColorMapName().equals("my_map.cif"));
    EXPECT_TRUE(pSrc->getTgtElePotName().isEmpty());  // elepot untouched

    qsys::RendererPtr pReloaded = roundTrip(pRF, pRend);
    MolSurfRenderer *pOut = asMolSurf(pReloaded);
    ASSERT_NE(pOut, nullptr);
    EXPECT_EQ(pOut->getColorMode(), MolSurfRenderer::SFREND_MULTIGRAD);
    EXPECT_TRUE(pOut->getColorMapName().equals("my_map.cif"))
        << "color_mapname = '" << pOut->getColorMapName().c_str() << "'";
    EXPECT_TRUE(pOut->getTgtElePotName().isEmpty())
        << "elepot leaked = '" << pOut->getTgtElePotName().c_str() << "'";
}

// potential target (elepot) survives the same cycle (regression: the elepot
// path is unchanged by the color_mapname separation).
TEST(MolSurfSerialize, PotentialTargetRoundTrip)
{
    qsys::RendererFactory *pRF = qsys::RendererFactory::getInstance();
    qsys::RendererPtr pRend = pRF->create("molsurf");
    ASSERT_FALSE(pRend.isnull());

    pRend->setPropStr("colormode", "potential");
    pRend->setPropStr("elepot", "my_map.cif");

    MolSurfRenderer *pSrc = asMolSurf(pRend);
    ASSERT_NE(pSrc, nullptr);
    EXPECT_TRUE(pSrc->getTgtElePotName().equals("my_map.cif"));
    EXPECT_TRUE(pSrc->getColorMapName().isEmpty());  // color_mapname untouched

    qsys::RendererPtr pReloaded = roundTrip(pRF, pRend);
    MolSurfRenderer *pOut = asMolSurf(pReloaded);
    ASSERT_NE(pOut, nullptr);
    EXPECT_EQ(pOut->getColorMode(), MolSurfRenderer::SFREND_SCAPOT);
    EXPECT_TRUE(pOut->getTgtElePotName().equals("my_map.cif"))
        << "elepot = '" << pOut->getTgtElePotName().c_str() << "'";
    EXPECT_TRUE(pOut->getColorMapName().isEmpty())
        << "color_mapname leaked = '" << pOut->getColorMapName().c_str() << "'";
}

// A legacy multigrad qsc (only color_mapname persisted, no elepot attribute,
// same shape the failing file has) must load with its target intact through
// readFrom2 + reapplyStyle.
TEST(MolSurfSerialize, LegacyMultiGradQscLoads)
{
    const char *xml =
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
        "<renderer type=\"molsurf\" color_mapname=\"my_map.cif\" "
        "colormode=\"multigrad\" group=\"\" name=\"molsurf1\" sel=\"i;1:37\" "
        "target=\"my_mol.pdb\">\n"
        "<coloring type=\"CPKColoring\"/>\n"
        "<multi_grad>\n"
        "<gradnode par=\"-1.000000\" col=\"#0000FF\"/>\n"
        "<gradnode par=\"0.000000\" col=\"#FF0000\"/>\n"
        "<gradnode par=\"0.500000\" col=\"hsb(63.058824,1,1)\"/>\n"
        "</multi_grad>\n"
        "</renderer>\n";

    LDom2Tree rtree;
    parseRawXML(xml, rtree);

    qsys::RendererFactory *pRF = qsys::RendererFactory::getInstance();
    qsys::RendererPtr pRend = pRF->create("molsurf");
    ASSERT_FALSE(pRend.isnull());
    pRend->readFrom2(rtree.top());
    pRend->reapplyStyle();

    MolSurfRenderer *pOut = asMolSurf(pRend);
    ASSERT_NE(pOut, nullptr);
    EXPECT_EQ(pOut->getColorMode(), MolSurfRenderer::SFREND_MULTIGRAD);
    EXPECT_TRUE(pOut->getColorMapName().equals("my_map.cif"))
        << "color_mapname = '" << pOut->getColorMapName().c_str() << "'";
}
