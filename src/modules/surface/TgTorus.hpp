// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: TgTorus.hpp,v 1.1 2011/02/11 06:55:18 rishitani Exp $

#ifndef TG_TORUS_HPP_INCLUDED__
#define TG_TORUS_HPP_INCLUDED__

namespace gfx {
  class DisplayContext;
}

namespace surface {

  using gfx::DisplayContext;

  class SESTgBuilder;
  class RSEdge;

  class TgTorus
  {
  public:
    SESTgBuilder *m_pParent;

    const RSEdge *m_pEdge;

    double m_dden;

    DisplayContext *m_pdl;

  public:
    TgTorus(SESTgBuilder *pprnt, const RSEdge *pEdge, double dden);

    ~TgTorus() {}

    void calc();

  private:
    int calcTessLev(double theta, double rad, double density);
    void calcRadSngl();

    void calcRadSnglArc();
  };

}

#endif

