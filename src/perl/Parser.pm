######################################################################
#
# Input file parser
#

# Built structure
#
# Class {
#   qifname => QIF name of the class (== key of hash)
#   file => name of a file that define the class
#   decl_hdr => name of a C++ header file that define the client class
#   cpp_name => name of the class in C++
#   dllexport => specifies DLL export/import macro for symbol definition (i.e. XXX_API macro)
#                This must be specified when the class will be extended in other DLL modules.
#   extends => list of the superclasses
#   extends_wrapper => list of the wrapper class of the superclasses
#   options => options of the class
#     dynamic: always defined (??)
#     scriptable: generate getter/setter/invocation code
#     cloneable: generate clone() method
#     abstract: the client class is abstract => don't generate instantiation code
#     smartptr: generate wrapper for the smartptr
#     singleton: generate wrapper for the singleton class
# }
#
# Property {
#   name => name of the property (== key of hash)
#   type => type name (integer, object, enum, etc)
#   cppname => C++ name of the property
#   qif => QIF name (for object) / type (for non-obj)
#   ptr => type of ptr (for object) / always 0 (for non-obj)
#          0: non-ptr, 1: ptr, 2: smartptr
#          this record describes C++ type of the property
#   options => options of the property
#     readonly:  readonly property (don't generate setter code)
#     noevent:  don't fire any events
#     nopersist:  don't (de)selialize
#     redirect: redirect getter and setter calls to get_XXX and set_XXX, respectively
#     redirect(getter_name,setter_name),
#     redirect_<getter name>_<setter name>: redirect property handling to the methods with the specified names.
# }

package Parser;

use Utils;
use Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(loadQifFile make_ovr_tab dump_ovr ovr_props ovr_mths ovr_extends getLastCls getLastMod);

use strict;

my $cur_file;
my $cur_enum_name;
my $lineno = 0;
my $state = "none";
my $curcls;
my $curmod;

# module variables
our $CPPCMD = "cpp";
our $CPPOPT = "";

our %db;
our %moddb;

our %ovr_props;
our %ovr_mths;
our @ovr_extends;

our @user_cxx_incfiles = ();

sub getLastCls { return $curcls; }
sub getLastMod { return $curmod; }

sub appendReferQIF($$$) {
    my $cur_cls = shift;
    my $tpname = shift;
    my $qifname = shift;

    # debug "***** appendRefQIF: $cur_cls, $tpname, $qifname\n";

    return if ($tpname ne "object");

    return if ($cur_cls eq $qifname);

    return if (contains($db{$cur_cls}{"refers"}, $qifname));

    unshift @{$db{$cur_cls}->{"refers"}} , $qifname;
}

sub loadQifFile($) {
  my $in_fname = shift;
  debug("CPP: $CPPCMD $CPPOPT $in_fname\n");
  open(IN, "$CPPCMD $CPPOPT $in_fname |") || die("Error: QIF File open $in_fname, $!");
  $cur_file = $in_fname;

  while (<IN>){
    # debug("line $state $in_fname: $_");
    chomp();
    $lineno++;
    my $line;

    # process CPP's #line directive
    if (/^\#line\s+(\d+)\s+\"(.+)\"/) {
      # MSVC-type line marker
      debug("Line marker $1 in $2\n");
      $lineno = $1;
      $cur_file = $2;
      next;
    }
    elsif (/^\#\s+(\d+)\s+\"(.+)\"/) {
      # gcc-type line marker
      debug("Line marker $1 in $2\n");
      $lineno = $1;
      $cur_file = $2;
      next;
    }

    if (/^\s*\/\//) {
      # debug(" --> comment\n");
      next;
    }
    elsif (/^(.+)\s*\/\//) {
      $line = $1;
    }
    else {
      $line = $_;
    }
    
    if ($line =~ /^\s*(\S.*\S)\s*$/ ||
	$line =~ /^\s*(\S)\s*$/) {
      $line = $1;
    }
    else {
	# debug(" --> line ($line) ignored\n");
	next;
    }

    # debug(" OK ($line) accepted\n");

    if ($state eq "none") {
	&noneState($line);
    } elsif ($state eq "clsdef") {
	&clsdefState($line);
    } elsif ($state eq "moddef") {
	&moddefState($line);
    } elsif ($state eq "enumdef") {
	&enumdefState($line);
    }
  }
  
  close IN;
}

sub parseOpt($) {
  return split(/[\,\s]+/, shift);
}

################################
# Toplevel state
#
sub noneState($) {
  my $line = shift;

  if ($line =~ /^runtime_class\s+([\w]+)\s+extends\s+([\w\:]+)/ ||
      $line =~ /^runtime_class\s+([\w]+)/) {
    # class definition
    debug "class name : \"$1\" in the file: $cur_file\n";
    $state = "clsdef";
    $curcls = $1;
    my $supcls = $2;

    $db{$curcls}->{"file"} = $cur_file;
    $db{$curcls}->{"qifname"} = $curcls;
    $db{$curcls}->{"options"} = ["dynamic"];

    if ($supcls) {
        # if (!$db{$supcls}) {
	#     die "Fatal error: superclass <$supcls> is not defined.";
	# }
	appendReferQIF($curcls, "object", $supcls);
	$db{$curcls}->{"extends"} = [$supcls];
	$db{$curcls}->{"extends_wrapper"} = ["${supcls}_wrap"];
    }
    else {
	$db{$curcls}->{"extends"} = [];
    }
  }
  elsif ($line =~ /^module\s+([\w\:]+)/) {
    # module definition
    debug "module name : \"$1\"\n";
    $state = "moddef";
    $curmod = $1;

    $moddb{$curmod}->{"name"} = $curmod;
    $moddb{$curmod}->{"qifs"} = [];
  }
  elsif ($line =~ /^include\s+(.+)\s*\;/) {
    unshift @user_cxx_incfiles, $1;
  }
  elsif ($line =~ /^#pragma\s+once/) {
      # ADDED 2020/4/26: ignore pragma once
  }
  else {
    print("Warning: *** Unknown words at $cur_file, $lineno: \"$line\" ***\n");
  }
}

################################
# Class definition statements (prop, method, etc.)
#
sub parseTypeName($) {
  my $typenm = shift;

  debug("$typenm\n");

  if ($typenm eq "void" ||
      $typenm eq "boolean" ||
      $typenm eq "integer" ||
      $typenm eq "real" ||
      $typenm eq "string" ||
      $typenm eq "array" ||
      $typenm eq "dict" ||
      $typenm eq "enum") {
      return ($typenm, 0, $typenm, 0);
  }
  elsif ($typenm =~ /^object\s*\<\s*(.+)\s*\>$/) {
    my $cpptype = $1;
    $typenm = "object";

    my $ptr;
    my $qifname;
    if ($cpptype =~ /^([\w\:]+)\s*\$$/) {
      # SmartPtr object<XXX$>
      $qifname = $1;
      $ptr = 2;
    }
    elsif ($cpptype =~ /^([\w\:]+)\s*\*$/) {
      # Pointer object<XXX*>
      $qifname = $1;
      $ptr = 1;
    }
    elsif ($cpptype =~ /^([\w\:]+)$/) {
      # Value object<XXX>
      $qifname = $1;
      $ptr = 0;
    }
    else {
      die "Error: invalid type in prop def: $cpptype";
    }

    return ($typenm, $ptr, $qifname);
  }

  die "Error: invalid type name: $typenm at $cur_file, line $lineno\n";

  # "type"=>$proptype,
  # "ptr"=>$ptr,
  # "qif"=>$qifname,
}

sub propDef($$$$) {
  my ($strtypename, $propname, $cpp_name, $stropts) = @_;
  
  my ($proptype, $ptr, $nqtype) = parseTypeName($strtypename);
  
  my @options = parseOpt($stropts);
  debug "prop type : \"$proptype\", ";
  debug "prop name : \"$propname\"\n";
  debug "prop cpptype : \"$nqtype\"".($ptr?"ptr":"nonptr")."\n";
  debug "prop cppname : \"$cpp_name\"\n";
  
  if ($cpp_name =~ /redirect_\w+_\w+/) {
    push(@options, $cpp_name);
  }

  $db{$curcls}{"properties"}{$propname} = {"type"=>$proptype,
					   "name"=>$propname,
					   "cppname"=>$cpp_name,
					   "qif"=>$nqtype,
					   "ptr"=>$ptr,
					   "options"=>\@options };

  if ($proptype eq "enum") {
    if (!defined($db{$curcls}{"enums"}{$propname})) {
      die("ERROR: enumdef for $propname is not defined.\n");
    }
    $db{$curcls}{"properties"}{$propname}{"enumdef"} = $db{$curcls}{"enums"}{$propname};
  }
  appendReferQIF($curcls, $proptype, $nqtype);
}

sub propDefaultSet($$) {
  my ($propname, $cxxvalue) = @_;
  my $cls = $db{$curcls};
  my $props = $cls->{"properties"};

  my $prop = $props->{$propname};
  if (!$prop) {
    die "ERROR: Undefined property $propname is specified in default\n";
  }

  if (contains($prop->{"options"}, "readonly")){
    die "ERROR: Readonly property $propname is specified in default\n";
  }

  $prop->{"default"} = $cxxvalue;
}

sub methodDef($$$$) {
  my ($rettype, $mthname, $strargs, $cppname) = @_;

  my @args;
  foreach my $i (split(/\s*\,\s*/, $strargs)) {
    if ($i =~ /([\w\d\<\>\*\$]+)\s+(\w+)/) {
      debug("discard temp arg: $2\n");
      $i = $1;
    }
    my ($type, $ptr, $nqtype) = parseTypeName($i);
    debug "arg $i -> $type, $ptr, $nqtype\n";
    my $typeset = {"type"=>$type,
		   "qif"=>$nqtype,
		   "ptr"=>$ptr,
		   "orig"=>$i};
    push @args, $typeset;

    appendReferQIF($curcls, $type, $nqtype);
  }

  {
    my ($type, $ptr, $nqtype) = parseTypeName($rettype);
    debug "rettype $rettype -> $type, $ptr, $nqtype\n";
    $rettype = {"type"=>$type,
		"qif"=>$nqtype,
		"ptr"=>$ptr};

    appendReferQIF($curcls, $type, $nqtype);
  }

  debug "mth mthname : \"$mthname\"\n";
  debug "mth cppname : \"$cppname\"\n";
  
  foreach my $i (@args) {
    debug "   mth args : $i(".fmtType($i).")\n";
  }
  
  $db{$curcls}{"methods"}{$mthname} = {"name"=>$mthname,
				       "rettype"=>$rettype, 
				       "cppname"=>$cppname,
				       "args"=>\@args};
  
}

###########################
# Class definition body
#

my $re_cxx_typenm = '[\w<>:\*\$]+';
my $re_keyword = '\w+';

sub clsdefState($) {
  my $line = shift;

  # Start brace of classdef
  if ($line =~ /^\s*\{\s*$/) {
    # starting brace
    return;
  }

  # End of classdef
  if ($line =~ /^\}\;/) {
    $state = "none";
    # $curcls = "";
    return;
  }
  
  # Enum definition
  if ($line =~ /^enumdef\s+(\w+)\s*\{/) {
      # Enum definition
      debug "Enumdef name : \"$1\" in class: $curcls\n";
      $state = "enumdef";
      $cur_enum_name = $1;
      return;
  }
  elsif ($line =~ /^enumdef\s+(\w+)\s*=\s*([\w\.]+)\s*;/) {
    # Enum definition reusing other defs
    my $newdef = $1;
    my $edef = $2;
    my $clsnm = $curcls;
    # use defs in another class
    if ($edef =~ /(\w+)\.(\w+)/) {
      $edef = $2;
      $clsnm = $2;
    }
    if (!defined($db{$clsnm}{"enums"}{$edef})) {
      die("ERROR: enum $edef not defined in the enumdef line, at $cur_file, $lineno: $line\n");
    }
    if (defined($db{$curcls}{"enums"}{$newdef})) {
      die("ERROR: enum $newdef already defined in the enumdef line, at $cur_file, $lineno: $line\n");
    }
    $db{$curcls}{"enums"}{$newdef} = $db{$clsnm}{"enums"}{$edef};
    return;
  }
  elsif ($line =~ /^enumdef\s+([\w]+)/) {
      die("ERROR: No \{ in the enumdef line, at $cur_file, $lineno: $line\n");
  }

  # specify the base class of the wrapper
  if ($line =~ /^extends_wrapper\s+(.+)\s*;/) {
      my @ls = parseOpt($1);
      my @extends;
      foreach my $i (@ls) {
	  die "Error: extends_wrapper invalid class name $i" unless ($i =~ /[\w\:]+/);
	  unshift @extends, $i;
      }
      if ( int(@extends)!=int($db{$curcls}->{"extends"}) ) {
	  die "Error: extends_wrapper and extends values are inconsisntent.";
      }
      $db{$curcls}->{"extends_wrapper"} = \@extends;
    return;
  }

  # Header file of the client class
  if ($line =~ /^client_hdr\s+\"(.+)\"\s*;/) {
    $db{$curcls}->{"decl_hdr"} = $1;
    return;
  }
  # Fully-qualified C++ name of the client class
  if ($line =~ /^client_name\s+([\w\:]+)\s*;/) {
    $db{$curcls}->{"cpp_name"} = $1;
    $db{$curcls}->{"cpp_ns"} = ""; # getCppNS($1);
    return;
  }

  # DLL export option (XXX_API, etc)
  if ($line =~ /^dllexport\s+(\w+)\s*;/) {
    $db{$curcls}->{"dllexport"} = $1;
    return;
  }

  if ($line =~ /^scriptable\s*;/) {
    unshift @{$db{$curcls}{"options"}}, "scriptable";
    return;
  }
  if ($line =~ /^cloneable\s*;/) {
    unshift @{$db{$curcls}{"options"}}, "cloneable";
    return;
  }
  if ($line =~ /^abstract\s*;/) {
    unshift @{$db{$curcls}{"options"}}, "abstract";
    return;
  }
  if ($line =~ /^smartptr\s*;/) {
    unshift @{$db{$curcls}{"options"}}, "smartptr";
    if (contains($db{$curcls}{"options"}, "singleton")) {
      die "Error: $curcls cannot use both singleton and smartptr options";
    }
    return;
  }
  if ($line =~ /^singleton\s*;/) {
    unshift @{$db{$curcls}{"options"}}, "singleton";
    if (contains($db{$curcls}{"options"}, "smartptr")) {
      die "Error: $curcls cannot use both singleton and smartptr options";
    }
    return;
  }

#  if ($line =~ /^persistent\s*;/) {
#    unshift @{$db{$curcls}{"options"}}, "persistent";
#    return;
#  }


  # USING <QIF name> statement
  if ($line =~ /^using\s+(\w+)\s*;/) {
    my $qifname = $1;
    appendReferQIF($curcls, "object", $qifname);
    return;
  }

  if ($line =~ /^uuid\s+([\-\w]+)\s*;/) {
    # ignore UUID (not used)
    # $db{$curcls}{"uuid"} = $1;
    return;
  }
  #if ($line =~ /^copy_policy\s+(\w+)\s*;/) {
  #unshift @{$db{$curcls}{"copy_policy"}}, $1;
  #}

  ##########

  my $re_propl = '^property\s+('.$re_cxx_typenm.')\s+('.$re_keyword.')';
  my $re_propr = '(.+)';
  my $re_propr_opt = '\((.+)\)';
  my $re_propr_redir = 'redirect\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)';

  # prop def with redirection and options
  my $re = $re_propl.'\s+=>\s+'.$re_propr_redir.'\s+'.$re_propr_opt.'\s*;';
  if ($line =~ /$re/) {
    propDef($1, $2, "redirect_${3}_${4}", $5);
    return;
  }

  # prop def with redirection only
  my $re = $re_propl.'\s+=>\s+'.$re_propr_redir.'\s*;';
  # debug("XXXXXXXXXXXX $re\n");
  if ($line =~ /$re/) {
    # debug("XXXXXXXXXXXX $re\n");
    propDef($1, $2, "redirect_${3}_${4}", "");
    return;
  }

  # prop def with options
  my $re = $re_propl.'\s+=>\s+'.$re_propr.'\s+'.$re_propr_opt.'\s*;';
  if ($line =~ /$re/) {
    propDef($1, $2, $3, $4);
    return;
  }

  # prop def
  my $re = $re_propl.'\s+=>\s+'.$re_propr.'\s*;';
  if ($line =~ /$re/) {
    propDef($1, $2, $3, "");
    return;
  }

  # default value specification
  my $re = 'default\s+('.$re_keyword.')\s+=\s+(.+)\s*;';
  # print "XXXXXXXX $re\n";
  if ($line =~ /$re/) {
    propDefaultSet($1, $2);
    return;
  }

#  if ($line =~ /^property\s*([\w<>:\*\$]+)\s*(\w+)\s*=>\s*redirect\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*\((.+)\)\s*;/ ||
#	 $line =~ /^property\s*([\w<>:\*\$]+)\s*(\w+)\s*=>\s*redirect\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*;/) { 
#    # property definition with redirection
#    propDef($1, $2, "redirect_${3}_${4}", $5);
#    return;
#  }

  ##########

  # method definition with redirection
#  if ($line =~ /^([\w<>:\$\*]+)\s+(\w+)\s*\((.*)\)\s*=>\s*(\w+)\s*\;/) { 
  my $re_args = '.*';
  my $re_rettype = $re_cxx_typenm;
  my $re_mthname = $re_keyword;
  $re = '^('.$re_rettype.')\s+('.$re_mthname.')\s*\(('.$re_args.')\)\s*=>\s*('.$re_keyword.')\s*\;';
  if ($line =~ /$re/) { 
    # method definition
    methodDef($1, $2, $3, $4);
    return;
  }

  # method definition
#  if ($line =~ /^([\w<>:\$\*]+)\s+(\w+)\s*\((.*)\)\s*\;/) { 
  $re = '^('.$re_rettype.')\s+('.$re_mthname.')\s*\(('.$re_args.')\)\s*\;';
  if ($line =~ /$re/) { 
    # method definition
    methodDef($1, $2, $3, $2);
    return;
  }

  die("Error: Unknown words at $cur_file, $lineno: \"$line\"\n");
}

###################################
# Enum definition statements

sub enumdefState($) {
  my $line = shift;

  # End of enumdef
  if ($line =~ /^\}/) {
      $state = "clsdef";
      $cur_enum_name = "";
      debug("End of enumdef: $line\n");
      return;
  }

  # enum entry specification
  my $re = '('.$re_keyword.')\s+=\s+(.+)\s*;';
  if ($line =~ /$re/) {
      debug("enum name=$1 value=$2\n");

      if (!defined($db{$curcls}{"enums"}{$cur_enum_name})) {
	  $db{$curcls}{"enums"}{$cur_enum_name} = {$1 => $2};
      }
      else {
	  $db{$curcls}{"enums"}{$cur_enum_name}{$1} = $2;
      }
      return;
  }

  debug("enumdef: $line\n");
}

###################################
# Module definition statements

sub moddefState($) {
  my $line = shift;

  if ($line =~ /^\}\;/) {
    $state = "none";
    # $curmod = "";
    return;
  }
  elsif ($line =~ /^([\w]+)\s+uuid\s+([\w\-]+)\s*\;/ ||
	 $line =~ /^([\w]+)\s*\;/) { 
      my $qifname = $1;
      push(@{$moddb{$curmod}->{"qifs"}}, $qifname);

      # UUID is not used
      # my $uuid = $2;
      # debug "entry: <$1> uuid <$2>\n";
      # die "Fatal error: runtime_class <$qifname> is not defined." unless ($db{$qifname});
      # $db{$qifname}->{"clsid"} = $uuid;
  }
  elsif ($line =~ /^init\s+([\w\:\(\)]+)\s*;/) {
    debug "initializer: $1\n";
    $moddb{$curmod}->{"init"} = $1;
  }
  elsif ($line =~ /^fini\s+([\w\:\(\)]+)\s*;/) {
    debug "finalizer: $1\n";
    $moddb{$curmod}->{"fini"} = $1;
  }
  elsif ($line =~ /^\s*{\s*$/) {
    # starting brace
  }
  else {
    die("Error: unknown words at $.: $line\n");
  }
}

##########

sub make_ovr_tab($) {
  my $cls = shift;

  if ($cls->{"extends"}) {
    foreach my $excls (@{$cls->{"extends"}}) {
      push(@ovr_extends, $excls);
      make_ovr_tab($db{$excls});
    }
  }

  if ($cls->{"properties"}) {
    my %props = %{$cls->{"properties"}};
    foreach my $nm (sort keys %props) {
      $ovr_props{$nm} = $props{$nm};
      $ovr_props{$nm}->{"definedin"} = $cls->{"qifname"};
    }
  }

  if ($cls->{"methods"}) {
    my %mths = %{$cls->{"methods"}};
    foreach my $nm (sort keys %mths) {
      $ovr_mths{$nm} = $mths{$nm};
      $ovr_mths{$nm}->{"definedin"} = $cls->{"qifname"};
    }
  }
}

sub dump_ovr() {
  foreach my $nm (@ovr_extends) {
    debug "extends: $nm\n";
  }
  foreach my $nm (sort keys %ovr_props) {
    debug "prop $nm\n";
  }
  foreach my $nm (sort keys %ovr_mths) {
    debug "mth $nm\n";
  }
}

1;

