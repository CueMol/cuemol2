#!/usr/bin/perl
#
# usage: perl mcwrapgen3.pl [options] <input.hpp> <output_base>
#
# options:
# -i <common_include_file>
#   insert include directive in the output C++ source
# -I
#   Directly passed to the "cpp" command
# -d
#   enable verbose debug info output
# -m <mode>
#   hdr: header gen.
#   src: source gen.
#   mod: module loader source gen.
# -MSVC
#   use MCVS CL command as CPP
#

# Input hpp file format:
#

use FindBin;
use lib "$FindBin::RealBin";

use File::Basename;
use strict;

use Utils;
use Parser;
use Wrapper;
use ModLdr;
use Jsclass;
use Pyclass;

my $msvc=0;

# check cmdline option
$Wrapper::common_inc;
my $mode="src";

my $curcls;
my $curmod;

# print "procarg0: ".join(",", @ARGV)."\n";
my $outdir;
for (;;) {
  my $arg = $ARGV[0];
  if ($arg eq "-i") {
    shift @ARGV;
    $Wrapper::common_inc = shift @ARGV;
    next;
  }
  elsif ($arg eq "-m") {
    shift @ARGV;
    $mode = shift @ARGV;
    next;
  }
  elsif ($arg eq "-d") {
    shift @ARGV;
    # $debug=1;
    Utils::setDebug(1);
    next;
  }
  elsif ($arg eq "-I") {
    shift @ARGV;
    my $inc = shift @ARGV;
    if ($msvc) {
      $Parser::CPPOPT .= "/I $inc ";
    }
    else {
      $Parser::CPPOPT .= "-I$inc ";
    }
    next;
  }
  elsif ($arg eq "-MSVC") {
    shift @ARGV;
    $Parser::CPPCMD = "cl";
    $Parser::CPPOPT = "/E /C /nologo ";
    $msvc=1;
    next;
  }
  elsif ($arg eq "-jsdir") {
    shift @ARGV;
    # $Jsclass::out_dir = shift @ARGV;
    $outdir = shift @ARGV;
    next;
  }
  elsif ($arg eq "-pydir") {
    shift @ARGV;
    # $Pyclass::out_dir = shift @ARGV;
    $outdir = shift @ARGV;
    next;
  }
  elsif ($arg eq "-outdir") {
    shift @ARGV;
    $outdir = shift @ARGV;
    next;
  }
  elsif ($arg eq "-D") {
    shift @ARGV;
    my $inc = shift @ARGV;
    if ($msvc) {
      $Parser::CPPOPT .= "/D $inc ";
    }
    else {
      $Parser::CPPOPT .= "-D$inc ";
    }
    next;
  }

  last;
}

# Set output dir
if ($mode eq "src" || $mode eq "hdr") {
    $Utils::out_dir = $outdir;
}
elsif ($mode eq "mod") {
    $ModLdr::out_dir = $outdir;
}
elsif ($mode eq "js") {
    $Jsclass::out_dir = $outdir;
}
elsif ($mode eq "py") {
    $Pyclass::out_dir = $outdir;
}

###################################################################
#
#  MAIN ROUTINE
#

if (@ARGV<1) {
    die "argv must be >=1";
}

my $in_fname = $ARGV[0];

loadQifFile($in_fname);
$curcls = getLastCls();
$curmod = getLastMod();

Utils::dumpdb();

die "argv must be ==1" if (@ARGV!=1);


if ($mode eq "src" ||
    $mode eq "hdr")
{
    &make_ovr_tab($Parser::db{$curcls});
    uniquefy(\@Parser::ovr_extends);
    &dump_ovr();

  if (keys(%Parser::db)==0) {
    die("No class definition is found.");
  }
}

if ($mode eq "src" || $mode eq "hdr") {
  if ($mode eq "src") {
    Wrapper::genCxxSource($Parser::db{$curcls});
  }
  elsif ($mode eq "hdr") {
    Wrapper::genCxxHeader($Parser::db{$curcls});
  }
}
elsif ($mode eq "mod") {

  die "Module definition is not found" if (keys(%Parser::moddb)==0);
  die "Too many module definitions" if (keys(%Parser::moddb)!=1);

  gen_mod_ldr($in_fname);
}
elsif ($mode eq "js") {
  Jsclass::genJsWrapper($Parser::db{$curcls});
}
elsif ($mode eq "py") {
  Pyclass::genWrapper($Parser::db{$curcls});
}
else {
    die "unknown mode: $mode";
}

