// -*-Mode: C++;-*-
//
// Momentum scrolling implementation class
//
//

#ifndef QSYS_MOMENTUM_SCROLL_HPP_INCLUDED__
#define QSYS_MOMENTUM_SCROLL_HPP_INCLUDED__

#include "qsys.hpp"
#include <boost/math/special_functions/fpclassify.hpp>

namespace qsys {

  class View;

  class MomentumScroll
  {
  private:
    View *m_pView;

    double m_inivx, m_inivy;

    bool m_bActive;

    int m_nType;

    Vector4D m_vIniCen;

  public:
    enum {
      MMS_NONE,
      MMS_TRANSXY,
      MMS_TRANSYX,
      MMS_ROTXY,
      MMS_ROTYX,
      MMS_SET_XYZ,
      MMS_SET_CAMERA
    };

  public:
    MomentumScroll(View *pPar) : m_pView(pPar)
    {
      m_inivx = m_inivy = 0.0;
      m_bActive = false;
      m_nType = MMS_NONE;
    }

    ~MomentumScroll()
    {
    }

    void setType(int ntype) {
      m_nType = ntype;
    }
    int getType() const {
      return m_nType;
    }

#define VMAX 10000.0

#define TRANSXY_MINVEL 500.0
#define ROTXY_MINVEL 500.0
#define ROTXY_SPINVEL_SCL 50.0

    LQuat m_qrot_start;
    LQuat m_qrot_end;
    Vector4D m_spinAxis;
    double m_spinIniVel;

    /// setup X-Y momentum scroll
    /// @returns: period of anim in millisec; 0 means no anim
    qlib::time_value setupXY(InDevEvent &ev)
    {
      qlib::VectorND<2,double> vel;
      vel.ai(1) = ev.getVeloX();
      vel.ai(2) = ev.getVeloY();

      double vlen = vel.length();
      
      MB_DPRINTLN("MMS vlen %f", vlen);
      if ( qlib::isNear4(vlen, 0.0) )
        return 0;

      if (vlen>VMAX) {
	// speed is too fast --> scale down to VMAX
        vel = vel.scale(VMAX/vlen);
	vlen = VMAX;
      }

      switch (m_nType) {
      default:
      case MMS_NONE: {
        MB_DPRINTLN("MMS not activated");
        m_bActive = false;
        return 0; // cancel scrolling
      }

      case MMS_TRANSXY: {
	if (vlen<TRANSXY_MINVEL) {
	  MB_DPRINTLN("MMS_TRANS vlen is too small %f", vlen);
	  m_bActive = false;
	  return 0;
	}

        MB_DPRINTLN("MMS TRANSXY start %f,%f", vel.ai(1), vel.ai(2));
        
        vel = vel.scale(0.5);
        m_inivx = vel.ai(1);
        m_inivy = vel.ai(2);
        m_vIniCen = m_pView->getViewCenter();
        
        m_bActive = true;
	return 500;
      }

      case MMS_ROTXY: {
	if (vlen<ROTXY_MINVEL) {
	  MB_DPRINTLN("MMS_ROT vlen is too small %f", vlen);
	  m_bActive = false;
	  return 0;
	}
        m_qrot_start = m_pView->getRotQuat();

        if (!boost::math::isfinite(m_qrot_start.sqlen())) {
          MB_DPRINTLN("invalid rotquat: %s", m_qrot_start.m_data.toString().c_str());
          return 0;
        }

        const double width = m_pView->getWidth();
        const double height = m_pView->getHeight();
        const double prex = ev.getX()/width;
        const double prey = ev.getY()/height;
        const double curx = prex + vel.ai(1)/width/100.0;
        const double cury = prey + vel.ai(2)/height/100.0;
        MB_DPRINTLN("MMS ROTXY start (%f,%f)->(%f,%f)", prex, prey, curx, cury);

        //m_pView->getTrackRotQuat(vel.ai(1)/width, vel.ai(2)/height, 0, 0,
	//m_spinAxis, m_spinIniVel);

	double dummy;
        m_pView->getTrackRotQuat(curx, cury, prex, prey,
                                 m_spinAxis, m_spinIniVel);
	m_spinIniVel *= ROTXY_SPINVEL_SCL;
	// m_spinIniVel = vlen /100.0 ;

        //m_spinAxis = Vector4D(0,0,1);
        //m_spinIniVel = M_PI;
        //m_qrot_end = m_qrot_start * LQuat( Vector4D(0,0,1), M_PI/2.0 );

        //MB_DPRINTLN("  axis=%s dphi=%f", m_spinAxis.toString().c_str(), m_spinIniVel);

        //MB_DPRINTLN("  vlen=%f", vlen);
        //MB_DPRINTLN("  inivel=%f", qlib::toDegree(m_spinIniVel));
        m_bActive = true;

	// maximum len is 2 sec
	double ti = qlib::min(vlen, 2000.0);
	
	return qlib::time_value(ti);
      }
      }
      
      return 0;
    }

    Vector4D m_vSetXYZDest;

    /// setup SetXYZ momentum scroll
    void setupSetXYZ(const Vector4D &dest)
    {
      setType(MMS_SET_XYZ);
      m_vIniCen = m_pView->getViewCenter();
      m_vSetXYZDest = dest-m_vIniCen;
      m_bActive = true;
    }

    Camera m_iniCam;
    Camera m_destCam;

    /// setup SetCamera momentum scroll
    void setupSetCamera(CameraPtr pDest)
    {
      setType(MMS_SET_CAMERA);
      m_iniCam = *( m_pView->getCamera().get() );
      m_destCam = *( pDest.get() );
      m_destCam.setSource("");
      m_bActive = true;
      MB_DPRINTLN("MMS> SetCam start Q=%s", m_iniCam.m_rotQuat.m_data.toString().c_str());
      MB_DPRINTLN("            end Q=%s", m_destCam.m_rotQuat.m_data.toString().c_str());
    }

    bool onTimer(double rho)
    {
      if (!m_bActive) {
        MB_DPRINTLN("MMS inactivated");
        return false;
      }

      switch (m_nType) {
      default:
      case MMS_NONE: {
        MB_DPRINTLN("MMS inactivated");
        m_bActive = false;
        return false; // end of scrolling
      }

      case MMS_TRANSXY: {
        const double curvx = rho * (2.0 - rho) * m_inivx * 0.5;
        const double curvy = rho * (2.0 - rho) * m_inivy * 0.5;
        
        MB_DPRINTLN("MMS trxy %f (%f,%f)", rho, curvx, curvy);
        Vector4D dvec;
        m_pView->convXYTrans(curvx, curvy, dvec);
        m_pView->setViewCenterDrag(m_vIniCen-dvec);
        
        break;
      }

      case MMS_ROTXY: {
        //const LQuat dqrot = LQuat(m_spinAxis, M_PI*0.01);
        //m_qrot_start = qnow;

        //LQuat qnow = LQuat::slerp(m_qrot_start, m_qrot_end, rho);

        //MB_DPRINTLN("MMS rxy %f (%f)", rho, m_spinIniVel*rho);

        //Vector4D spinAxis(0,0,1);
        //double spinIniVel = M_PI*0.5;

        LQuat qnow = m_qrot_start;
        LQuat dqrot = LQuat(m_spinAxis, rho * (2.0 - rho) * m_spinIniVel * 0.5);
        //dqrot.a() = -dqrot.a();
        qnow.mulSelf(dqrot);
        //qnow = qnow * dqrot.conj();
        //qnow.normalizeSelf();
        m_pView->setRotQuat(qnow);
        // MB_DPRINTLN("MMS rxy %f q=%s", rho, qnow.m_data.toString().c_str());
        break;
      }

      case MMS_SET_XYZ: {
	const double xi = getQuadricXform(rho);
        
        Vector4D dvec = m_vSetXYZDest.scale(xi);
        m_pView->setViewCenterDrag(m_vIniCen+dvec);
        break;
      }

      case MMS_SET_CAMERA: {
	const double xi = getQuadricXform(rho);

	// center
	Vector4D cen = m_iniCam.m_center.scale(1.0-xi) + m_destCam.m_center.scale(xi);
	
	// rotation
	LQuat qnow = LQuat::slerp(m_iniCam.m_rotQuat, m_destCam.m_rotQuat, xi);
	MB_DPRINTLN("MMS> Q=%s", qnow.m_data.toString().c_str());

	// zoom
	double znow = m_iniCam.getZoom()*(1.0-xi) + m_destCam.getZoom()*xi;

	// slab
        double snow = m_iniCam.getSlabDepth()*(1.0-xi) + m_destCam.getSlabDepth()*xi;

        m_pView->setViewCenterDrag(cen);
	m_pView->setRotQuat(qnow);
	m_pView->setZoom(znow);
	m_pView->setSlabDepth(snow);
      }

      }

      return true;
    }

    double getQuadricXform(double rho)
    {
      if (rho<0.5) {
	return 2.0*rho*rho;
      }
      const double invrho = 1.0-rho;
      return 1.0-2.0*invrho*invrho;
    }

    void cancel()
    {
      m_inivx = m_inivy = 0.0;
      m_bActive = false;
      m_nType = MMS_NONE;
      MB_DPRINTLN("MMS canceled");
    }

    bool isActive() const { return m_bActive; }

  };

}

#endif

