#!/usr/bin/perl
#
# $Id: iss-version.pl,v 1.2 2011/02/15 10:05:38 rishitani Exp $
#
# Embed the version number into InnoSetup iss file
# usage: perl <InnoSetup input file> <version.hpp file> <xulrunner_bindir> <proj_dir>

use strict;

my $input_iss = $ARGV[0];
my $version_file = $ARGV[1];
my $xulbin_dir = $ARGV[2]."\\bin";
my $proj_dir = $ARGV[3];

print "xulbin_dir=$xulbin_dir\n";
die unless (-d $xulbin_dir);
print "proj_dir=$proj_dir\n";
die unless (-d $proj_dir);

# extract version no
open(IN, $version_file) || die "$version_file : $!";
my $release_ID = "X.X.X";
my $build_ID = "X";
while (<IN>) {
    if (/\#define FILEVER\s+(\d+\,\d+\,\d+\,\d+)/) {
      my @l = split(",", $1);
      print "Version=$1\n";
      $release_ID = "$l[0].$l[1].$l[2]";
      $build_ID = "$l[3]";
    }
}
close(IN);

#if (length($verstring)<=0) {
#    die "cannot extract version string from $version_file";
#}

# replace version string
# open(IN, $input_iss) || die "$input_iss : $!";
# open(OUT, ">$output_iss") || die "$output_iss : $!";
# 
# print "PROJ_DIR=$proj_dir\n";
# my $accum="";
# while (<IN>) {
#   s/\@VERSION_RELEASE_ID\@/$release_ID/g;
#   s/\@VERSION_BUILD_ID\@/$build_ID/g;
#   if ($proj_dir) {
#     s/\@PROJ_DIR\@/$proj_dir/g;
#   }
#   
#     if (/(.*)\\$/) {
#         $accum .= $1;
#     }
#     else {
#         print OUT $accum;
#         $accum="";
#         print OUT $_;
#     }
# }
# 
# print OUT "$accum\n";
# close(IN);
# close(OUT);

my $povray_cmd = "";
if (-f "$proj_dir/povray-bundle/povray.exe" &&
    -d "$proj_dir/povray-bundle/include" ) {
  $povray_cmd = "\"/dPovBundleDir=$proj_dir/povray-bundle\"";
}

my $ffmpeg_cmd = "";
if (-f "$proj_dir/ffmpeg-bundle/bin/ffmpeg.exe") {
  $ffmpeg_cmd = "\"/dFFmpegBundleDir=$proj_dir/ffmpeg-bundle\"";
}

my $apbs_cmd = "";
if (-d "$proj_dir/apbs-bundle") {
  $apbs_cmd = "\"/dAPBSBundleDir=$proj_dir/apbs-bundle\"";
}

my $cmd = "iscc \"/dPROJ_DIR=$proj_dir\" \"/dXulRTDir=$xulbin_dir\" \"/dCueMolReleaseID=$release_ID\" \"/dCueMolBuildID=$build_ID\" $povray_cmd $ffmpeg_cmd $apbs_cmd $input_iss";
print("RUN: $cmd\n");
system($cmd);

#if ($povray_cmd) {
#  # build non-pov version
#  my $cmd = "iscc \"/dPROJ_DIR=$proj_dir\" \"/dCueMolReleaseID=$release_ID\" \"/dCueMolBuildID=$build_ID\" $input_iss";
#  print("RUN: $cmd\n");
#  system($cmd);
#}

