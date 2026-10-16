//
// Thin wrapper around the vendored US-align (monomer TM-align path)
//
// This header exposes only plain data types, so the vendored headers
// (which define non-inline functions and "using namespace std") stay
// confined to USalignImpl.cpp.
//

#ifndef MOLANL_USALIGN_IMPL_HPP_INCLUDED
#define MOLANL_USALIGN_IMPL_HPP_INCLUDED

#include <string>
#include <vector>

namespace molanl {
namespace usalign {

  /// One structure, one pivot atom per residue
  struct Chain
  {
    /// pivot atom coordinates (x, y, z per residue)
    std::vector<double> xyz;

    /// one-letter residue codes (nucleotides in lower case, as US-align)
    std::string seq;

    /// number of nucleotide residues minus number of amino acid residues
    /// (US-align's mol_vec; positive means a nucleic acid chain)
    int molScore = 0;

    int size() const { return int(seq.size()); }
  };

  struct Result
  {
    /// transform that maps the moving chain onto the reference:
    /// x' = t + u x
    double t[3];
    double u[3][3];

    /// TM-score normalized by the reference / moving chain length
    double tmRef = 0.0;
    double tmMov = 0.0;

    /// RMSD and number of residues of the aligned pairs (d < 5 A)
    double rmsd = 0.0;
    int nAligned = 0;

    /// identical residues in the aligned pairs / nAligned
    double seqId = 0.0;

    /// true when the pair was scored as nucleic acid (mol_type > 0)
    bool nucleic = false;

    /// gapped alignment strings ('-' for gaps) and the match line
    /// (':' d < 5 A, '.' otherwise, ' ' unaligned)
    std::string alnRef;
    std::string alnMov;
    std::string match;
  };

  /// One-letter code of a residue name, using US-align's own table
  /// (amino acids upper case, nucleotides "A"/"DA" etc. lower case)
  char residueCode(const std::string &resname);

  /// Pad an atom name to the 4-column PDB form US-align expects
  /// (e.g. "C3'" -> " C3'", "P" -> " P  ")
  std::string padAtomName(const std::string &name);

  /// Run TM-align on mov (structure 1) against ref (structure 2).
  /// atomName is the nucleic acid pivot atom in 4-column form; it selects
  /// the distance bounds of the RNA secondary structure assignment.
  /// Throws std::runtime_error on failure.
  Result align(const Chain &mov, const Chain &ref, const std::string &atomName);

}
}

#endif
