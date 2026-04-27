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

# Per-class generation state (reset in genTsWrapper)
our %imports;          # set of QIF names needing import { X } from './X'
our %emitted_imports;  # QIF names already imported (parent + self), skip these
our $cur_clsname;      # current class being generated (skip self-import)
our @body;             # buffered body lines (flushed after imports are known)

sub emit { push @body, $_[0]; }

##########

# Map a type-info hash to a TypeScript type string.
# Side effect: adds object QIF names to %imports (excluding self and LScrCallBack).
sub tsTypeOf($)
{
    my $tinfo = shift;
    my $type  = $tinfo->{"type"};
    my $qif   = $tinfo->{"qif"};

    if ($type eq "void" || $type eq "boolean" || $type eq "string") {
        return $type;
    } elsif ($type eq "integer" || $type eq "real") {
        return "number";
    } elsif ($type eq "enum") {
        return "number";
    } elsif ($type eq "array") {
        return "any[]";
    } elsif ($type eq "dict") {
        return "Record<string, any>";
    } elsif ($type eq "object") {
        return "any" unless defined($qif) && $qif ne "";
        # LScrCallBack is passed as a plain JS function, no wrapper needed
        return "Function" if $qif eq "LScrCallBack";
        # Avoid importing self or already-emitted classes
        $imports{$qif} = 1 unless exists $emitted_imports{$qif};
        return $qif;
    }
    return "any";
}

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
        mkpath($out_dir) or print("Cannot create dir $out_dir: $!\n");
    }
  }

  print("Output TS file: $out_fname\n");

  # Reset per-class generation state
  %imports = ();
  %emitted_imports = ();
  @body = ();
  $cur_clsname = $qifname;
  $emitted_imports{$qifname} = 1;  # never self-import

  my $base_class = "BaseWrapper";
  my $base_class_path = "../BaseWrapper";
  if ($cls->{"extends"}) {
      my @extends = @{$cls->{"extends"}};
      if (@extends>1) {
          die "ts wrapper does not support multiple inheritance";
      }
      if ($extends[0]) {
          $base_class = $extends[0];
          $base_class_path = "./${base_class}";
          $emitted_imports{$base_class} = 1;  # parent already imported below
      }
  }

  # Generate body (may populate %imports as a side effect)
  genTsSupclsCodeImpl($cls, $qifname);

  # Now write the file: header, imports, class body
  open(OUT, ">$out_fname") || die "$?:$!";
  set_building_file($out_fname);

  print OUT "/////////////////////////////////////\n";
  print OUT "//\n";
  print OUT "// TypeScript wrapper class for $qifname\n";
  print OUT "//\n";
  print OUT "\n";

  print OUT "import { ${base_class} } from '${base_class_path}';\n";
  foreach my $qif (sort keys %imports) {
      next if exists $emitted_imports{$qif};
      print OUT "import { ${qif} } from './${qif}';\n";
  }
  print OUT "\n";

  print OUT "export class ${qifname} extends ${base_class} {\n";
  print OUT @body;
  print OUT "\n";
  print OUT "}\n";
  print OUT "\n";
  print OUT "\n";

  close(OUT);
}

sub genTsSupclsCodeImpl($$)
{
  my ($cls, $cls_name) = @_;

  emit("/////////////////////////////////////\n");
  emit("// Class $cls_name\n");
  emit("//\n");
  emit("\n");

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
    emit("// property: $propnm, type: $type\n");

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

sub genTsBasicPropCode($$$)
{
  my $classnm = shift;
  my $propnm = shift;
  my $prop = shift;

  my $tstype = tsTypeOf($prop);

  emit("  get $propnm() : $tstype {\n");
  emit("    return this.getProp(\'$propnm\');\n");
  emit("  }\n");
  emit("\n");

  return if (contains($prop->{"options"}, "readonly"));

  emit("  set $propnm(arg0: $tstype) {\n");
  emit("    this.setProp(\'$propnm\', arg0);\n");
  emit("  }\n");
  emit("\n");
}

sub genTsObjPropCode($$$)
{
  my $classnm = shift;
  my $propnm = shift;
  my $prop = shift;

  my $ts_type = tsTypeOf($prop);

  emit("  get $propnm() : $ts_type {\n");
  emit("    const result = this.getProp(\'$propnm\');\n");
  emit("    return this.createWrapper(result);\n");
  emit("  }\n");
  emit("\n");

  return if (contains($prop->{"options"}, "readonly"));

  emit("  set $propnm(arg0: $ts_type) {\n");
  emit("    this.setProp(\'$propnm\', arg0.wrapped);\n");
  emit("  }\n");
  emit("\n");
}

sub genTsEnumPropCode($$$)
{
  my ($classnm, $propnm, $prop) = @_;
  genTsBasicPropCode($classnm, $propnm, $prop);
  defined($prop->{"enumdef"}) || die;
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
    my $ts_typename = tsTypeOf($rettype);
    emit("// method: $nm\n");
    emit("  ${nm}(".makeMthSignt($mth).") : $ts_typename {\n");
    if ($rval_typename ne "void") {
        emit("    const result = ");
    }
    else {
        emit("    ");
    }
    emit("this.invokeMethod(".makeMthArg($mth).");\n");

    if ($rval_typename eq "object") {
        emit("    return this.createWrapper(result);\n");
    }
    elsif ($rval_typename eq "void") {
      # No return code
    }
    else {
      # basic types
      emit("  return result;\n");
    }

    emit("};\n");
    emit("\n");
  }

  emit("\n");
}

sub makeMthSignt($)
{
  my $mth = shift;
  my $args = $mth->{"args"};

  my $ind = 0;
  my @rval;
  foreach my $arg (@{$args}) {
      my $arg_type = tsTypeOf($arg);
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

    if (isCallbackObj($arg)) {
        # function obj can be directly passed to the methods
        # (it is converted to callback obj in the wrapper)
      push(@rval, "arg_$ind");
    }
    elsif ($arg_type eq "object") {
      push(@rval, "arg_${ind}.wrapped");
    }
    # TODO: conv for array/dict
    # elsif ($arg_type eq "dict") {
    #   push(@rval, "cuemol.conv_dict_arg(arg_${ind})");
    # }
    else {
      push(@rval, "arg_$ind");
    }
    ++$ind;
  }
  return join(", ", @rval);
}

sub isCallbackObj($)
{
  my $arg = shift;

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
