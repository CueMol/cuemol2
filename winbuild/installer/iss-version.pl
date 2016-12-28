#!/usr/bin/perl
#
# $Id: iss-version.pl,v 1.2 2011/02/15 10:05:38 rishitani Exp $
#
# Embed the version number into InnoSetup iss file
# usage: perl <InnoSetup input file> <version.hpp file> <xulrunner_dir> <buildset_dir> <xuldeploy_dir> <boost_version_str>

use strict;

my $input_iss = $ARGV[0];
my $version_file = $ARGV[1];
my $xulbin_dir = $ARGV[2]."\\bin";
my $buildset_dir = $ARGV[3];
my $xuldeploy_dir = $ARGV[4];
my $boost_ver = $ARGV[5];

print "xulbin_dir=$xulbin_dir\n";
die unless (-d $xulbin_dir);

print "buildset_dir=$buildset_dir\n";
die unless (-d $buildset_dir);

print "xuldeploy_dir=$xuldeploy_dir\n";
die unless (-d $xuldeploy_dir);

my $platform="win32";
if ($xuldeploy_dir=~/Release64/) {
  $platform="x64";
}

# check boost lib location
print "boost_version_str=$boost_ver\n";
print "check file: $buildset_dir\\bin\\boost_thread-$boost_ver.dll\n";
die unless (-f "$buildset_dir\\bin\\boost_thread-$boost_ver.dll");

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

my $povray_cmd = " ";
if (-f "$buildset_dir/povray-bundle/povray.exe" &&
    -d "$buildset_dir/povray-bundle/include" ) {
  $povray_cmd = "\"/dPovBundleDir=$buildset_dir/povray-bundle\" ";
}

my $ffmpeg_cmd = " ";
if (-f "$buildset_dir/ffmpeg-bundle/bin/ffmpeg.exe") {
  $ffmpeg_cmd = "\"/dFFmpegBundleDir=$buildset_dir/ffmpeg-bundle\" ";
}

my $apbs_cmd = " ";
if (-d "$buildset_dir/apbs-bundle") {
  $apbs_cmd = "\"/dAPBSBundleDir=$buildset_dir/apbs-bundle\" ";
}

my $cmd = "iscc ".
"\"/dPlatform=$platform\" ".
"\"/dBUILDSET_DIR=$buildset_dir\" ".
"\"/dXulRTDir=$xulbin_dir\" ".
"\"/dCueMolReleaseID=$release_ID\" ".
"\"/dCueMolBuildID=$build_ID\" ".
"\"/dBoostVer=$boost_ver\" ".
"\"/dWinBuildDir=$xuldeploy_dir\" ".
$povray_cmd . $ffmpeg_cmd . $apbs_cmd . $input_iss;

print("RUN: $cmd\n");
system($cmd);

