#include <gtest/gtest.h>
#include <common.h>
#include "molstr/PDBFileReader.hpp"
#include "qsys/ObjReader.hpp"
#include <qlib/StringStream.hpp>
#include <string>

using molstr::PDBFileReader;
using qsys::ObjReader;
using qlib::StrInStream;

namespace {

int sniff(const ObjReader &reader, const std::string &payload)
{
    StrInStream ins(payload.data(), static_cast<int>(payload.size()));
    return reader.canHandleContent(ins);
}

}  // namespace

// ----------------------------------------------------------------------
// PDBFileReader::canHandleContent
// ----------------------------------------------------------------------

TEST(PDBFileReaderSniffTest, HeaderRecordReturnsYes)
{
    PDBFileReader reader;
    const std::string payload =
        "HEADER    PROTEIN                                   01-JAN-00   1ABC              \n"
        "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(PDBFileReaderSniffTest, AtomFixedWidthRecordReturnsYes)
{
    PDBFileReader reader;
    // PDB fixed-width: "ATOM  " (4 chars + 2 trailing spaces). The 2nd
    // trailing space distinguishes from mmCIF "ATOM 1 ..." which has
    // only a single space after the keyword.
    const std::string payload =
        "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(PDBFileReaderSniffTest, HetatmRecordReturnsYes)
{
    PDBFileReader reader;
    const std::string payload =
        "HETATM    1  O   HOH A 100      0.000   0.000   0.000  1.00 20.00           O\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(PDBFileReaderSniffTest, Cryst1RecordReturnsYes)
{
    PDBFileReader reader;
    const std::string payload =
        "CRYST1   30.000   40.000   50.000  90.00  90.00  90.00 P 1           1\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(PDBFileReaderSniffTest, RemarkAfterTitleReturnsYes)
{
    PDBFileReader reader;
    // Files often start with TITLE / REMARK before ATOM. TITLE is
    // 5 chars + space; REMARK is 6 chars. Both are PDB-specific.
    const std::string payload =
        "TITLE     test protein\n"
        "REMARK    blah blah\n"
        "ATOM      1  N   ALA A   1       0.000   0.000   0.000\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_YES);
}

TEST(PDBFileReaderSniffTest, MmcifReturnsNo)
{
    PDBFileReader reader;
    // mmCIF starts with "data_" which is the canonical CIF block marker.
    const std::string payload =
        "data_1ABC\n"
        "loop_\n"
        "_atom_site.group_PDB\n"
        "ATOM 1 N N . ALA A 1 1 ? .\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_NO);
}

TEST(PDBFileReaderSniffTest, MmcifAtomWithSingleSpaceIsNotPdbAtom)
{
    PDBFileReader reader;
    // mmCIF "ATOM 1 ..." (single space after keyword) does NOT match
    // PDB's 6-char fixed-width record-name field. No data_ block
    // marker here, so we cannot positively NO -- return UNKNOWN.
    const std::string payload =
        "ATOM 1 N N . ALA A 1 1 ? .\n";
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}

TEST(PDBFileReaderSniffTest, EmptyReturnsUnknown)
{
    PDBFileReader reader;
    EXPECT_EQ(sniff(reader, std::string()), ObjReader::CONTENT_UNKNOWN);
}

TEST(PDBFileReaderSniffTest, BinaryReturnsUnknown)
{
    PDBFileReader reader;
    // Binary input has no PDB record names at column 0; LineStream-
    // based sniff returns UNKNOWN naturally. No explicit binary
    // reject is needed.
    const std::string payload(216, '\0');
    EXPECT_EQ(sniff(reader, payload), ObjReader::CONTENT_UNKNOWN);
}
