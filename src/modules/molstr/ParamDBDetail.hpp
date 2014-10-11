
namespace molstr {

  namespace param {

    using qlib::LString;

    ///////
    // BOND

    struct BondTag {
      LString atomi;
      LString atomj;
    };

    struct BondVal {
      double kf;
      double r0;
    };

    struct less_bond 
      : std::binary_function <BondTag, BondTag, bool>
    {
  
      bool operator() (const BondTag &x,
		       const BondTag &y) const
      {
        int i = x.atomi.compare(y.atomi);
	if (i<0)
	  return true;
        else if (i>0)
	  return false;
    
	// x.atomi==y.atomi
        int j = x.atomj.compare(y.atomj);
        if (j<0)
	  return true;
        //else if (j>0)
	//return false;
    
	// x.atomi==y.atomi && x.atomj==y.atomj
	return false;
      }
    };

    typedef std::map<BondTag, BondVal, less_bond> BondDict;

    ////////
    // ANGLE

    struct AnglTag {
      LString atomi;
      LString atomj;
      LString atomk;
    };

    struct AnglVal {
      double kf;
      double r0;
    };

    struct angl_less_tag 
      : std::binary_function <AnglTag, AnglTag, bool>
    {
  
      bool operator() (const AnglTag &x,
		       const AnglTag &y) const
      {
        int i = x.atomi.compare(y.atomi);
	if (i<0)
	  return true;
	else if (i>0)
	  return false;
    
	// x.atomi==y.atomi
        int j = x.atomj.compare(y.atomj);
        if (j<0)
	  return true;
        else if (j>0)
	  return false;
    
	// x.atomi==y.atomi && x.atomj==y.atomj
        int k = x.atomk.compare(y.atomk);
        if (k<0)
	  return true;
        //else if (k>0)
	//return false;
    
	// x.atomi==y.atomi && x.atomj==y.atomj
	//   && x.atomk==y.atomk
	return false;
      }
    };

    typedef std::map<AnglTag, AnglVal, angl_less_tag> AnglDict;

    //////////////////////////////////////////////////////////
    // DIHEDRAL/IMPROPER

    struct DiheTag {
      LString atomi;
      LString atomj;
      LString atomk;
      LString atoml;
    };

    struct DiheVal {
      double kf;
      double pe;
      double del;
    };

    struct less_dihe 
      : std::binary_function <DiheTag, DiheTag, bool>
    {
  
      bool operator() (const DiheTag &x,
		       const DiheTag &y) const
      {
        int i = x.atomi.compare(y.atomi);
	if (i<0)
	  return true;
	else if (i>0)
	  return false;
    
	// x.atomi==y.atomi
        int j = x.atomj.compare(y.atomj);
        if (j<0)
	  return true;
	else if (j>0)
	  return false;
    
	// x.atomi==y.atomi && x.atomj==y.atomj
        int k = x.atomk.compare(y.atomk);
        if (k<0)
	  return true;
	else if (k>0)
	  return false;
    
	// x.atomi==y.atomi && x.atomj==y.atomj
	//   && x.atomk==y.atomk
        int l = x.atoml.compare(y.atoml);
        if (l<0)
	  return true;
        //else if (l>0)
	//return false;
    
	return false;
      }
    };

    typedef std::map<DiheTag, DiheVal, less_dihe> DiheDict;

    ////////////
    // Nonbonded

    struct NonbVal {
      double sig, eps, sig14, eps14;
    };

    typedef std::map<LString, NonbVal> NonbDict;

    ////////////
    // Atom

    struct AtomVal {
      LString elem;
      LString hbon;
      LString hybrid;

      double mass;
      double vdwr, vdwhr, ionr;
      int valency;

      AtomVal() : mass(-1.0), vdwr(-1.0), vdwhr(-1.0), ionr(-1.0), valency(-1) {}
    };

    typedef std::map<LString, AtomVal> AtomDict;
  }

}
