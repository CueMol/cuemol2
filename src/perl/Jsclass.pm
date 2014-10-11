##############################################################
#
# Javascript wrapper class generation
#

package Jsclass;

use File::Basename;

use strict;
use Utils;
use Parser;

our $out_dir;

our $js_nsname = "wrapper";

##########

sub genJsWrapper($)
{
  my $cls = shift;

  my $qifname = $cls->{"qifname"};
  my $qif_fname = $cls->{"file"};


  my ($in_base, $in_dir, $in_ext) = fileparse($qif_fname, '\.qif');
  $in_dir =  "" if ($in_dir eq "./");
  my $out_fname = "$in_dir${in_base}.js";

  if ($out_dir) {
    $out_fname = "$out_dir/${in_base}.js";
  }

  print("Output JS file: $out_fname\n");

  open(OUT, ">$out_fname") || die "$?:$!";
  set_building_file($out_fname);

  my $js_clsname = $js_nsname."_".$qifname;

  print OUT "/////////////////////////////////////\n";
  print OUT "//\n";
  print OUT "// Javascript wrapper class for $qifname\n";
  print OUT "//\n";
  print OUT "\n";
  print OUT "var EXPORTED_SYMBOLS = [\"${js_clsname}\"];\n";
  print OUT "\n";
  print OUT "${js_clsname} = function ${qifname}_ctor(aWrapped, aCueMol)\n";
  print OUT "{\n";
  print OUT "  this._wrapped = aWrapped;\n";
  print OUT "  this._cuemol = aCueMol;\n";
#  print OUT "  if (arguments.length>0) {\n";
#  print OUT "    this._wrapped = arguments[0];\n";
#  print OUT "  }\n";
#  print OUT "  else {\n";
#  print OUT "    this._wrapped = utils.createObj(\"${qifname}\");\n";
#  print OUT "  }\n";
  print OUT "}\n";
  print OUT "\n";

  genJsSupclsCodeImpl($js_clsname, $qifname);

  close(OUT);
}
		   
sub genJsSupclsCodeImpl($$)
{
  my ($class_name, $supcls_name) = @_;
  my $supcls = $Parser::db{$supcls_name};

  my @extends = @{$supcls->{"extends"}} if ($supcls->{"extends"});
  foreach my $i (@extends) {
    genJsSupclsCodeImpl($class_name, $i);
  }

  print OUT "/////////////////////////////////////\n";
  print OUT "// Class $supcls_name\n";
  print OUT "//\n";
  print OUT "\n";

  my $clskey = "\@implements_$supcls_name";
  print OUT "${class_name}[\"$clskey\"] = \"yes\";\n\n";

  genJsPropCode($supcls, $class_name);
  genJsInvokeCode($supcls, $class_name);
}

sub genJsPropCode($$)
{
  my $cls = shift;
  my $clsname = shift;

  return unless ($cls->{"properties"});

  my %props = %{$cls->{"properties"}};

  foreach my $propnm (sort keys %props) {

    my $prop = $props{$propnm};
    my $type = $prop->{"type"};
    # debug("JS: prop: $propnm, type: $type\n");
    print OUT "// property: $propnm, type: $type\n";

    if ($type eq "object") {
      genJsObjPropCode($clsname, $propnm, $prop);
    }
    elsif ($type eq "enum") {
      genJsEnumPropCode($clsname, $propnm, $prop);
    }
    else {
      genJsBasicPropCode($clsname, $propnm, $prop);
    }
  }
}

sub genJsBasicPropCode($$$)
{
  my $classnm = shift;
  my $propnm = shift;
  my $prop = shift;

  print OUT "${classnm}.prototype.__defineGetter__(\"$propnm\", function()\n";
  print OUT "{\n";
  print OUT "  return this._wrapped.getProp(\"$propnm\");\n";
  print OUT "});\n";
  print OUT "\n";
      
  return if (contains($prop->{"options"}, "readonly"));

  print OUT "${classnm}.prototype.__defineSetter__(\"$propnm\", function(arg0)\n";
  print OUT "{\n";
  print OUT "  this._wrapped.setProp(\"$propnm\", arg0);\n";
  print OUT "});\n";
  print OUT "\n";
}

sub genJsObjPropCode($$$)
{
  my $classnm = shift;
  my $propnm = shift;
  my $prop = shift;

  my $propqif = $prop->{"qif"};

  print OUT "${classnm}.prototype.__defineGetter__(\"$propnm\", function()\n";
  print OUT "{\n";
  print OUT "  return this._cuemol.utils.convPolymObj(this._wrapped.getProp(\"$propnm\"));\n";
  print OUT "});\n";
  print OUT "\n";
      
  return if (contains($prop->{"options"}, "readonly"));

  print OUT "${classnm}.prototype.__defineSetter__(\"$propnm\", function(arg0)\n";
  print OUT "{\n";
  print OUT "  this._wrapped.setProp(\"$propnm\", arg0._wrapped);\n";
  print OUT "});\n";
  print OUT "\n";
}

sub genJsEnumPropCode($$$)
{
  my ($classnm, $propnm, $prop) = @_;

  genJsBasicPropCode($classnm, $propnm, $prop);

  defined($prop->{"enumdef"}) || die;

  my %enums = %{ $prop->{"enumdef"} };
  foreach my $defnm (sort keys %enums) {
    my $key = $propnm."_".uc($defnm);
    my $value = $enums{$defnm};

    print OUT "\n";
    print OUT "${classnm}.prototype.__defineGetter__(\"$key\", function()\n";
    print OUT "{\n";
    print OUT "  return this._wrapped.getEnumDef(\"$propnm\", \"$defnm\");\n";
    print OUT "});\n";
    print OUT "\n";

  }	  

}

#####################

sub genJsInvokeCode($$)
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

    print OUT "// method: $nm\n";

    print OUT "${classnm}.prototype.${nm} = function(".makeMthSignt($mth).") {\n";

    if ($rval_typename ne "void") {
      print OUT "  var rval = ";
    }
    else {
      print OUT "  ";
    }
    
    if (checkCallbackReg($mth)) {
      print OUT "  this._wrapped.invokeWithCallback1(\"$nm\", arg_0)\n";
      print OUT "  return rval;\n";
      print OUT "};\n";
      print OUT "\n";
      next;
    }
    
    if ($nargs<6) {
      print OUT "this._wrapped.invoke${nargs}(".makeMthArg($mth).")\n";
    }
    else {
      print OUT "this._wrapped.invoke(".makeMthArg2($mth).")\n";
    }
    
    if ($rval_typename eq "object") {
      my $rettype_qif = $rettype->{"qif"};
      print OUT "  return this._cuemol.utils.convPolymObj(rval);\n";
    }
    elsif ($rval_typename eq "void") {
      # No return code
    }
    # elsif ($rval_typename eq "enum") {
    # }
    else {
      # basic types
      print OUT "  return rval;\n";
    }

    print OUT "};\n";
    print OUT "\n";
  }

  print OUT "\n";
}

sub makeMthSignt($)
{
  my $mth = shift;
  my $args = $mth->{"args"};

  my $ind = 0;
  my @rval;
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

  my @rval = ("\"$name\"");

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

sub makeMthArg2($)
{
  my $mth = shift;
  my $args = $mth->{"args"};
  my $name = $mth->{"name"};

  my @rval; # = ("\"$name\"");

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

  return "\"$name\"" . ", [" . join(", ", @rval) . "]";
}

sub checkCallbackReg($)
{
  my $mth = shift;
  my $args = $mth->{"args"};
  my $name = $mth->{"name"};

  return 0 if (!defined($args->[0]));
  my $arg = $args->[0];

  return 0 if ($arg->{"type"} ne "object");

  return 1 if ($arg->{"qif"} eq "LScrCallBack");
  return 0;
}

1;


