// -*-Mode: C++;-*-
//
// Least square fitting using minpack LMDIF
//
// $Id: LsqFit.cpp,v 1.6 2011/04/29 13:40:37 rishitani Exp $

#include <common.h>

#include "MolAnlManager.hpp"

#include <qlib/LExceptions.hpp>
#include <qlib/Matrix3D.hpp>
#include <qlib/Array.hpp>
#include <qlib/LQuat.hpp>
#include <qlib/PrintStream.hpp>
#include <qlib/FileStream.hpp>

#include <qsys/style/AutoStyleCtxt.hpp>

#include <modules/molstr/MolAtom.hpp>
#include <modules/molstr/MolArrayMap.hpp>
#include <modules/molstr/AtomIterator.hpp>

#include "minpack/LMMinimizer.hpp"

//#include "MolXfrmEditInfo.hpp"
//#include <mbsys/UndoManager.hpp>

using namespace molanl;

using qlib::Array;
using qlib::Matrix4D;
using qlib::Matrix3D;
using qlib::Vector4D;
using qlib::LQuat;
using qlib::PrintStream;
using molstr::MolArrayMap;

#define SQR(X) (X)*(X)

namespace {

  class RotEval : public minpack::LMMinimizer::EvalFcn
  {
  private:
    const qlib::Array<double> *m_pacrd;
    const qlib::Array<double> *m_pbcrd;
    LQuat m_q;
    Matrix4D m_mat;
  
    int m_nEval;

  public:

    RotEval()
      : m_pacrd(NULL), m_pbcrd(NULL), m_nEval(0)
    {
    }
      
    virtual ~RotEval() {}

    void resetEvalCnt() { m_nEval = 0; }
    int neval() const { return m_nEval; }

    void setCrd(const qlib::Array<double> *pa, const qlib::Array<double> *pb)
    {
      m_pacrd = pa;
      m_pbcrd = pb;
    }

    // x:n=3+3, fvec:m
    void eval(double *x, double *fvec, int iflag)
    {
      ++m_nEval;
      int i;
      
      m_q.fromEuler(x[0], x[1], x[2]);
      m_mat = Matrix4D::makeRotMat(m_q);
      
      const qlib::Array<double> &acrd = *m_pacrd;
      const qlib::Array<double> &bcrd = *m_pbcrd;
      int m = acrd.size();
      
      for (i=0; i<m; i+=3) {
	fvec[i  ] = (acrd[i  ] - (m_mat.aij(1, 1)*bcrd[i]   +
				  m_mat.aij(1, 2)*bcrd[i+1] +
				  m_mat.aij(1, 3)*bcrd[i+2] + x[3]));
      
	fvec[i+1] = (acrd[i+1] - (m_mat.aij(2, 1)*bcrd[i]   +
				  m_mat.aij(2, 2)*bcrd[i+1] +
				  m_mat.aij(2, 3)*bcrd[i+2] + x[4]));
      
	fvec[i+2] = (acrd[i+2] - (m_mat.aij(3, 1)*bcrd[i]   +
				  m_mat.aij(3, 2)*bcrd[i+1] +
				  m_mat.aij(3, 3)*bcrd[i+2] + x[5]));
      }

      //      MB_DPRINTLN("--> A=%f B=%f G=%f, DX=%f DY=%f DZ=%f",
      //		  x[0], x[1], x[2], x[3], x[4], x[5]);
    }
  };

}

void MolAnlManager::superposeLSQ1(MolCoordPtr pmol_ref, SelectionPtr psel_ref,
                                  MolCoordPtr pmol_mov, SelectionPtr psel_mov, bool bUseProp/*=false*/)
{
  qsys::AutoStyleCtxt asc(pmol_ref->getSceneID());

  double rmsd;
  int nfit;
  Matrix4D xfmat;
  bool res = lsqFit(pmol_ref, psel_ref, pmol_mov, psel_mov, &rmsd, &nfit, &xfmat);
  if (!res) {
    LOG_DPRINTLN("LSQ superpose failed.");
    return;
  }

  Matrix4D origmat = pmol_mov->getXformMatrix();
  if (!origmat.isIdent()) {
    // apply xform matrix prop and reset to it identity
    pmol_mov->resetProperty("xformMat");
    pmol_mov->xformByMat(origmat);
  }

  if (bUseProp) {
    qlib::LScrMatrix4D *pscr = MB_NEW qlib::LScrMatrix4D(xfmat);
    qlib::LVariant var(pscr);
    pmol_mov->setProperty("xformMat", var);
    //pmol_mov->setXformMatrix(xfmat);
  }
  else {
    pmol_mov->xformByMat(xfmat);
    pmol_mov->fireAtomsMoved();
  }

  LOG_DPRINTLN("=== LSQ superpose result ===");
  LOG_DPRINTLN(" RMSD: %f angstrom", rmsd);
  LOG_DPRINTLN(" Nfit: %d atoms", nfit);
  LOG_DPRINTLN("======");
}

bool MolAnlManager::lsqFit(MolCoordPtr pRefMol, SelectionPtr pRefSel,
                           MolCoordPtr pMovMol, SelectionPtr pMovSel,
                           double *pdRMSD, int *pnFit, Matrix4D *presmat)
{
  molstr::MolArrayMap aref, amov;
  int i;

  // evaluate selection
  aref.setup(pRefMol, pRefSel);
  amov.setup(pMovMol, pMovSel);

  if (aref.size()!=amov.size()) {
    LString msg =
      LString::format("Reference mol(%s) nsel (%d) != Fitting mol(%s) nsel (%d)",
		      pRefMol->getName().c_str(), aref.size(),
		      pMovMol->getName().c_str(), amov.size());
    LOG_DPRINTLN("LsqFit> %s", msg.c_str());
    MB_THROW(qlib::IllegalArgumentException, msg);
    return false;
  }

  // make fitting arrays
  int nLsqAtoms = aref.size();
  int nLsqCords = aref.size()*3;
  if (nLsqAtoms<=0) {
    LString msg = "Empty mol selection";
    LOG_DPRINTLN("LsqFit> %s", msg.c_str());
    MB_THROW(qlib::IllegalArgumentException, msg);
    return false;
  }

  qlib::Array<double> movary(nLsqCords), refary(nLsqCords);
  Vector4D comref, commov;
  {
    MolArrayMap::const_iterator iter = aref.begin();
    for (i=0; iter!=aref.end(); ++iter, ++i) {
      Vector4D pos = iter->first.pA->getPos();
      refary[i*3] = pos.x();
      refary[i*3+1] = pos.y();
      refary[i*3+2] = pos.z();
      comref += pos;
    }
    comref /= nLsqAtoms;
  }

  {
    MolArrayMap::const_iterator iter = amov.begin();
    for (i=0; iter!=amov.end(); ++iter, ++i) {
      Vector4D pos = iter->first.pA->getPos();
      movary[i*3] = pos.x();
      movary[i*3+1] = pos.y();
      movary[i*3+2] = pos.z();
      commov += pos;
    }
    commov /= nLsqAtoms;
  }

  // move mov and ref to (0,0,0)
  for (i=0; i<nLsqAtoms; ++i) {
    refary[i*3] -= comref.x();
    refary[i*3+1] -= comref.y();
    refary[i*3+2] -= comref.z();

    movary[i*3] -= commov.x();
    movary[i*3+1] -= commov.y();
    movary[i*3+2] -= commov.z();
  }

  // perform NL-LSQ minimization

  // fvec is an initial estimate of square of diff (all zero)
  qlib::Array<double> fvec(0.0, nLsqCords);

  // 6 params (rot, tran) to optimize
  qlib::Array<double> parm(0.0, 6);

  RotEval eval;
  minpack::LMMinimizer mini(&eval, nLsqCords, 6);

  eval.setCrd(&refary, &movary);
  mini.minimize(parm, fvec);

  LQuat qua = LQuat::makeFromEuler(parm[0], parm[1], parm[2]);
  Matrix4D rotmat = Matrix4D::makeRotMat(qua);
  Vector4D prmsh(parm[3], parm[4], parm[5]);

  {
    const double sinhp = Vector4D( qua.Vx(), qua.Vy(), qua.Vz() ).length();
    const double coshp = qua.a();
    const double hp = ::atan2(sinhp, coshp);
    const double phi = hp * 2.0;
    LOG_DPRINTLN("Rotation: %f degree", qlib::toDegree(phi));
  }
  
  /*
  {
    Matrix3D rot3 = rotmat.getMatrix3D();
    rot3 = rot3.transpose();
    rot3.dump();
    const double e3 =  rot3.aij(1,1) + rot3.aij(2,2) + rot3.aij(3,3) + 1.0;
    if (e3>0.0) {
      const double phih = ::acos( sqrt(e3) * 0.5 );
      LOG_DPRINTLN("Rotation: %f degree", qlib::toDegree(phih*2.0));
    }
    else {
      LOG_DPRINTLN("Mat2Quat failed");
    }
  }
   */
  
  Matrix4D xfmat;
  xfmat = Matrix4D::makeTransMat(comref);
  xfmat = xfmat.mul(Matrix4D::makeTransMat(prmsh));
  xfmat = xfmat.mul(rotmat);
  xfmat = xfmat.mul(Matrix4D::makeTransMat(-commov));

  if (presmat==NULL) {
    // Matrix result is not requested
    // --> Directly reflect results to moveing mol
    pMovMol->xformByMat(xfmat);

    // broadcast modification event
    pMovMol->fireAtomsMoved();

  }
  else {
    /*
    Vector4D axis;
    double phi;
    //qua.toRotVec(axis, phi);
    Vector4D va = comref - commov;
     */
    *presmat = xfmat;
  }

  if (pdRMSD!=NULL) {
    // calc atom-positional RMSD from chi**2
    double chisq = mini.getChiSq();
    double rmsd = chisq/::sqrt(double(nLsqAtoms));
    *pdRMSD = rmsd;
  }

  if (pnFit!=NULL)
    *pnFit = nLsqAtoms;

  return true;
}

double MolAnlManager::calcRMSD(MolCoordPtr pRefMol, SelectionPtr pRefSel,
                               MolCoordPtr pMovMol, SelectionPtr pMovSel,
                               qlib::OutStream *pouts /*=NULL*/)
{
  molstr::MolArrayMap aref, amov;
  int i;

  // evaluate selection
  aref.setup(pRefMol, pRefSel);
  amov.setup(pMovMol, pMovSel);

  if (aref.size()!=amov.size()) {
    LString msg =
      LString::format("Reference mol(%s) nsel (%d) != Fitting mol(%s) nsel (%d)",
		      pRefMol->getName().c_str(), aref.size(),
		      pMovMol->getName().c_str(), amov.size());
    LOG_DPRINTLN("LsqFit> %s", msg.c_str());
    MB_THROW(qlib::IllegalArgumentException, msg);
    return -1.0;
  }

  // make fitting arrays
  int nLsqAtoms = aref.size();
  int nLsqCords = aref.size()*3;
  if (nLsqAtoms<=0) {
    LString msg = "Empty mol selection";
    LOG_DPRINTLN("LsqFit> %s", msg.c_str());
    MB_THROW(qlib::IllegalArgumentException, msg);
    return -1.0;
  }

  // setup an output stream for the RMS info file
  PrintStream *pPS = NULL;
  if (pouts!=NULL)
    pPS = MB_NEW PrintStream(*pouts);


  qlib::Array<double> difary(nLsqCords);
  {
    MolArrayMap::const_iterator iter_ref = aref.begin();
    MolArrayMap::const_iterator iter_mov = amov.begin();

    for (i=0;
	 iter_ref!=aref.end() && iter_mov!=amov.end();
	 ++iter_ref, ++iter_mov, ++i){
      Vector4D pos = iter_ref->first.pA->getPos();
      difary[i*3]   = pos.x();
      difary[i*3+1] = pos.y();
      difary[i*3+2] = pos.z();

      pos = iter_mov->first.pA->getPos();
      difary[i*3]   -= pos.x();
      difary[i*3+1] -= pos.y();
      difary[i*3+2] -= pos.z();

      // MB_DPRINTLN("%d: %f,%f,%f", i, fvec[i*3+0], fvec[i*3+1], fvec[i*3+2]);
      double distsq = SQR(difary[i*3+0]) + SQR(difary[i*3+1]) + SQR(difary[i*3+2]);
      LString msg =
        LString::format("ref %s %d  mov %s %d %f",
                        iter_ref->first.chain.c_str(), iter_ref->first.resid,
                        iter_mov->first.chain.c_str(), iter_mov->first.resid, ::sqrt(distsq));
      if (pPS!=NULL)
        pPS->println(msg);

      /*
      LString msg2 =
        LString::format("ref %s %d %s mov %s %d %s : %f",
                        iter_ref->first.chain.c_str(), iter_ref->first.resid, iter_ref->first.pA->toString().c_str(),
                        iter_mov->first.chain.c_str(), iter_mov->first.resid, iter_mov->first.pA->toString().c_str(),
			::sqrt(distsq));
      */
      //LOG_DPRINTLN(msg2);

    }

  }

  const double enorm = minpack::LMMinimizer::calcEnorm(difary);
  const double rmsd = enorm/::sqrt(double(nLsqAtoms));

  if (pPS!=NULL)
    pPS->formatln("Total RMSD %f", rmsd);

  if (pPS!=NULL)
    delete pPS;

  return rmsd;
}

double MolAnlManager::calcRMSDScr(MolCoordPtr pmol_ref, SelectionPtr psel_ref,
                                  MolCoordPtr pmol_mov, SelectionPtr psel_mov,
                                  const LString &fname)
{
  if (fname.isEmpty()) {
    return calcRMSD(pmol_ref, psel_ref, pmol_mov, psel_mov);
  }
  else {
    qlib::FileOutStream fos;
    fos.open(fname);
    double rval = calcRMSD(pmol_ref, psel_ref, pmol_mov, psel_mov, &fos);
    fos.close();
    return rval;
  }
}

