#!/usr/bin/perl

use strict;
use File::Path;

my $path_sep = "\\";
my $DUMP_SYM = "F:\\proj\\tmp\\google-breakpad-read-only\\src\\tools\\windows\\binaries\\dump_syms.exe";

my $top_dir = $ARGV[0];
print "Top dir: $top_dir\n";

my $out_dir = $ARGV[1];
print "Output dir: $out_dir\n";

if (!(-d $top_dir)) {
  die "Error, $top_dir is not a directory";
}

sub process_dir($)
{
  my $dirname = shift;

  opendir DIR, $dirname || die;
  my @files = readdir DIR;
  closedir DIR;

  # print @files;
  # print "\n";

  foreach my $i (@files) {
    next if ($i eq "..");
    next if ($i eq ".");
    my $path = $dirname.$path_sep.$i;
    if (-d $path) {
      # print "$i is directory\n";
      # print "Entring directory $path\n";
      &process_dir($path);
      # print "Leaving directory $path\n";
    }
    elsif (-f $path && $i =~ /\.pdb$/) {
      print "$path is pdb file\n";
      &dump_syms($path, $dirname, $i);
    }
    else {
      # print "$i is an unknown file\n";
    }
  }
  # print "listing of directory $dirname is done.\n";
  return;
}

sub makeSymFname($)
{
  my $fline = shift;
  my @ln = split(/\s+/, $fline);
  my $id = $ln[3];
  my $fn = $ln[4];

  print "$fline, $id, $fn\n";

  return "" unless ($fn =~ /^(.+)\.pdb$/);

  my $rdir = $out_dir.$path_sep.$fn.$path_sep.$id;
  my $rpath = $rdir.$path_sep.$1.".sym";
  mkpath $rdir;
  return $rpath;
}

sub dump_syms($$$)
{
  my $path = shift;
  my $dirname = shift;
  my $leafname = shift;

  open(IN, "$DUMP_SYM $path|");
  my $fline = <IN>;
  close(IN);

  my $fname = makeSymFname($fline);
  print "$fname\n";
  return if (!$fname);
  system("$DUMP_SYM $path>$fname");
}


process_dir($top_dir);

