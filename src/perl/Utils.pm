######################################################################
# Utility/Debug subroutines

package Utils;

use File::Basename;
use Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(debug contains containsStarts uniquefy fmtType
             set_building_file clean_built_file
             getVarTypeName isIntrinsic isSmartPtr
             splitSmartPtr makeSmartPtrName
             isClsSmartPtr isQifSmartPtr isQifSingleton
             qif2CliClsName qif2CliClsName2 qif2WpClsName qif2IfName
             qifFname2CliHdrFname qifFname2WpHdrFname qifFname2WpSrcFname
             qif2CliHdrFname qif2WpHdrFname qif2WpSrcFname
             );

my $debug=0;

#########

# Remove built files (for error termination)

my $building_file;

sub set_building_file($) {
    $building_file = shift;
}

sub clean_built_file() {
    if ($building_file) {
	unlink($building_file);
	$building_file = "";
    }
}

#########

sub contains($$) {
    my ($opts,$chk) = @_;
    my $i;
    
    foreach my $i (@{$opts}) {
	return 1 if ($i eq $chk);
    }
    return 0;
}

sub containsStarts($$) {
    my ($opts,$chk) = @_;
    my $i;
    
    $chk = "^$chk";
    foreach my $i (@{$opts}) {
	return $i if ($i =~ /$chk/);
    }
    return 0;
}

sub uniquefy($) {
  my $ary = shift;
  my %tmph;
  
  foreach my $i (@{$ary}) {
    $tmph{$i} = 1;
  }

  @{$ary} = ();

  foreach my $i (sort keys %tmph) {
    push @{$ary}, $i;
  }

  # print "*************".join(",",@{$ary})."\n\n";
}

##########

sub format_uuid($) {
  my $uuid = shift;
  &debug("uuid $uuid\n");
  my @a = split(/-/, $uuid);
  my $x = $a[3].$a[4];
  my @b;
  for (my $i=0; $i<length($x); $i+=2) {
    push(@b, "0x".substr($x, $i, 2));
  }
  my $y = join(", ", @b);
  return "{ 0x$a[0], 0x$a[1], 0x$a[2], { $y }}";
}

###################################################################
# Debug

sub fmtType($) {
  my $rh = shift;
  if ($rh->{"type"} eq "object") {
    return "object<".$rh->{"qif"}.">";
  }
  else {
    return $rh->{"type"};
  }
}

sub setDebug($) {
  $debug = shift;
}

sub debug($) {
  print shift if ($debug);
}

sub dumpdb() {
  return if (!$debug);

  print "\n\nDUMP\n";
  foreach my $i (sort keys %db) {
    print "CLASS $i";
    print "\n";
    my $cls = $db{$i};
	
    print "\tdefined in: ".$cls->{"file"}."\n";
    print "\tdecl_hdr: ".$cls->{"decl_hdr"}."\n";
    print "\tcpp_name: ".$cls->{"cpp_name"}."\n";

    my @extends = @{$cls->{"extends"}};
    if ($#extends>=0) {
      print "\textends ".join(", ", @extends)."\n";
    }

    if ($cls->{"refers"}) {
	my @refers = @{$cls->{"refers"}};
	if ($#refers>=0) {
	    print "\trefers ".join(", ", @refers)."\n";
	}
    }

    my @opts = @{$cls->{"options"}};
    if ($#opts>=0) {
      print "\toptions ".join(", ", @opts)."\n";
    }

    ##

    my $href = $cls->{"properties"};
    foreach my $j (sort keys %{$href}) {
      print "\tprops $j=>(type=".$href->{$j}->{"type"};
      if ($href->{$j}->{"type"} eq "object") {
	print "<".($href->{$j}->{"ptr"}?"ptr":"nonptr");
	print " ".$href->{$j}->{"nq_cpptype"}.">";
      }
      print " cppname=".$href->{$j}->{"cppname"}.")";

      if ($href->{$j}->{"options"}) {
        my @prop_opts = @{$href->{$j}->{"options"}};
        if ($#prop_opts>=0) {
          print ", options ".join(", ", @prop_opts)."\n";
        } else {
          print "\n";
        }
      }else {
        print "\n";
      }
    }
	
    ##
	
    $href = $cls->{"methods"};
    foreach my $j (sort keys %{$href}) {
      print "\tMethod $j=>".fmtType($href->{$j}->{"rettype"})." ";
      print $href->{$j}->{"cppname"};
      my @arguments = @{$href->{$j}->{"args"}};
      # print ", options $prop_opts \n";
      print "(";
      foreach my $i (@arguments) {
	print fmtType($i);
	print " ";
      }
      print ")\n";
    }
	
    ##
	
    $href = $cls->{"enums"};
    foreach my $j (sort keys %{$href}) {
	print "\tEnum prop $j => (\n";
	my $defs = $href->{$j};
	foreach my $i (keys(%$defs)) {
	    print "\t\t$i => $defs->{$i}\n";
	}
	print "\t)\n";
    }
    print "---\n";
  }
}

############################################################
# Name Conversion Subroutines

sub getVarTypeName($) {
  my $typenm = shift;

  if ($typenm eq "boolean") {
    return "Bool";
  } elsif ($typenm eq "integer" || $typenm eq "enum") {
    return "Int";
  } elsif ($typenm eq "real") {
    return "Real";
  } elsif ($typenm eq "string") {
    return "String";
  } elsif ($typenm eq "array") {
    return "Array";
  } elsif ($typenm eq "list") {
    return "List";
  } elsif ($typenm eq "dict") {
    return "Dict";
  } elsif ($typenm eq "void") {
    return "Void";
  }

  return "Object";
}

sub isIntrinsic($) {
    my $typenm = shift;
    if ($typenm eq "boolean") {
	return 1;
    } elsif ($typenm eq "integer") {
	return 1;
    } elsif ($typenm eq "real") {
	return 1;
    } elsif ($typenm eq "string") {
	return 1;
    } elsif ($typenm eq "enum") {
	return 1;
    } elsif ($typenm eq "array") {
	return 1;
    } elsif ($typenm eq "list") {
	return 1;
    } elsif ($typenm eq "dict") {
	return 1;
    }
    return 0;
}

# check if the C++ typename is smart pointer
sub isSmartPtr($) {
  my $typenm = shift;
  return 1 if ($typenm =~ /LScrSp\<[\w\:]+\>/);
  return 0;
}

# make original C++ class name from C++ smartptr name
sub splitSmartPtr($) {
  my $typenm = shift;
  if ($typenm =~ /LScrSp\<([\w\:]+)\>/) {
    return $1;
  }
  die "cannot split smartptr name: $typenm";
}

# make C++ smart pointer type from C++ type
sub makeSmartPtrName($) {
  my $typenm = shift;
  return "qlib::LScrSp<$typenm> ";
}

sub isClsSmartPtr($) {
  my $cls = shift;
  my $ropts = $cls->{"options"};
  return 1 if (contains($ropts, "smartptr"));
  return 0;
}

# check if the QIF name supports smart pointer
sub isQifSmartPtr($) {
  my $qif = shift;
  return isClsSmartPtr($Parser::db{$qif});
}

# check if the QIF name is singleton service
sub isQifSingleton($) {
  my $qif = shift;
  my $ropts = $Parser::db{$qif}->{"options"};
  return 1 if (contains($ropts, "singleton"));
  return 0;
}


#########################
# QIF name to Class Names

sub qif2CliClsName($) {
  my $qif = shift;
  my $udef = $Parser::db{$qif}->{"cpp_name"};
  return $udef if ($udef);
  return $qif;
}

sub qif2CliClsName2($) {
  my $qif = shift;
  my $cls = qif2CliClsName($qif);

  if (isQifSmartPtr($qif)) {
    return "qlib::LScrSp<$cls>";
  }
  return $cls;
}

sub qif2WpClsName($) {
  my $qif = shift;
  return $qif."_wrap";

  # my $udef = $Parser::db{$qif}->{"cpp_wpname"};
  # return $udef if ($udef);
}

sub qif2IfName($) {
  my $qif = shift;
  return "qI$qif";

  # my $udef = $Parser::db{$qif}->{"interface"};
  # return $udef if ($udef);
}

#####
# QIF File name to other File Names

# Output directory (if specified by cmdargs)
our $out_dir = "";

sub qifFname2CliHdrFname($) {
  my $file = shift;
  my ($in_base, $in_dir, $in_ext) = fileparse($file, '\.qif');
  $in_dir =  "" if ($in_dir eq "./");
  return "$in_dir${in_base}.hpp";
}

sub qifFname2WpHdrFname($) {
  my $file = shift;
  my ($base, $dir, $ext) = fileparse($file, '\.qif');
  $dir =  "" if ($dir eq "./");
  $dir = $out_dir."/" if ($out_dir ne "");
  return "$dir${base}_wrap.hpp";
}

sub qifFname2WpSrcFname($) {
  my $file = shift;
  my ($base, $dir, $ext) = fileparse($file, '\.qif');
  $dir =  "" if ($dir eq "./");
  $dir = $out_dir."/" if ($out_dir ne "");
  return "$dir${base}_wrap.cpp";
}

####################
# QIF name to file names (use qifFname2XXX routines)

# sub getBaseDir($) {
#   my $qif = shift;
#   my $file = $Parser::db{$qif}->{"file"};
#   my ($in_base, $in_dir, $in_ext) = fileparse($file, '\.qif');
#   return "" if ($in_dir eq "./");
#   return $in_dir;
# }

sub qif2CliHdrFname($) {
  my $qif = shift;
  my $udef = $Parser::db{$qif}->{"decl_hdr"};
  if ($udef) {
      my $src_fname = $Parser::db{$qif}->{"file"};
      my ($base, $dir, $ext) = fileparse($src_fname, '\.qif');
      if ($out_dir ne "") {
          # case of out-of-src build
          $udef = "$dir/$udef";
      }
      return $udef;
  }

  return qifFname2CliHdrFname($Parser::db{$qif}->{"file"});
}

sub qif2WpHdrFname($) {
  my $qif = shift;
  my $udef = $Parser::db{$qif}->{"wrapper_hdr"};
  return $udef if ($udef);

  if (!$Parser::db{$qif}->{"file"}) {
      clean_built_file();
      die("FATAL ERROR: Undefined QIF interface <$qif>\n");
  }
  debug "***** < $qif > <".$Parser::db{$qif}->{"file"}.">\n";
  return qifFname2WpHdrFname($Parser::db{$qif}->{"file"});
}

sub qif2WpSrcFname($) {
  my $qif = shift;
  return qifFname2WpSrcFname($Parser::db{$qif}->{"file"});
}


1;
