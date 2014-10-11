// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: SESTgBuilder.hpp,v 1.1 2011/02/11 06:55:18 rishitani Exp $

#ifndef SES_TG_BUILDER_HPP_INCLUDED__
#define SES_TG_BUILDER_HPP_INCLUDED__

#include "TgConcSphere.hpp"

namespace gfx {
  class DisplayContext;
}

namespace surface {

using gfx::DisplayContext;
class MolSurfBuilder;
class RSComponent;

class SESTgBuilder
{
public:
  double m_rprobe;
  double m_dden;
  DisplayContext *m_pdl;
  
public:
  MolSurfBuilder *m_pmsb;
  RSComponent *m_prscom;

public:
  SESTgBuilder(MolSurfBuilder *pmsb, RSComponent *prscom);

  ~SESTgBuilder();

  void build();

private:
  void toricFaces();
  void reentSphFaces();
  void convSphFaces();

};

}

#endif// SES_TG_BUILDER_HPP_INCLUDED__

