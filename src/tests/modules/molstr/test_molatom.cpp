#include <gtest/gtest.h>
#include <common.h>
#include "molstr/MolAtom.hpp"
#include "molstr/ElemSym.hpp"

using molstr::MolAtom;
using molstr::MolBond;
using molstr::ResidIndex;
using molstr::ElemSym;
using qlib::Vector4D;
using qlib::Matrix4D;
using qlib::LString;

// ---- Default constructor ----

TEST(MolAtomTest, DefaultParentUIDInvalid)
{
    MolAtom atom;
    EXPECT_EQ(atom.getParentUID(), qlib::invalid_uid);
}

TEST(MolAtomTest, DefaultIDIsMinusOne)
{
    MolAtom atom;
    EXPECT_EQ(atom.getID(), -1);
}

TEST(MolAtomTest, DefaultElementIsXX)
{
    MolAtom atom;
    EXPECT_EQ(atom.getElement(), (molstr::ElemID)ElemSym::XX);
}

TEST(MolAtomTest, DefaultBfacAndOcc)
{
    MolAtom atom;
    EXPECT_DOUBLE_EQ(atom.getBfac(), 1.0);
    EXPECT_DOUBLE_EQ(atom.getOcc(), 1.0);
}

TEST(MolAtomTest, DefaultConfIDIsNull)
{
    MolAtom atom;
    EXPECT_EQ(atom.getConfID(), '\0');
}

TEST(MolAtomTest, DefaultNoBonds)
{
    MolAtom atom;
    EXPECT_EQ(atom.getBondCount(), 0);
}

TEST(MolAtomTest, DefaultNoAnIsoU)
{
    MolAtom atom;
    EXPECT_FALSE(atom.hasAnIsoU());
}

// ---- Property setters/getters ----

TEST(MolAtomTest, SetGetName)
{
    MolAtom atom;
    atom.setName("CA");
    EXPECT_EQ(atom.getName(), LString("CA"));
}

TEST(MolAtomTest, SetGetID)
{
    MolAtom atom;
    atom.setID(42);
    EXPECT_EQ(atom.getID(), 42);
}

TEST(MolAtomTest, SetGetChainName)
{
    MolAtom atom;
    atom.setChainName("A");
    EXPECT_EQ(atom.getChainName(), LString("A"));
}

TEST(MolAtomTest, SetGetResName)
{
    MolAtom atom;
    atom.setResName("ALA");
    EXPECT_EQ(atom.getResName(), LString("ALA"));
}

TEST(MolAtomTest, SetGetResIndex)
{
    MolAtom atom;
    atom.setResIndex(ResidIndex(10));
    EXPECT_EQ(atom.getResIndex(), ResidIndex(10));
}

TEST(MolAtomTest, SetGetResIndexWithInscode)
{
    MolAtom atom;
    atom.setResIndex(ResidIndex(5, 'A'));
    EXPECT_EQ(atom.getResIndex(), ResidIndex(5, 'A'));
}

TEST(MolAtomTest, SetGetBfac)
{
    MolAtom atom;
    atom.setBfac(25.5);
    EXPECT_DOUBLE_EQ(atom.getBfac(), 25.5);
}

TEST(MolAtomTest, SetGetOcc)
{
    MolAtom atom;
    atom.setOcc(0.5);
    EXPECT_DOUBLE_EQ(atom.getOcc(), 0.5);
}

TEST(MolAtomTest, SetGetConfID)
{
    MolAtom atom;
    atom.setConfID('B');
    EXPECT_EQ(atom.getConfID(), 'B');
}

TEST(MolAtomTest, SetGetCName)
{
    MolAtom atom;
    atom.setCName("CA");
    EXPECT_EQ(atom.getCName(), LString("CA"));
}

TEST(MolAtomTest, SetGetElement)
{
    MolAtom atom;
    atom.setElement(ElemSym::C);
    EXPECT_EQ(atom.getElement(), (molstr::ElemID)ElemSym::C);
}

TEST(MolAtomTest, SetGetElementByName)
{
    MolAtom atom;
    atom.setElementName("N");
    EXPECT_EQ(atom.getElement(), (molstr::ElemID)ElemSym::N);
    EXPECT_EQ(atom.getElementName(), LString("N"));
}

// ---- Position ----

TEST(MolAtomTest, SetGetPos)
{
    MolAtom atom;
    Vector4D v(1.0, 2.0, 3.0);
    atom.setPos(v);
    Vector4D r = atom.getPos();
    EXPECT_DOUBLE_EQ(r.x(), 1.0);
    EXPECT_DOUBLE_EQ(r.y(), 2.0);
    EXPECT_DOUBLE_EQ(r.z(), 3.0);
}

TEST(MolAtomTest, SetRawPosGetRawPos)
{
    MolAtom atom;
    Vector4D v(4.0, 5.0, 6.0);
    atom.setRawPos(v);
    const Vector4D &r = atom.getRawPos();
    EXPECT_DOUBLE_EQ(r.x(), 4.0);
    EXPECT_DOUBLE_EQ(r.y(), 5.0);
    EXPECT_DOUBLE_EQ(r.z(), 6.0);
}

// ---- XformMatrix ----

TEST(MolAtomTest, XformMatrixTranslatesPos)
{
    MolAtom atom;
    atom.setPos(Vector4D(1.0, 2.0, 3.0));

    // Build a translation matrix: shift by (10, 20, 30)
    Matrix4D m;
    m.aij(1, 4) = 10.0;
    m.aij(2, 4) = 20.0;
    m.aij(3, 4) = 30.0;

    atom.setXformMatrix(m);
    Vector4D r = atom.getPos();
    EXPECT_NEAR(r.x(), 11.0, 1e-9);
    EXPECT_NEAR(r.y(), 22.0, 1e-9);
    EXPECT_NEAR(r.z(), 33.0, 1e-9);
}

TEST(MolAtomTest, ResetXformMatrixRestoresRawPos)
{
    MolAtom atom;
    atom.setPos(Vector4D(1.0, 2.0, 3.0));

    Matrix4D m;
    m.aij(1, 4) = 10.0;
    atom.setXformMatrix(m);
    atom.resetXformMatrix();

    Vector4D r = atom.getPos();
    EXPECT_DOUBLE_EQ(r.x(), 1.0);
}

TEST(MolAtomTest, SetPosThrowsWhenXformMatrixApplied)
{
    MolAtom atom;
    atom.setPos(Vector4D(1.0, 2.0, 3.0));

    Matrix4D m;
    m.aij(1, 4) = 10.0;
    atom.setXformMatrix(m);

    EXPECT_THROW(atom.setPos(Vector4D(0, 0, 0)), qlib::RuntimeException);
}

// ---- Bond management ----

TEST(MolAtomTest, AddBondIncreasesCount)
{
    MolAtom atom;
    atom.setID(0);

    MolBond bond;
    bond.setAtom1(0);
    bond.setAtom2(1);

    EXPECT_TRUE(atom.addBond(&bond));
    EXPECT_EQ(atom.getBondCount(), 1);
}

TEST(MolAtomTest, DuplicateBondNotAdded)
{
    MolAtom atom;
    atom.setID(0);

    MolBond bond;
    bond.setAtom1(0);
    bond.setAtom2(1);

    atom.addBond(&bond);
    EXPECT_FALSE(atom.addBond(&bond));
    EXPECT_EQ(atom.getBondCount(), 1);
}

TEST(MolAtomTest, IsBondedAfterAdd)
{
    MolAtom atom;
    atom.setID(0);

    MolBond bond;
    bond.setAtom1(0);
    bond.setAtom2(5);
    atom.addBond(&bond);

    EXPECT_TRUE(atom.isBonded(5));
    EXPECT_FALSE(atom.isBonded(9));
}

TEST(MolAtomTest, GetBondReturnsCorrectPointer)
{
    MolAtom atom;
    atom.setID(0);

    MolBond bond;
    bond.setAtom1(0);
    bond.setAtom2(3);
    atom.addBond(&bond);

    EXPECT_EQ(atom.getBond(3), &bond);
    EXPECT_EQ(atom.getBond(99), nullptr);
}

TEST(MolAtomTest, RemoveBondDecreasesCount)
{
    MolAtom atom;
    atom.setID(0);

    MolBond bond;
    bond.setAtom1(0);
    bond.setAtom2(2);
    atom.addBond(&bond);

    EXPECT_TRUE(atom.removeBond(&bond));
    EXPECT_EQ(atom.getBondCount(), 0);
    EXPECT_FALSE(atom.isBonded(2));
}

TEST(MolAtomTest, RemoveNonExistentBondReturnsFalse)
{
    MolAtom atom;
    atom.setID(0);

    MolBond bond;
    bond.setAtom1(0);
    bond.setAtom2(7);

    EXPECT_FALSE(atom.removeBond(&bond));
}

// ---- Anisotropic U ----

TEST(MolAtomTest, SetUEnablesAnIsoU)
{
    MolAtom atom;
    atom.setU(0, 0, 0.1);
    EXPECT_TRUE(atom.hasAnIsoU());
}

TEST(MolAtomTest, SetGetUValues)
{
    MolAtom atom;
    atom.setU(0, 0, 0.1);
    atom.setU(1, 1, 0.2);
    atom.setU(2, 2, 0.3);
    atom.setU(0, 1, 0.05);
    atom.setU(0, 2, 0.06);
    atom.setU(1, 2, 0.07);

    EXPECT_DOUBLE_EQ(atom.getU(0, 0), 0.1);
    EXPECT_DOUBLE_EQ(atom.getU(1, 1), 0.2);
    EXPECT_DOUBLE_EQ(atom.getU(2, 2), 0.3);
    EXPECT_DOUBLE_EQ(atom.getU(0, 1), 0.05);
    EXPECT_DOUBLE_EQ(atom.getU(1, 0), 0.05);  // symmetric
    EXPECT_DOUBLE_EQ(atom.getU(0, 2), 0.06);
    EXPECT_DOUBLE_EQ(atom.getU(1, 2), 0.07);
}

// ---- Copy constructor ----

TEST(MolAtomTest, CopyCtorCopiesProperties)
{
    MolAtom src;
    src.setName("CB");
    src.setChainName("B");
    src.setResName("GLY");
    src.setResIndex(ResidIndex(7));
    src.setID(3);
    src.setElement(ElemSym::C);
    src.setPos(Vector4D(1.0, 2.0, 3.0));
    src.setBfac(15.0);
    src.setOcc(0.8);
    src.setConfID('A');
    src.setCName("CB");

    MolAtom copy(src);

    EXPECT_EQ(copy.getName(), LString("CB"));
    EXPECT_EQ(copy.getChainName(), LString("B"));
    EXPECT_EQ(copy.getResName(), LString("GLY"));
    EXPECT_EQ(copy.getResIndex(), ResidIndex(7));
    EXPECT_EQ(copy.getID(), 3);
    EXPECT_EQ(copy.getElement(), (molstr::ElemID)ElemSym::C);
    EXPECT_DOUBLE_EQ(copy.getBfac(), 15.0);
    EXPECT_DOUBLE_EQ(copy.getOcc(), 0.8);
    EXPECT_EQ(copy.getConfID(), 'A');
    EXPECT_EQ(copy.getCName(), LString("CB"));
    Vector4D p = copy.getPos();
    EXPECT_DOUBLE_EQ(p.x(), 1.0);
    EXPECT_DOUBLE_EQ(p.y(), 2.0);
    EXPECT_DOUBLE_EQ(p.z(), 3.0);
}

TEST(MolAtomTest, CopyCtorDoesNotCopyParentUID)
{
    MolAtom src;
    src.setParentUID(999);

    MolAtom copy(src);
    EXPECT_EQ(copy.getParentUID(), qlib::invalid_uid);
}

TEST(MolAtomTest, CopyCtorCopiesAnIsoU)
{
    MolAtom src;
    src.setU(0, 0, 0.1);
    src.setU(1, 1, 0.2);
    src.setU(2, 2, 0.3);

    MolAtom copy(src);
    EXPECT_TRUE(copy.hasAnIsoU());
    EXPECT_DOUBLE_EQ(copy.getU(0, 0), 0.1);
    EXPECT_DOUBLE_EQ(copy.getU(1, 1), 0.2);
    EXPECT_DOUBLE_EQ(copy.getU(2, 2), 0.3);
}

// ---- formatMsg / toString ----

TEST(MolAtomTest, FormatMsgContainsAtomInfo)
{
    MolAtom atom;
    atom.setChainName("A");
    atom.setResName("ALA");
    atom.setResIndex(ResidIndex(10));
    atom.setName("CA");

    LString msg = atom.formatMsg();
    EXPECT_NE(msg.indexOf("A"), -1);
    EXPECT_NE(msg.indexOf("ALA"), -1);
    EXPECT_NE(msg.indexOf("CA"), -1);
}

TEST(MolAtomTest, ToStringEqualsFormatMsg)
{
    MolAtom atom;
    atom.setChainName("A");
    atom.setResName("ALA");
    atom.setResIndex(ResidIndex(10));
    atom.setName("CA");

    EXPECT_EQ(atom.toString(), atom.formatMsg());
}

// ---- Dynamic properties ----

TEST(MolAtomTest, SetGetAtomPropInt)
{
    MolAtom atom;
    atom.setAtomPropInt("myInt", 42);
    EXPECT_EQ(atom.getAtomPropInt("myInt"), 42);
    EXPECT_TRUE(atom.hasAtomProp("myInt"));
}

TEST(MolAtomTest, SetGetAtomPropReal)
{
    MolAtom atom;
    atom.setAtomPropReal("myReal", 3.14);
    EXPECT_DOUBLE_EQ(atom.getAtomPropReal("myReal"), 3.14);
}

TEST(MolAtomTest, SetGetAtomPropStr)
{
    MolAtom atom;
    atom.setAtomPropStr("myStr", "hello");
    EXPECT_EQ(atom.getAtomPropStr("myStr"), LString("hello"));
}

TEST(MolAtomTest, RemoveAtomProp)
{
    MolAtom atom;
    atom.setAtomPropInt("key", 1);
    EXPECT_TRUE(atom.hasAtomProp("key"));
    atom.removeAtomProp("key");
    EXPECT_FALSE(atom.hasAtomProp("key"));
}
