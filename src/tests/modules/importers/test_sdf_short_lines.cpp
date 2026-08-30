// SDF lines shorter than the fixed columns must be reported as format
// errors (or tolerated), never escape as std::out_of_range from substr().
#include <gtest/gtest.h>
#include <common.h>
#include "importers/SDFMolReader.hpp"
#include "molstr/MolCoord.hpp"
#include <qlib/StringStream.hpp>
#include <qlib/LExceptions.hpp>

using importers::SDFMolReader;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using qlib::StrInStream;

namespace {
// Read the text; fail the test only if something other than a qlib
// exception escapes.
void readExpectingNoForeignException(const char *text)
{
    MolCoordPtr pMol(MB_NEW MolCoord());
    SDFMolReader reader;
    reader.attach(pMol);
    StrInStream ins(text);
    try {
        reader.read(ins);
    }
    catch (const qlib::LException &) {
        // a format error is fine
    }
    catch (...) {
        reader.detach();
        FAIL() << "non-qlib exception escaped from SDFMolReader::read()";
    }
    reader.detach();
}
}  // namespace

TEST(SDFMolReaderShortLines, TruncatedCountsLine)
{
    // counts line holds only the atom count (3 chars); the version field
    // at columns 34-39 is missing
    readExpectingNoForeignException("water\n  prog\n\n  1\n");
}

TEST(SDFMolReaderShortLines, TruncatedAtomLine)
{
    // atom line ends after the z coordinate (30 chars, no element symbol)
    readExpectingNoForeignException(
        "water\n  prog\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n"
        "    0.0000    0.0000    0.0000\n"
        "M  END\n$$$$\n");
}
