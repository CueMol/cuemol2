##############################################################
#
# Python wrapper class generation
#

package Pyclass;

use File::Basename;

use strict;
use Utils;
use Parser;

our $out_dir;

##########

sub genWrapper($)
{
  my $cls = shift;

  my $qifname = $cls->{"qifname"};
  my $qif_fname = $cls->{"file"};


  my ($in_base, $in_dir, $in_ext) = fileparse($qif_fname, '\.qif');
  $in_dir =  "" if ($in_dir eq "./");
  my $out_fname = "$in_dir${in_base}.py";

  if ($out_dir) {
    $out_fname = "$out_dir/${in_base}.py";
  }

  print("Output Python file: $out_fname\n");

  open(OUT, ">$out_fname") || die "$?:$!";
  set_building_file($out_fname);

  my $py_clsname = $qifname;

  print OUT "#\n";
  print OUT "# Python wrapper class for $qifname\n";
  print OUT "#\n";
  print OUT "\n";
  print OUT "import cuemol_internal as ci\n";
  print OUT "\n";
  print OUT "class ${py_clsname}:\n";
  print OUT "\n";
  print OUT "    def __init__(self, aWrapped):\n";
  print OUT "        self._wrapped = aWrapped\n";
  print OUT "\n";

  genSupclsCodeImpl($py_clsname, $qifname);

  close(OUT);
}
		   
sub genSupclsCodeImpl($$)
{
  my ($class_name, $supcls_name) = @_;
  my $supcls = $Parser::db{$supcls_name};

  my @extends = @{$supcls->{"extends"}} if ($supcls->{"extends"});
  foreach my $i (@extends) {
    genSupclsCodeImpl($class_name, $i);
  }

  print OUT "##### From class $supcls_name\n";
  print OUT "\n";

  my $clskey = "\@implements_$supcls_name";
  print OUT "#  ${class_name}[\"$clskey\"] = \"yes\";\n\n";

  genPropCode($supcls, $class_name);

  genInvokeCode($supcls, $class_name);
}

sub genPropCode($$)
{
  my $cls = shift;
  my $clsname = shift;

  return unless ($cls->{"properties"});

  my %props = %{$cls->{"properties"}};

  foreach my $propnm (sort keys %props) {

    my $prop = $props{$propnm};
    my $type = $prop->{"type"};
    # debug("JS: prop: $propnm, type: $type\n");

    print OUT "# property: $propnm, type: $type\n";
    print OUT "\n";

    if ($type eq "object") {
      genObjPropCode($clsname, $propnm, $prop);
    }
    elsif ($type eq "enum") {
      genEnumPropCode($clsname, $propnm, $prop);
    }
    else {
      genBasicPropCode($clsname, $propnm, $prop);
    }
  }
}

sub genBasicPropCode($$$)
{
  my $classnm = shift;
  my $propnm = shift;
  my $prop = shift;

  print OUT "    \@property\n";
  print OUT "    def $propnm(self):\n";
  print OUT "        return ci.getProp(self._wrapped, \"$propnm\")\n";
  print OUT "\n";

  return if (contains($prop->{"options"}, "readonly"));

  print OUT "    \@${propnm}.setter\n";
  print OUT "    def ${propnm}(self, aVal):\n";
  print OUT "        ci.setProp(self._wrapped, \"${propnm}\", aVal)\n";
  print OUT "\n";
}

sub genObjPropCode($$$)
{
  my $classnm = shift;
  my $propnm = shift;
  my $prop = shift;

  my $propqif = $prop->{"qif"};

  print OUT "    \@property\n";
  print OUT "    def $propnm(self):\n";
  print OUT "        return cuemol.createWrapper( ci.getProp(self._wrapped, \"$propnm\") )\n";
  print OUT "\n";

  return if (contains($prop->{"options"}, "readonly"));

  print OUT "    \@${propnm}.setter\n";
  print OUT "    def ${propnm}(self, aVal):\n";
  print OUT "        ci.setProp(self._wrapped, \"${propnm}\", aVal._wrapped)\n";
  print OUT "\n";

  # print OUT "${classnm}.prototype.__defineSetter__(\"$propnm\", function(arg0)\n";
  # print OUT "{\n";
  # print OUT "  this._wrapped.setProp(\"$propnm\", arg0._wrapped);\n";
  # print OUT "});\n";
  # print OUT "\n";
}

sub genEnumPropCode($$$)
{
  my ($classnm, $propnm, $prop) = @_;

  genBasicPropCode($classnm, $propnm, $prop);

  defined($prop->{"enumdef"}) || die;

  my %enums = %{ $prop->{"enumdef"} };
  foreach my $defnm (sort keys %enums) {
    my $key = $propnm."_".uc($defnm);
    my $value = $enums{$defnm};

    # print OUT "\n";
    # print OUT "${classnm}.prototype.__defineGetter__(\"$key\", function()\n";
    # print OUT "{\n";
    # print OUT "  return this._wrapped.getEnumDef(\"$propnm\", \"$defnm\");\n";
    # print OUT "});\n";
    # print OUT "\n";

  }	  
}

#####################

sub genInvokeCode($$)
{
  my $cls = shift;
  my $classnm = shift;

  return if (!$cls->{"methods"});

  my %mths = %{$cls->{"methods"}};

  foreach my $nm (sort keys %mths) {
    my $mth = $mths{$nm};
    my $nargs = int(@{$mth->{"args"}});

    my $rettype = $mth->{"rettype"};
    my $rval_typename = $rettype->{"type"};

    print OUT "# method: $nm\n";

    print OUT "    def ${nm}(".makeMthSignt($mth)."):\n";
    
    if ($rval_typename ne "void") {
      print OUT "        rval = ";
    }
    else {
      print OUT "        ";
    }
    
    print OUT "ci.invokeMethod(".makeMthArg($mth).")\n";
    
    if ($rval_typename eq "object") {
      my $rettype_qif = $rettype->{"qif"};
      print OUT "        return cuemol.createWrapper( rval )\n";
    }
    elsif ($rval_typename eq "void") {
      print OUT "        return\n";
    }
    # elsif ($rval_typename eq "enum") {
    # }
    else {
      # basic types
      print OUT "        return rval\n";
    }
    print OUT "\n";
  }

  print OUT "\n";
}

sub makeMthSignt($)
{
  my $mth = shift;
  my $args = $mth->{"args"};

  my $ind = 0;
  my @rval = ("self");
  foreach my $arg (@{$args}) {
    push(@rval, "arg_$ind");
    ++$ind;
  }
  return join(", ", @rval);
}

sub makeMthArg($)
{
  my $mth = shift;
  my $args = $mth->{"args"};
  my $name = $mth->{"name"};

  my @rval = ("self._wrapped", "\"$name\"");

  my $ind = 0;
  foreach my $arg (@{$args}) {
    my $arg_type = $arg->{"type"};
    if ($arg_type eq "object") {
      push(@rval, "arg_${ind}._wrapped");
    }
    else {
      push(@rval, "arg_$ind");
    }
    ++$ind;
  }
  return join(", ", @rval);
}

1;


