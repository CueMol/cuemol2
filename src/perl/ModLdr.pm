###################################################################
#
#  Module loader generation
#

package ModLdr;

use File::Basename;
use Exporter;
@ISA = qw(Exporter);
@EXPORT = qw(gen_mod_ldr);

use strict;
use Utils;
use Parser;
use Wrapper;

#####

# Output directory (if specified by cmdargs)
our $out_dir = "";

sub gen_mod_ldr($)
{
  my $in_fname = shift;

  my $curmod = Parser::getLastMod();
  my ($base, $dir, $ext) = fileparse($in_fname, '\.moddef');
  $dir =  "" if ($dir eq "./");
  $dir = $out_dir."/" if ($out_dir ne "");
  my $out_fname = "$dir${base}_loader.cpp";
  debug("Output modldr file: $out_fname\n");

  open(OUT, ">$out_fname") || die "$?:$!";
  set_building_file($out_fname);

  # makeSrc_preamble("", "");
  Wrapper::genSrcPreamble(*OUT, "", "");

  my $qifs = $Parser::moddb{$curmod}->{"qifs"};
  foreach my $qif (@$qifs) {
    my $hdrname = qif2WpHdrFname($qif);
    print OUT "#include \"$hdrname\"\n";
  }
  print OUT "\n";
  # print OUT "#include <qlib/LWrapper.hpp>\n";
  print OUT "\n";
  
  print OUT "void ${curmod}_regClasses()\n";
  print OUT "{\n";

  foreach my $qif (@$qifs) {
    my $cpp_cli_clsname = qif2CliClsName($qif);
    my $cpp_wp_clsname = qif2WpClsName($qif);
    print OUT "  $cpp_cli_clsname\::regClass();\n";
    # print OUT "  $cpp_cli_clsname\::getClassObjS()->";
    # print OUT "registerWrapFactory(LWRAPPERID_NATIVE,";
    # print OUT " new qlib::LSpecificWrapFactory<$cpp_wp_clsname>());\n";
  }

  print OUT "}\n";
  print OUT "\n";

  print OUT "void ${curmod}_unregClasses()\n";
  print OUT "{\n";

  foreach my $qif (@$qifs) {
    my $cpp_cli_clsname = qif2CliClsName($qif);
    my $cpp_wp_clsname = qif2WpClsName($qif);

    print OUT "  $cpp_cli_clsname\::unregClass();\n";
}

  print OUT "}\n";
  print OUT "\n";

  close(OUT);

}

1;
