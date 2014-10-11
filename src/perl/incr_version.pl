#!/usr/bin/perl
# $Id: incr_version.pl,v 1.3 2010/02/17 15:10:44 rishitani Exp $
#
# Increment version number in the version.hpp file
# usage: perl incr_version.pl [path to version.hpp] [path to application.ini]

use strict;

#use POSIX qw(strftime);
#my $now_string = strftime "%a %b %e %H:%M:%S %Y", localtime;
my ($sec,$min,$hour,$mday,$mon,$year,$wday,$yday,$isdst) = localtime;
$year += 1900;
$mon += 1;
print "$year/$mon/$mday $hour:$min:$sec\n";
my $build_ID = sprintf("%04d%02d%02d%02d%02d%02d", $year, $mon, $mday, $hour, $min, $sec);
print "Build ID = $build_ID\n";

# open the file
my $version_file = $ARGV[0];
open(IN, $version_file) || die "usage: $0 version.hpp application.ini, error: $version_file : $!";

# read into mem
my @lines = <IN>;
close(IN);

# output
open(OUT, ">$version_file") || die "$version_file : $!";

my $new_version;
foreach my $l (@lines) {
  if ($l =~ /^(.*\d+\,\d+\,\d+\,)(\d+)(.*)$/) {
    print OUT "$1".($2+1)."$3\n";
  }
  elsif ($l =~ /^(.*\")(\d+\.\d+\.\d+\.)(\d+)(\".*)$/) {
    print OUT "$1$2".($3+1)."$4\n";
    $new_version = "$2".($3+1);
  }
  elsif ($l =~ /^(.*)(\d{14})(.*)$/) {
    print OUT "$1".($build_ID)."$3\n";
  }
  else {
    print OUT $l;
  }
}

close(OUT);

print "new version: $new_version\n";
die if (!$new_version);

###########################

my $slash;
my $appfile;

# $slash = rindex($version_file, "/");
# $appfile = substr($version_file, 0, $slash) . "/" . "xul_gui/application.ini";
$appfile = $ARGV[1];
print "appfile = $appfile\n";

open(IN, $appfile) || die "$appfile : $!";

# read into mem
my @lines = <IN>;
close(IN);

# $appfile = "test.txt";
# output
open(OUT, ">$appfile") || die "$appfile : $!";

foreach my $l (@lines) {
  if ($l =~ /^Version\s*=/) {
    print OUT "Version=$new_version\n";
  }
  elsif ($l =~ /^BuildID\s*=/) {
    print OUT "BuildID=$build_ID\n";
  }
  elsif ($l =~ /^Copyright\s*=/) {
    print OUT "Copyright=Copyright (C) 2003-$year BKR-LAB\n";
  }
  else {
    print OUT $l;
  }
}

close(OUT);

