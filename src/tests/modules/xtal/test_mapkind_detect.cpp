// -*-Mode: C++;-*-
//
// Tests for the crystallographic / cryo-EM map kind detection from
// CCP4/MRC header evidence (pure function, no I/O).
//

#include <gtest/gtest.h>
#include <common.h>
#include <cmath>
#include <limits>
#include "xtal/MapKindDetect.hpp"

using xtal::MrcHeaderInfo;
using xtal::detectMapKind;
using xtal::mrcOriginIsValid;

namespace {

/// A typical CCP4 crystallographic map header: P212121, a cropped block
/// with non-zero starts inside a 48x60x72 cell grid.
MrcHeaderInfo xtalHeader()
{
    MrcHeaderInfo h;
    h.nc = 30; h.nr = 40; h.ns = 50;
    h.ncstart = -5; h.nrstart = 3; h.nsstart = 10;
    h.nx = 48; h.ny = 60; h.nz = 72;
    h.alpha = h.beta = h.gamma = 90.0;
    h.ispg = 19;
    h.nversion = 0;
    return h;
}

/// A typical MRC2014 cryo-EM volume: P1, cubic, block == cell, zero
/// starts, no ORIGIN, no labels.
MrcHeaderInfo emVolumeHeader()
{
    MrcHeaderInfo h;
    h.nc = h.nr = h.ns = 256;
    h.ncstart = h.nrstart = h.nsstart = 0;
    h.nx = h.ny = h.nz = 256;
    h.alpha = h.beta = h.gamma = 90.0;
    h.ispg = 1;
    h.nversion = 20140;
    h.exttyp = "MRCO";
    return h;
}

}  // namespace

TEST(MapKindDetect, CrystalHeaderIsXtal)
{
    EXPECT_EQ(detectMapKind(xtalHeader()), xtal::MAPKIND_XTAL);
}

// The default is conservative: a P1 map without MRC2014 evidence stays
// crystallographic even when its block covers the whole cell.
TEST(MapKindDetect, P1WholeCellWithoutVersionIsXtal)
{
    MrcHeaderInfo h = emVolumeHeader();
    h.nversion = 0;
    EXPECT_EQ(detectMapKind(h), xtal::MAPKIND_XTAL);
}

TEST(MapKindDetect, Ispg0IsEM)
{
    MrcHeaderInfo h = xtalHeader();
    h.ispg = 0;
    EXPECT_EQ(detectMapKind(h), xtal::MAPKIND_EM);
}

TEST(MapKindDetect, VolumeStackIsEM)
{
    MrcHeaderInfo h = xtalHeader();
    h.ispg = 401;
    EXPECT_EQ(detectMapKind(h), xtal::MAPKIND_EM);
}

TEST(MapKindDetect, NonZeroOriginIsEM)
{
    MrcHeaderInfo h = xtalHeader();
    h.hasOrigin = true;
    h.origin[0] = 12.5;
    EXPECT_EQ(detectMapKind(h), xtal::MAPKIND_EM);
}

TEST(MapKindDetect, EMSoftwareLabelIsEM)
{
    MrcHeaderInfo h = xtalHeader();
    h.labels.push_back("::::EMDataBank.org::::EMD-1234::::");
    EXPECT_EQ(detectMapKind(h), xtal::MAPKIND_EM);

    MrcHeaderInfo h2 = xtalHeader();
    h2.labels.push_back("Created by RELION 4.0");
    EXPECT_EQ(detectMapKind(h2), xtal::MAPKIND_EM);

    MrcHeaderInfo h3 = xtalHeader();
    h3.labels.push_back("Created by CCP4 fft version 7.1");
    EXPECT_EQ(detectMapKind(h3), xtal::MAPKIND_XTAL);
}

TEST(MapKindDetect, Mrc2014P1VolumeIsEM)
{
    EXPECT_EQ(detectMapKind(emVolumeHeader()), xtal::MAPKIND_EM);
}

// The moderate rule needs every part of the volume signature.
TEST(MapKindDetect, Mrc2014P1VolumeNeedsWholeCellAndZeroStart)
{
    MrcHeaderInfo h = emVolumeHeader();
    h.ncstart = 4;
    EXPECT_EQ(detectMapKind(h), xtal::MAPKIND_XTAL);

    MrcHeaderInfo h2 = emVolumeHeader();
    h2.nc = 200;
    EXPECT_EQ(detectMapKind(h2), xtal::MAPKIND_XTAL);

    MrcHeaderInfo h3 = emVolumeHeader();
    h3.gamma = 120.0;
    EXPECT_EQ(detectMapKind(h3), xtal::MAPKIND_XTAL);
}

TEST(MapKindDetect, OriginValidity)
{
    const float zero[3] = {0.0f, 0.0f, 0.0f};
    EXPECT_FALSE(mrcOriginIsValid(zero));

    const float ok[3] = {-12.5f, 0.0f, 300.0f};
    EXPECT_TRUE(mrcOriginIsValid(ok));

    const float huge[3] = {1.0e12f, 0.0f, 0.0f};
    EXPECT_FALSE(mrcOriginIsValid(huge));

    const float nan[3] = {std::numeric_limits<float>::quiet_NaN(), 0.0f, 0.0f};
    EXPECT_FALSE(mrcOriginIsValid(nan));
}
