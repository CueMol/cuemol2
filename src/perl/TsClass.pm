##############################################################
#
# TypeScript wrapper class generation
#

package TsClass;

use File::Basename;
use File::Path 'mkpath';

use strict;
use Utils;
use Parser;

our $out_dir;

our $use_es6_mod = 0;
our $ts_nsname = "wrapper";

##########

sub genTsWrapper($)
{
  my $cls = shift;

  my $qifname = $cls->{"qifname"};
  my $qif_fname = $cls->{"file"};


  my ($in_base, $in_dir, $in_ext) = fileparse($qif_fname, '\.qif');
  $in_dir =  "" if ($in_dir eq "./");
  my $out_fname = "$in_dir${in_base}.ts";

  if ($out_dir) {
    $out_fname = "$out_dir/${in_base}.ts";
    if (!-d $out_dir) {
        # mkpath($out_dir) or die "Cannot create dir $out_dir: $!";
        mkpath($out_dir) or print("Cannot create dir $out_dir: $!\n");
    }
  }

  print("Output TS file: $out_fname\n");

  open(OUT, ">$out_fname") || die "$?:$!";
  set_building_file($out_fname);

  # my $ts_clsname = $ts_nsname."_".$qifname;

  print OUT "/////////////////////////////////////\n";
  print OUT "//\n";
  print OUT "// TypeScript wrapper class for $qifname\n";
  print OUT "//\n";
  print OUT "\n";

  my $base_class = "BaseWrapper";
  my $base_class_path = "../base_wrapper";
  if ($cls->{"extends"}) {
      my @extends = @{$cls->{"extends"}};
      if (@extends>1) {
          die "ts wrapper does not support multiple inheritance";
      }
      if ($extends[0]) {
          $base_class = $extends[0];
          $base_class_path = "./${base_class}";
      }
  }
  print OUT "\n";
  print OUT "import { ${base_class} } from '${base_class_path}';\n";
  print OUT "\n";

  print OUT "export class ${qifname} extends ${base_class} {\n";

  genTsSupclsCodeImpl($cls, $qifname);

  print OUT "\n";
  print OUT "}\n";
  print OUT "\n";
  # genTsImplData($ts_clsname, $qifname);
  print OUT "\n";

  close(OUT);
}
		   
sub genTsSupclsCodeImpl($$)
{
  my ($cls, $cls_name) = @_;

  # foreach my $i (@extends) {
  #   genTsSupclsCodeImpl($class_name, $i);
  # }

  print OUT "/////////////////////////////////////\n";
  print OUT "// Class $cls_name\n";
  print OUT "//\n";
  print OUT "\n";

  genTsPropCode($cls, $cls_name);
  genTsInvokeCode($cls, $cls_name);
}

sub genTsPropCode($$)
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
        genTsObjPropCode($clsname, $propnm, $prop);
    }
    elsif ($type eq "enum") {
        genTsEnumPropCode($clsname, $propnm, $prop);
    }
    else {
        genTsBasicPropCode($clsname, $propnm, $prop);
    }
  }
}

sub convToTsType($)
{
    my $typenm = shift;
    if ($typenm eq "void" ||
        $typenm eq "boolean" ||
        $typenm eq "string") {
        return $typenm;
    } elsif ($typenm eq "integer" ||
             $typenm eq "real") {
        return "number";
    } else {
        return "any";
    }
    # TODO: impl
    # $typenm eq "array" ||
    # $typenm eq "dict" ||
    # $typenm eq "enum") {
}

sub genTsBasicPropCode($$$)
{
  my $classnm = shift;
  my $propnm = shift;
  my $prop = shift;
  my $type = $prop->{"type"};

  my $tstype = convToTsType($type);

  print OUT "  get $propnm() : $tstype {\n";
  print OUT "    return this.getProp(\'$propnm\');\n";
  print OUT "  }\n";
  print OUT "\n";
      
  return if (contains($prop->{"options"}, "readonly"));

  print OUT "  set $propnm(arg0: $tstype) {\n";
  print OUT "    this.setProp(\'$propnm\', arg0);\n";
  print OUT "  }\n";
  print OUT "\n";
}

sub genTsObjPropCode($$$)
{
  my $classnm = shift;
  my $propnm = shift;
  my $prop = shift;
  # my $type = $prop->{"type"};
  my $propqif = $prop->{"qif"};
  my $ts_type = "any";

  print OUT "  get $propnm() : $ts_type {\n";
  print OUT "    const result = this.getProp(\'$propnm\');\n";
  print OUT "    return this.createWrapper(result);\n";
  print OUT "  }\n";
  print OUT "\n";
      
  return if (contains($prop->{"options"}, "readonly"));

  print OUT "  set $propnm(arg0: $ts_type) {\n";
  print OUT "    this.setProp(\'$propnm\', arg0.wrapped);\n";
  print OUT "  }\n";
  print OUT "\n";
}

sub genTsEnumPropCode($$$)
{
  my ($classnm, $propnm, $prop) = @_;
  genTsBasicPropCode($classnm, $propnm, $prop);
  defined($prop->{"enumdef"}) || die;

  # my %enums = %{ $prop->{"enumdef"} };
  # foreach my $defnm (sort keys %enums) {
  #   my $key = $propnm."_".uc($defnm);
  #   my $value = $enums{$defnm};
  #   print OUT "  get $key() : number {\n";
  #   print OUT "    return this.getEnumDef(\'$propnm\', \'$defnm\');\n";
  #   print OUT "  }\n";
  #   print OUT "\n";
  # }	  
}

#####################

sub genTsInvokeCode($$)
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
    my $ts_typename = convToTsType($rval_typename);
    print OUT "// method: $nm\n";
    print OUT "  ${nm}(".makeMthSignt($mth).") : $ts_typename {\n";
    if ($rval_typename ne "void") {
        print OUT "    const result = ";
    }
    else {
        print OUT "    ";
    }
    print OUT "this.invokeMethod(".makeMthArg($mth).");\n";

    if ($rval_typename eq "object") {
        print OUT "    return this.createWrapper(result);\n";
    }
    elsif ($rval_typename eq "void") {
      # No return code
    }
    # elsif ($rval_typename eq "enum") {
    # }
    else {
      # basic types
      print OUT "  return result;\n";
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
      my $arg_type = convToTsType($arg->{"type"});
      push(@rval, "arg_$ind: $arg_type");
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

sub genTsImplData($$)
{
  my ($class_name, $supcls_name) = @_;
  my $supcls = $Parser::db{$supcls_name};

  my @extends = @{$supcls->{"extends"}} if ($supcls->{"extends"});
  foreach my $i (@extends) {
      genTsImplData($class_name, $i);
  }

  my $clskey = "\@implements_$supcls_name";
  print OUT "(${class_name}.prototype as any)[\'$clskey\'] = \'yes\';\n";
}

1;
