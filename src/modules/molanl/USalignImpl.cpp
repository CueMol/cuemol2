//
// Thin wrapper around the vendored US-align (monomer TM-align path)
//
// This is the only translation unit that includes the vendored headers.
//

#include "USalignImpl.hpp"

// Standard headers used by the vendored code; included first so that they
// are not pulled into namespace usalign_vendor below.
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <time.h>
#include <string.h>
#include <algorithm>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <iterator>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace usalign_vendor {
#include "usalign/TMalign.h"
}

namespace molanl {
namespace usalign {

  namespace uv = usalign_vendor;

  char residueCode(const std::string &resname)
  {
    // AAmap() reads the 3-column residue name field of a PDB line
    std::string name = resname;
    if (name.size() < 3)
      name = std::string(3 - name.size(), ' ') + name;
    else if (name.size() > 3)
      name = name.substr(0, 3);
    return uv::AAmap(name);
  }

  std::string padAtomName(const std::string &name)
  {
    // same rule as US-align's "autojustify"
    switch (name.size()) {
    case 1:
      return " " + name + "  ";
    case 2:
      return " " + name + " ";
    case 3:
      return " " + name;
    default:
      return name;
    }
  }

  namespace {
    // RAII holder for the double** arrays used by US-align
    struct Coords
    {
      double **a = nullptr;
      int len = 0;
      explicit Coords(const Chain &c) : len(c.size())
      {
        uv::NewArray(&a, len, 3);
        for (int i = 0; i < len; ++i)
          for (int k = 0; k < 3; ++k)
            a[i][k] = c.xyz[i * 3 + k];
      }
      ~Coords() { uv::DeleteArray(&a, len); }
      Coords(const Coords &) = delete;
      Coords &operator=(const Coords &) = delete;
    };

    void makeSec(const Chain &c, double **a, std::vector<char> &sec,
                 std::vector<char> &seq, const std::string &atomName)
    {
      sec.assign(c.size() + 1, '\0');
      seq.assign(c.seq.begin(), c.seq.end());
      seq.push_back('\0');
      if (c.molScore > 0)
        uv::make_sec(seq.data(), a, c.size(), sec.data(), atomName);
      else
        uv::make_sec(a, c.size(), sec.data());
    }
  }

  Result align(const Chain &mov, const Chain &ref, const std::string &atomName)
  {
    if (mov.size() < 3 || ref.size() < 3)
      throw std::runtime_error("US-align: sequence is too short (<3 residues)");

    Coords xa(mov);
    Coords ya(ref);
    std::vector<char> secx, secy, seqx, seqy;
    makeSec(mov, xa.a, secx, seqx, atomName);
    makeSec(ref, ya.a, secy, seqy, atomName);

    Result res;
    double TM1, TM2, TM3, TM4, TM5;
    double d0_0, TM_0, d0A, d0B, d0u, d0a;
    double d0_out = 5.0;  // input: distance cutoff of ":" in seqM
    std::string seqM, seqxA, seqyA;
    std::vector<double> do_vec;
    double rmsd0 = 0.0, Liden = 0.0, TM_ali, rmsd_ali;
    int L_ali = 0, n_ali = 0, n_ali8 = 0;
    const std::vector<std::string> sequence;  // no user alignment
    const int molType = mov.molScore + ref.molScore;

    // Default options of the US-align CLI for a monomer pair
    // (no -i/-a/-u/-d, not fast, no TM-score cutoff)
    const int rc = uv::TMalign_main(
        xa.a, ya.a, seqx.data(), seqy.data(), secx.data(), secy.data(),
        res.t, res.u, TM1, TM2, TM3, TM4, TM5,
        d0_0, TM_0, d0A, d0B, d0u, d0a, d0_out,
        seqM, seqxA, seqyA, do_vec,
        rmsd0, L_ali, Liden, TM_ali, rmsd_ali, n_ali, n_ali8,
        mov.size(), ref.size(), sequence, 0.0, 0.0,
        0, 0, false, false, false, molType, -1.0, 0);
    if (rc != 0)
      throw std::runtime_error("US-align: no alignment between the two structures");

    // TM1 is normalized by structure 2 (ref), TM2 by structure 1 (mov)
    res.tmRef = TM1;
    res.tmMov = TM2;
    res.rmsd = rmsd0;
    res.nAligned = n_ali8;
    res.seqId = (n_ali8 > 0) ? Liden / n_ali8 : 0.0;
    res.nucleic = molType > 0;
    res.alnRef = seqyA;
    res.alnMov = seqxA;
    res.match = seqM;
    return res;
  }

}
}
