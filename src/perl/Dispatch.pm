###########################################################################
# Generate dispatch implementation for the wrapper class
#

package Dispatch;

use File::Basename;

use strict;
use Utils;
use Parser;

our $fhout;

###

sub mkGetFname($) { return "get_".$_[0];}
sub mkSetFname($) { return "set_".$_[0];}
sub mkMthFname($) { return "mth_".$_[0];}

sub mkPropSgnt($) {
  my $fname = shift;
  return "$fname(qlib::LVarArgs &vargs)";
}

sub mkMthSgnt($) {
  my $mth = shift;
  my $nm = $mth->{"name"};
  return "mth_$nm(qlib::LVarArgs &vargs)";
}

##############################

sub makeFakeGetterMth($$) {
  my $prop = shift;
  my $cxxname = shift;

  my @args = ();
  my $mth = {"name"=>$prop->{"name"},
	     "rettype"=>$prop,
	     "cppname"=>$cxxname,
	     "args"=>\@args};
  return $mth;
}

sub makeFakeSetterMth($$) {
  my $prop = shift;
  my $cxxname = shift;

  my $rt = {"type"=>"void"};

  my @args = ($prop);
  my $mth = {"name"=>$prop->{"name"},
	     "rettype"=>$rt,
	     "cppname"=>$cxxname,
	     "args"=>\@args};
  return $mth;
}


##########################################
#  C++ header file (declaration) generator

sub genPropDecl($) {
   my $cls = shift;

   return if (!$cls->{"properties"});

   my %props = %{$cls->{"properties"}};
   foreach my $propnm (sort keys %props) {
     my $prop = $props{$propnm};
     # next if (contains($prop->{"options"}, "persistent_only"));
     
     # getter
     print $fhout "  static bool ".mkPropSgnt(mkGetFname($propnm)).";\n";

     next if (contains($prop->{"options"}, "readonly"));

     # setter
     print $fhout "  static bool ".mkPropSgnt(mkSetFname($propnm)).";\n";
   }

  print $fhout "\n";
}

sub genInvokeDecl($) {
   my $cls = shift;

   return if (!$cls->{"methods"});

   my %mths = %{$cls->{"methods"}};
   foreach my $nm (sort keys %mths) {
     my $mth = $mths{$nm};
     print $fhout "  static bool ".mkMthSgnt($mth).";\n";
   }

   print $fhout "\n";
}

########################################################
#  C++ source file (implementation) generator

# convert type structure to C++ type name
sub genSrc_convToCxxType($) {
    my $type = shift;

    my $typename = $type->{"type"};
    my $qifname = $type->{"qif"};
    my $ptrflag = $type->{"ptr"};

    if (isIntrinsic($typename)) {
	# return "wrapper::$typename";
	return "qlib::L".getVarTypeName($typename);
    }

    if ($typename eq "object") {
	my $cxxname = qif2CliClsName($qifname);
	if ($ptrflag==0) {
	    # # To value (const reference)
	    # return "const $cxxname &";

	    # To value
	    return "$cxxname ";
	}
	if ($ptrflag==1) {
	    # To Ptr
	    # return "$cxxname *";
	    die "Pointer passing is not supported.";
	}
	if ($ptrflag==2) {
	    # To SmartPtr
	    return "qlib::LScrSp< $cxxname >";
	}
    }
    # error
    die;
}

# make variant's C++ getter method name from type structure
sub makeVariantGetterMethod($) {
    my $type = shift;

    my $typename = $type->{"type"};
    my $qifname = $type->{"qif"};
    my $ptrflag = $type->{"ptr"};

    if ($typename eq "enum") {
	return "EnumInt";
    }

    if (isIntrinsic($typename)) {
	# this just capitalize the typename
	my $tmp = getVarTypeName($typename);
	return "${tmp}Value";
    }

    if ($typename eq "object") {
	my $cxxname = qif2CliClsName($qifname);
	if ($ptrflag==0) {
	    # To value (const reference)
	    return "ObjectRefT< $cxxname >";
	}
	if ($ptrflag==1) {
	    # To Ptr
	    # return "ObjectPtrT< $cxxname >";
	    die "Pointer passing is not supported.";
	}
	if ($ptrflag==2) {
	    # To SmartPtr
	    return "SPtrValueT< $cxxname >";
	}
    }

    # error
    die("Internal ERROR: unknown type name $typename\n");
}

# generate code for converting LVarArgs to C++ arguments
sub genLVarToCxxConv($$)
{
    my ($cls, $mth) = @_;

    my $qif = $cls->{"qifname"};
    my $args = $mth->{"args"};
    my $nargs = int(@{$args});
    my $argsnm = "vargs";

    print $fhout "  ${argsnm}.checkArgSize($nargs);\n";
    print $fhout "  \n";
    print $fhout "  client_t* pthis = ${argsnm}.getThisPtr<client_t>();\n";
    print $fhout "  \n";

    my $ind=0;
    foreach my $arg (@{$args}) {
	my $cxxtype = genSrc_convToCxxType($arg);
	my $vrnt_mth = makeVariantGetterMethod($arg);
	
	if ($arg->{"type"} eq "enum") {
	    my $cxx_wp_clsname = qif2WpClsName($qif);
	    $vrnt_mth = "$vrnt_mth<$cxx_wp_clsname>";
	}

	print $fhout "  $cxxtype arg$ind;\n";
	print $fhout "  convTo${vrnt_mth}(arg$ind, ${argsnm}.get($ind), \"".$arg->{"name"}."\");\n";

	++$ind;
    }
}

##########

# generate common invocation body code
sub genInvokeBody($$) {
  my ($cls, $mth) = @_;

  my $qif = $cls->{"qifname"};
  my @args = @{$mth->{"args"}};
  my $nargs = int(@args);
  my $cxxnm = $mth->{"cppname"};
  my $rettype = $mth->{"rettype"};
  my $thisnm = "pthis";

  # arguments
  my $ind=0;
  my @tmp;

  foreach my $arg (@args) {
    push(@tmp, "arg$ind");
    ++$ind;
  }
  my $strargs = join(", ", @tmp);

  # invocation & return value
  my $rval_typename = $rettype->{"type"};

  if ($rval_typename eq "void") {
      print $fhout "\n";
      print $fhout "  ${thisnm}->${cxxnm}($strargs);\n";
      print $fhout "\n";
      print $fhout "  vargs.setRetVoid();\n";
      return;
  }
  else {
      my $vrnt_mth = makeVariantGetterMethod($rettype);
      my $prop_name = $rettype->{"name"};

      if ($rettype->{"type"} eq "enum") {
	  my $cxx_wp_clsname = qif2WpClsName($qif);
	  $vrnt_mth = "$vrnt_mth<$cxx_wp_clsname>";
      }

      # Right-hand side
      my $rhs = "${thisnm}->${cxxnm}($strargs)";

      print $fhout "  LVariant &rval = vargs.retval();\n";
      print $fhout "\n";
      # print $fhout "  rval.set${vrnt_mth}( ${thisnm}->${cxxnm}($strargs) );\n";
      print $fhout "  setBy${vrnt_mth}( rval, $rhs, \"$prop_name\" );\n";
      print $fhout "\n";

      return;
  }

}

##########

sub genInvokeCode($) {
  my $cls = shift;

  my $qifname = $cls->{"qifname"};
  my $cpp_wp_clsname = qif2WpClsName($qifname);

  return unless ($cls->{"methods"});

  my %mths = %{$cls->{"methods"}};
  foreach my $nm (sort keys %mths) {
    my $mth = $mths{$nm};

    print $fhout "\n";
    print $fhout "// method invocation impl for $nm\n";
    print $fhout "\n";
    print $fhout "//static\n";
    print $fhout "bool $cpp_wp_clsname\::".mkMthSgnt($mth)."\n";
    print $fhout "{\n";
    genLVarToCxxConv($cls, $mth);
    genInvokeBody($cls, $mth);
    print $fhout "  return true;\n";
    print $fhout "}\n";
  }
}

##################################################
# Generate getter/setter implementation code
sub genGetSetImpl($$$) {
  my ($cls, $prop, $flag) = @_;

  my $thisnm = "pthis";
  my $mth;

  # Redirection (1)
  if (contains($prop->{"options"}, "redirect")) {
      if ($flag eq "get") {
	  $mth = makeFakeGetterMth($prop, "get_".$prop->{"cppname"});
      }
      elsif ($flag eq "set") {
	  $mth = makeFakeSetterMth($prop, "set_".$prop->{"cppname"});
      }
      genInvokeBody($cls, $mth);
      return;
  }

  # Redirection (2)
  if (my $trg = containsStarts($prop->{"options"}, "redirect_")) {
    if ($trg =~ /redirect_(\w+)_(\w+)/) {
      my $getnm = $1;
      my $setnm = $2;
      
      if ($flag eq "get") {
	  $mth = makeFakeGetterMth($prop, $getnm);
      }
      elsif ($flag eq "set") {
	  $mth = makeFakeSetterMth($prop, $setnm);
      }
      genInvokeBody($cls, $mth);
      return;
    }
  }

  # Direct conversion

  my $cxxnm = $prop->{"cppname"};
  my $rval_typename = $prop->{"type"};

  my $vrnt_mth = makeVariantGetterMethod($prop);
  
  if ($prop->{"type"} eq "enum") {
      my $qif = $cls->{"qifname"};
      my $cxx_wp_clsname = qif2WpClsName($qif);
      $vrnt_mth = "$vrnt_mth<$cxx_wp_clsname>";
  }

  if ($flag eq "get") {
      # Right-hand side
      my $rhs = "${thisnm}->${cxxnm}";
      my $prop_name = $prop->{"name"};

      print $fhout "\n";
      print $fhout "  LVariant &rval = vargs.retval();\n";
      print $fhout "\n";
      # print $fhout "  rval.set${vrnt_mth}( ${thisnm}->${cxxnm} );\n";
      print $fhout "  setBy${vrnt_mth}( rval, $rhs, \"$prop_name\" );\n";
      print $fhout "\n";
  }
  elsif ($flag eq "set") {
      print $fhout "\n";
      print $fhout "  ${thisnm}->${cxxnm} = arg0;\n";
      print $fhout "\n";
  }

  return;
}

sub genPropertyCode($) {
  my $cls = shift;

  my $qifname = $cls->{"qifname"};
  my $cpp_wp_clsname = qif2WpClsName($qifname);

  return unless ($cls->{"properties"});
  
  my %props = %{$cls->{"properties"}};
  my $mth;
  foreach my $propnm (sort keys %props) {
    my $prop = $props{$propnm};
    my $typenm = $prop->{"type"};
    my $is_ptr = $prop->{"ptr"};
    my $qiftype = $prop->{"qif"};
    my $cppnm = $prop->{"cppname"};

    my $tid = &getVarTypeName($typenm);
    
    my $getter_name = mkGetFname($propnm);
    my $setter_name = mkSetFname($propnm);
    
    print $fhout "\n";
    print $fhout "// property handling impl for $propnm ($typenm $cppnm)\n";
    print $fhout "\n";

    # Getter
    $mth = makeFakeGetterMth($prop, "*");
    print $fhout "//static\n";
    print $fhout "bool $cpp_wp_clsname\::".mkPropSgnt($getter_name)."\n";
    print $fhout "{\n";

    genLVarToCxxConv($cls, $mth);
    genGetSetImpl($cls, $prop, "get");

    print $fhout "  return true;\n";
    print $fhout "}\n";

    # Setter
    next if (contains($prop->{"options"}, "readonly"));
    $mth = makeFakeSetterMth($prop, "dset_$propnm");
    print $fhout "//static\n";
    print $fhout "bool $cpp_wp_clsname\::".mkPropSgnt($setter_name)."\n";
    print $fhout "{\n";

    genLVarToCxxConv($cls, $mth);
    genGetSetImpl($cls, $prop, "set");

    print $fhout "  return true;\n";
    print $fhout "}\n";

  }
}

##################################################
# generate registration code

sub genRegFuncCode($) {
  my $cls = shift;

  my $qifname = $cls->{"qifname"};
  my $cpp_wp_clsname = qif2WpClsName($qifname);

  # print $fhout "\n";
  # print $fhout "$cpp_wp_clsname\::funcmap_t *$cpp_wp_clsname\::m_pfuncmap;\n";
  print $fhout "\n";

  my @extends;
  @extends = @{$cls->{"extends_wrapper"}} if ($cls->{"extends_wrapper"});
  
  print $fhout "// static\n";
  print $fhout "void $cpp_wp_clsname\::funcReg(qlib::FuncMap *pmap)\n";
  print $fhout "{\n";

  # Class name tag
  my $class_key = "\@implement_".$qifname;
  print $fhout "  pmap->putPropAttr(\"$class_key\", \"yes\");\n";
  print $fhout "\n";

  if ($cls->{"properties"}) {
    my %props = %{$cls->{"properties"}};
    foreach my $propnm (sort keys %props) {
      my $rprop = $props{$propnm};
      my $rprop_opts = $rprop->{"options"};
      my $getter_name = mkGetFname($propnm);
      my $setter_name = mkSetFname($propnm);
      my $proptype = &fmtType($rprop);

      print $fhout "  if (! pmap->hasProp(\"$propnm\") ) {\n";

      # attribute (typename)
      print $fhout "    pmap->putPropAttr(\"$propnm\", \"$proptype\");\n";

      # attribute (nopersist)
      if (contains($rprop_opts, "nopersist")) {
        print $fhout "    pmap->putPropAttr(\"@".$propnm."_nopersist\", \"yes\");\n";
      }

      # getter
      print $fhout "    pmap->putFunc(\"$getter_name\", &$cpp_wp_clsname\::$getter_name);\n";

      if (!contains($rprop_opts, "readonly")) {
        # setter
        print $fhout "    pmap->putFunc(\"$setter_name\", &$cpp_wp_clsname\::$setter_name);\n";
      }
      
      print $fhout "  }\n"; #  // if (defined)
    }
  }
  
  if ($cls->{"methods"}) {
    my %mths = %{$cls->{"methods"}};
    foreach my $nm (sort keys %mths) {
      my $mth_name = "mth_$nm";
      print $fhout "  pmap->putFunc(\"$mth_name\", &$cpp_wp_clsname\::$mth_name);\n";
    }
  }

  if ($cls->{"enums"}) {
      my %enumdefs = %{$cls->{"enums"}};
      foreach my $propnm (sort keys %enumdefs) {
	  print $fhout "  // Enum def for $propnm\n";

	  my %enums = %{ $enumdefs{$propnm} };
	  foreach my $defnm (sort keys %enums) {
	      my $value = $enums{$defnm};
	      print $fhout "  pmap->putEnumDef(\"$propnm\", \"$defnm\", $value);\n";

	  }	  
      }
  }

  print $fhout "\n";

  # generate code for importing super classes
  foreach my $i (@extends) {
    print $fhout "  ::${i}_funcReg(pmap);\n";
  }

  print $fhout "\n";

  # Default value
  if ($cls->{"properties"}) {
    my %props = %{$cls->{"properties"}};
    foreach my $propnm (sort keys %props) {
      my $rprop = $props{$propnm};
      my $rprop_opts = $rprop->{"options"};

      if (defined($rprop->{"default"}) &&
          !contains($rprop_opts, "readonly")) {

          my $cxxdefault = $rprop->{"default"};
          my $vrnt_mth = makeVariantGetterMethod($rprop);
	  print $fhout "  {\n";
	  print $fhout "    qlib::LVariant defval;\n";
	  # print $fhout "    defval.set${mthnm}($cxxdefault);\n";
	  print $fhout "    setBy${vrnt_mth}( defval, $cxxdefault, \"$propnm\" );\n";
	  print $fhout "    pmap->putDefVal(\"$propnm\", defval);\n";
          print $fhout "  }\n";

      }
  }
  }

  print $fhout "}\n";
  print $fhout "\n";

  my $modifier = $cls->{"dllexport"};
  print $fhout "\n";
  print $fhout "void ${cpp_wp_clsname}_funcReg(qlib::FuncMap *pmap)\n";
  print $fhout "{\n";
  print $fhout "    ${cpp_wp_clsname}::funcReg(pmap);\n";
  print $fhout "}\n";
}

1;

