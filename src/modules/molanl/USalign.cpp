//
// US-align (TM-align) superposition services of MolAnlManager
//

#include <common.h>
#include "MolAnlManager.hpp"
#include "USalignImpl.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Matrix4D.hpp>

#include <qsys/style/AutoStyleCtxt.hpp>

#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/MolResidue.hpp>
#include <modules/molstr/AtomIterator.hpp>
#include <modules/molstr/SelCommand.hpp>
#include <modules/molstr/TopparManager.hpp>

#include <stdexcept>

using namespace molanl;
using namespace molstr;
using qlib::Vector4D;
using qlib::Matrix4D;

namespace {

  /// Pivot residues of one structure, in selection order
  struct PivotChain
  {
    usalign::Chain chain;
    /// residue numbers (for the alignment log)
    std::vector<int> resnum;
  };

  bool isAutoPivot(const LString &pivot)
  {
    return pivot.isEmpty() || pivot.equalsIgnoreCase("auto");
  }

  /// Nucleotide test: the topology type, or (for names the topology does not
  /// know, e.g. modified bases) a sugar backbone without CA
  bool isNucleotide(const MolResiduePtr &pRes, const LString &resn)
  {
    if (TopparManager::isNuclAcid(resn))
      return true;
    if (pRes->getAtomID("CA") >= 0)
      return false;
    return pRes->getAtomID("C3'") >= 0 || pRes->getAtomID("C4'") >= 0;
  }

  /// Collect one pivot atom per selected residue.
  /// Auto pivot: CA for amino acids, C3' for nucleotides (US-align default).
  /// Explicit pivot: the named atom for every residue.
  PivotChain collectPivots(const MolCoordPtr &pmol, const SelectionPtr &psel,
                           const LString &pivot)
  {
    const bool bAuto = isAutoPivot(pivot);
    PivotChain pc;

    MolResiduePtr pPrevRes;
    AtomIterator iter(pmol, psel);
    for (iter.first(); iter.hasMore(); iter.next()) {
      MolAtomPtr pAtom = iter.get();

      // one conformation per residue: no alternate location, or 'A'
      const char confid = pAtom->getConfID();
      if (confid != '\0' && confid != ' ' && confid != 'A')
        continue;

      const LString &aname = pAtom->getName();
      const LString &resn = pAtom->getResName();
      MolResiduePtr pRes = pAtom->getParentResidue();
      if (pRes.isnull() || pRes == pPrevRes)
        continue;

      if (bAuto) {
        if (!aname.equals("CA") && !aname.equals("C3'"))
          continue;
      }
      else if (!aname.equals(pivot))
        continue;

      const bool bNucl = isNucleotide(pRes, resn);
      if (bAuto && aname.equals("CA") == bNucl)
        continue;

      pPrevRes = pRes;

      const Vector4D pos = pAtom->getPos();
      pc.chain.xyz.push_back(pos.x());
      pc.chain.xyz.push_back(pos.y());
      pc.chain.xyz.push_back(pos.z());
      char code = usalign::residueCode(resn.c_str());
      if (bNucl && code >= 'A' && code <= 'Z')
        code = char(code - 'A' + 'a');
      pc.chain.seq += code;
      pc.chain.molScore += bNucl ? 1 : -1;
      pc.resnum.push_back(pAtom->getResIndex().first);
    }

    if (pc.chain.size() < 3) {
      LString msg = LString::format(
          "US-align: fewer than 3 residues with pivot atom (%s) in sel[%s] of mol[%s]",
          bAuto ? "auto" : pivot.c_str(), psel->toString().c_str(),
          pmol->getName().c_str());
      MB_THROW(qlib::IllegalArgumentException, msg);
    }
    return pc;
  }

  /// Residue number of the first residue in each alignment row
  int rowStartResnum(const std::string &aln, const std::vector<int> &resnum, int col)
  {
    int idx = 0;
    for (int i = 0; i < col && i < int(aln.size()); ++i)
      if (aln[i] != '-')
        ++idx;
    if (idx < int(resnum.size()))
      return resnum[idx];
    return resnum.empty() ? 0 : resnum.back();
  }

  void printAlignment(const usalign::Result &res, const PivotChain &ref,
                      const PivotChain &mov)
  {
    LOG_DPRINTLN(" Alignment (\":\" d<5A, \".\" otherwise):");
    const int row_size = 60;
    const int naln = int(res.alnRef.size());
    for (int nst = 0; nst < naln; nst += row_size) {
      if (nst > 0)
        LOG_DPRINTLN("");
      LOG_DPRINTLN(" Ref% 4d %s", rowStartResnum(res.alnRef, ref.resnum, nst),
                   res.alnRef.substr(nst, row_size).c_str());
      LOG_DPRINTLN("         %s", res.match.substr(nst, row_size).c_str());
      LOG_DPRINTLN(" Mov% 4d %s", rowStartResnum(res.alnMov, mov.resnum, nst),
                   res.alnMov.substr(nst, row_size).c_str());
    }
  }

  Matrix4D toMatrix(const usalign::Result &res)
  {
    Matrix4D m;
    for (int i = 0; i < 3; ++i) {
      for (int j = 0; j < 3; ++j)
        m.aij(i + 1, j + 1) = res.u[i][j];
      m.aij(i + 1, 4) = res.t[i];
    }
    return m;
  }

}

usalign::Result MolAnlManager::superposeUSalign_impl(const MolCoordPtr &pmol_ref,
                                                     const SelectionPtr &psel_ref,
                                                     const MolCoordPtr &pmol_mov,
                                                     const SelectionPtr &psel_mov,
                                                     const LString &pivot, bool bShowLog)
{
  PivotChain ref = collectPivots(pmol_ref, psel_ref, pivot);
  PivotChain mov = collectPivots(pmol_mov, psel_mov, pivot);

  // the nucleic acid secondary structure assignment depends on the atom
  const std::string atomName =
      usalign::padAtomName(isAutoPivot(pivot) ? std::string("C3'") : std::string(pivot.c_str()));

  usalign::Result res;
  try {
    res = usalign::align(mov.chain, ref.chain, atomName);
  }
  catch (const std::exception &e) {
    MB_THROW(qlib::RuntimeException, LString(e.what()));
  }

  if (bShowLog) {
    LOG_DPRINTLN("===== US-align superpose result =====");
    LOG_DPRINTLN(" Ref: %s (%d residues), Mov: %s (%d residues)",
                 pmol_ref->getName().c_str(), ref.chain.size(),
                 pmol_mov->getName().c_str(), mov.chain.size());
    LOG_DPRINTLN(" Pivot: %s, type: %s", isAutoPivot(pivot) ? "auto" : pivot.c_str(),
                 res.nucleic ? "nucleic acid" : "protein");
    LOG_DPRINTLN(" TM-score: %f (normalized by Ref), %f (normalized by Mov)",
                 res.tmRef, res.tmMov);
    LOG_DPRINTLN(" RMSD: %f angstrom", res.rmsd);
    LOG_DPRINTLN(" Nalgn: %d", res.nAligned);
    LOG_DPRINTLN(" SeqID: %f", res.seqId);
    printAlignment(res, ref, mov);
    LOG_DPRINTLN("========================");
  }

  return res;
}

Matrix4D MolAnlManager::superposeUSalign1(const MolCoordPtr &pmol_ref, const SelectionPtr &psel_ref,
                                          const MolCoordPtr &pmol_mov, const SelectionPtr &psel_mov,
                                          const LString &pivot, bool bUseProp /*=false*/)
{
  qsys::AutoStyleCtxt asc(pmol_ref->getSceneID());

  usalign::Result res =
      superposeUSalign_impl(pmol_ref, psel_ref, pmol_mov, psel_mov, pivot, true);
  const Matrix4D xfmat = toMatrix(res);
  applyXform(pmol_mov, xfmat, bUseProp);
  return xfmat;
}

void MolAnlManager::superposeUSalign2(qlib::uid_t mol_ref, const LString &sel_ref,
                                      qlib::uid_t mol_mov, const LString &sel_mov,
                                      const LString &pivot)
{
  MolCoordPtr pMolRef = MolCoord::getMolByID(mol_ref);
  MolCoordPtr pMolMov = MolCoord::getMolByID(mol_mov);

  SelectionPtr pSelRef = SelectionPtr(new SelCommand(sel_ref));
  SelectionPtr pSelMov = SelectionPtr(new SelCommand(sel_mov));

  superposeUSalign1(pMolRef, pSelRef, pMolMov, pSelMov, pivot);
}

LString MolAnlManager::superposeUSalignJSON(const MolCoordPtr &pmol_ref, const SelectionPtr &psel_ref,
                                            const MolCoordPtr &pmol_mov, const SelectionPtr &psel_mov,
                                            const LString &pivot, bool bShowLog)
{
  qsys::AutoStyleCtxt asc(pmol_ref->getSceneID());

  usalign::Result res =
      superposeUSalign_impl(pmol_ref, psel_ref, pmol_mov, psel_mov, pivot, bShowLog);
  return LString::format(
      "{\"tm_ref\":%.6f,\"tm_mov\":%.6f,\"rmsd\":%.6f,\"nalgn\":%d,\"seqid\":%.6f,\"nucleic\":%s}",
      res.tmRef, res.tmMov, res.rmsd, res.nAligned, res.seqId, res.nucleic ? "true" : "false");
}
