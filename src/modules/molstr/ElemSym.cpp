// -*-Mode: C++;-*-
//
//  Element symbols
//
//  $Id: ElemSym.cpp,v 1.2 2011/03/27 09:54:06 rishitani Exp $

#include <common.h>

#include "ElemSym.hpp"

qlib::HashTable<int> *molstr::ElemSym::m_pStr2ID;
std::vector<qlib::LString> *molstr::ElemSym::m_pID2Str;

using namespace molstr;
using qlib::LString;

void ElemSym::init()
{
  m_pStr2ID = MB_NEW qlib::HashTable<int>;
  m_pID2Str = MB_NEW std::vector<LString>(256);

  std::vector<LString> &i2s = *m_pID2Str;
//  i2s[UNK] = "UNK";
  i2s[H] = "H";
  i2s[He] = "He";
  i2s[Li] = "Li";
  i2s[Be] = "Be";
  i2s[B] = "B";
  i2s[C] = "C";
  i2s[N] = "N";
  i2s[O] = "O";
  i2s[F] = "F";
  i2s[Ne] = "Ne";

  i2s[Na] = "Na";
  i2s[Mg] = "Mg";
  i2s[Al] = "Al";
  i2s[Si] = "Si";
  i2s[P]  = "P";
  i2s[S]  = "S";
  i2s[Cl] = "Cl";
  i2s[Ar] = "Ar";

  i2s[K ] = "K";
  i2s[Ca] = "Ca";
  i2s[Sc] = "Sc";
  i2s[Ti] = "Ti";
  i2s[V ] = "V";
  i2s[Cr] = "Cr";
  i2s[Mn] = "Mn";
  i2s[Fe] = "Fe";
  i2s[Co] = "Co";
  i2s[Ni] = "Ni";
  i2s[Cu] = "Cu";
  i2s[Zn] = "Zn";
  i2s[Ga] = "Ga";
  i2s[Ge] = "Ge";
  i2s[As] = "As";
  i2s[Se] = "Se";
  i2s[Br] = "Br";
  i2s[Kr] = "Kr";

  i2s[Rb] = "Rb";
  i2s[Sr] = "Sr";
  i2s[Y ] = "Y";
  i2s[Zr] = "Zr";
  i2s[Nb] = "Nb";
  i2s[Mo] = "Mo";
  i2s[Tc] = "Tc";
  i2s[Ru] = "Ru";
  i2s[Rh] = "Rh";
  i2s[Pd] = "Pd";
  i2s[Ag] = "Ag";
  i2s[Cd] = "Cd";
  i2s[In] = "In";
  i2s[Sn] = "Sn";
  i2s[Sb] = "Sb";
  i2s[Te] = "Te";
  i2s[I ] = "I";
  i2s[Xe] = "Xe";

  i2s[Cs] = "Cs";
  i2s[Ba] = "Ba";
  i2s[La] = "La";
  i2s[Ce] = "Ce";
  i2s[Pr] = "Pr";
  i2s[Nd] = "Nd";
  i2s[Pm] = "Pm";
  i2s[Sm] = "Sm";
  i2s[Eu] = "Eu";
  i2s[Gd] = "Gd";
  i2s[Tb] = "Tb";
  i2s[Dy] = "Dy";
  i2s[Ho] = "Ho";
  i2s[Er] = "Er";
  i2s[Tm] = "Tm";
  i2s[Yb] = "Yb";
  i2s[Lu] = "Lu";
  i2s[Hf] = "Hf";
  i2s[Ta] = "Ta";
  i2s[W] = "W";
  i2s[Re] = "Re";
  i2s[Os] = "Os";
  i2s[Ir] = "Ir";
  i2s[Pt] = "Pt";
  i2s[Au] = "Au";
  i2s[Hg] = "Hg";
  i2s[Tl] = "Tl";
  i2s[Pb] = "Pb";
  i2s[Bi] = "Bi";
  i2s[Po] = "Po";
  i2s[At] = "At";
  i2s[Rn] = "Rn";

  i2s[Fr] = "Fr";
  i2s[Ra] = "Ra";
  i2s[Ac] = "Ac";
  i2s[Th] = "Th";
  i2s[Pa] = "Pa";
  i2s[U ] = "U";
  i2s[Np] = "Np";
  i2s[Pu] = "Pu";
  i2s[XX] = "Unknown";
  
  qlib::HashTable<int> &s2i = *m_pStr2ID;
  s2i.set("H",  H);
  s2i.set("HE", He);

  s2i.set("LI", Li);
  s2i.set("BE", Be);
  s2i.set("B",  B );
  s2i.set("C",  C );
  s2i.set("N",  N );
  s2i.set("O",  O );
  s2i.set("F",  F );
  s2i.set("NE", Ne);

  s2i.set("NA", Na);
  s2i.set("MG", Mg);
  s2i.set("AL", Al);
  s2i.set("SI", Si);
  s2i.set("P", P );
  s2i.set("S", S );
  s2i.set("CL", Cl);
  s2i.set("AR", Ar);
  s2i.set("K", K );
  s2i.set("CA", Ca);
  s2i.set("SC", Sc);
  s2i.set("TI", Ti);
  s2i.set("V", V );
  s2i.set("CR", Cr);
  s2i.set("MN", Mn);
  s2i.set("FE", Fe);
  s2i.set("CO", Co);
  s2i.set("NI", Ni);
  s2i.set("CU", Cu);
  s2i.set("ZN", Zn);
  s2i.set("GA", Ga);
  s2i.set("GE", Ge);
  s2i.set("AS", As);
  s2i.set("SE", Se);
  s2i.set("BR", Br);
  s2i.set("KR", Kr);
  s2i.set("RB", Rb);
  s2i.set("SR", Sr);
  s2i.set("Y", Y );
  s2i.set("ZR", Zr);
  s2i.set("NB", Nb);
  s2i.set("MO", Mo);
  s2i.set("TC", Tc);
  s2i.set("RU", Ru);
  s2i.set("RH", Rh);
  s2i.set("PD", Pd);
  s2i.set("AG", Ag);
  s2i.set("CD", Cd);
  s2i.set("IN", In);
  s2i.set("SN", Sn);
  s2i.set("SB", Sb);
  s2i.set("TE", Te);
  s2i.set("I", I );
  s2i.set("XE", Xe);
  s2i.set("CS", Cs);
  s2i.set("BA", Ba);
  s2i.set("LA", La);
  s2i.set("CE", Ce);
  s2i.set("PR", Pr);
  s2i.set("ND", Nd);
  s2i.set("PM", Pm);
  s2i.set("SM", Sm);
  s2i.set("EU", Eu);
  s2i.set("GD", Gd);
  s2i.set("TB", Tb);
  s2i.set("DY", Dy);
  s2i.set("HO", Ho);
  s2i.set("ER", Er);
  s2i.set("TM", Tm);
  s2i.set("YB", Yb);
  s2i.set("LU", Lu);
  s2i.set("HF", Hf);
  s2i.set("TA", Ta);
  s2i.set("W", W );
  s2i.set("RE", Re);
  s2i.set("OS", Os);
  s2i.set("IR", Ir);
  s2i.set("PT", Pt);
  s2i.set("AU", Au);
  s2i.set("HG", Hg);
  s2i.set("TL", Tl);
  s2i.set("PB", Pb);
  s2i.set("BI", Bi);
  s2i.set("PO", Po);
  s2i.set("AT", At);
  s2i.set("RN", Rn);

  s2i.set("FR", Fr);
  s2i.set("RA", Ra);
  s2i.set("AC", Ac);
  s2i.set("TH", Th);
  s2i.set("PA", Pa);
  s2i.set("U", U);
  s2i.set("NP", Np);
  s2i.set("PU", Pu);
}

void ElemSym::fini()
{
  delete m_pStr2ID;
  m_pStr2ID = NULL;
  delete m_pID2Str;
  m_pID2Str = NULL;
}


int ElemSym::str2SymID(const LString &str)
{
  LString ustr = str.toUpperCase();
  qlib::HashTable<int> &s2i = *m_pStr2ID;
  if (!s2i.containsKey(ustr))
    return XX;
  return s2i.get(ustr);
}

LString ElemSym::symID2Str(int id)
{
  if (id<H || id>XX)
    return "";
  
  std::vector<LString> &i2s = *m_pID2Str;
  return i2s[id];
}

