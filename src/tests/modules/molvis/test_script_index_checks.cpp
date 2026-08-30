// -*-Mode: C++;-*-
//
// Script-visible entry points of molvis/molstr must reject bad indices and
// unknown atoms instead of dereferencing past their tables.
//

#include <gtest/gtest.h>
#include <common.h>

#include "molvis/JctTable.hpp"
#include "molvis/TubeSection.hpp"
#include "molvis/PaintColoring.hpp"
#include "molvis/AtomIntrRenderer.hpp"
#include "molvis/DistPickDrawObj.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/NameLabelRenderer.hpp"

#include <qlib/Vector4D.hpp>

using qlib::Vector4D;

// axialdetail=0 makes setup() fail and leaves no table; get() used to check
// index<0 && index>=size and dereference NULL
TEST(JctTableChecks, GetOnEmptyTableReturnsFalse)
{
    molvis::JctTable jt;
    double par = 0.0, e1 = 0.0, e2 = 0.0;
    EXPECT_FALSE(jt.get(0, par));
    EXPECT_FALSE(jt.get(-1, par));
    EXPECT_FALSE(jt.get(0, par, e1, e2));
    Vector4D vv;
    EXPECT_FALSE(jt.get(5, par, vv));
}

// detail is a script property; 0 produced an empty section table and
// getVec() divided by it
TEST(TubeSectionChecks, DetailBelowOneIsClamped)
{
    molvis::TubeSection ts;
    ts.setDetail(0);
    EXPECT_EQ(ts.getDetail(), 1);
    ts.setupSectionTable();
    ASSERT_GE(ts.getSize(), 1);
    Vector4D e1(1, 0, 0), e2(0, 1, 0);
    EXPECT_NO_FATAL_FAILURE(ts.getVec(7, e1, e2));

    ts.setDetail(-4);
    EXPECT_EQ(ts.getDetail(), 1);
    ts.setDetail(12);
    EXPECT_EQ(ts.getDetail(), 12);
}

TEST(PaintColoringChecks, NegativeIndexIsRejected)
{
    molvis::PaintColoring pc;
    EXPECT_FALSE(pc.removeAt(-1));
    EXPECT_FALSE(pc.removeAt(0));
    EXPECT_FALSE(pc.changeAt(-1, molstr::SelectionPtr(), gfx::ColorPtr()));
    EXPECT_FALSE(pc.changeAt(0, molstr::SelectionPtr(), gfx::ColorPtr()));
}

TEST(AtomIntrRendererChecks, NegativeIndexIsRejected)
{
    molvis::AtomIntrRenderer r;
    EXPECT_FALSE(r.remove(-1));
    EXPECT_FALSE(r.remove(0));
}

// DistPickDrawObj::append() is fed atom ids from the measure/bond-edit
// services; an id the molecule does not have used to dereference NULL
TEST(DistPickDrawObjChecks, UnknownAtomIsIgnored)
{
    molstr::MolCoordPtr pMol(new molstr::MolCoord());
    molvis::DistPickDrawObj d;
    EXPECT_NO_FATAL_FAILURE(d.append(pMol->getUID(), 12345));
    EXPECT_NO_FATAL_FAILURE(d.append(qlib::invalid_uid, 0));
}

TEST(NameLabelRendererChecks, UnknownAtomIdReturnsFalse)
{
    molstr::MolCoordPtr pMol(new molstr::MolCoord());
    molstr::NameLabelRenderer r;
    r.attachObj(pMol->getUID());
    EXPECT_FALSE(r.addLabelByID(12345));
}
