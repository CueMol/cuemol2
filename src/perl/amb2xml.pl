#!/usr/bin/perl

use FindBin;
use lib "$FindBin::RealBin";

use strict;

use MakeTopparXML;

my %topo;
my %parm;
my %links;

$MakeTopparXML::ns = "amber";

loadAmbPrep();

MakeTopparXML::makeXML(\%topo, \%links, \%parm);

sub loadAmbPrep($)
{
    my $id;
    my $desc;
    my $value;
    my $atoms;

    <>;
    <>;

    my $state = "none";
    while (<>) {
	chomp;

	if ($state eq "none") {
	    return if (/^STOP$/);
	    die unless (/^\s*(\S.+)\s*$/);
	    $state = "resid";
	    $desc = $1;
	    
	    <>;
	    $_=<>;
	    chomp;
	    die unless (/^\s(\S+)\s+INT/);
	    $id = $1;
	    my $resid = $topo{$id};
	    $resid = $topo{$id} = {"id"=>$id} unless ($resid);
	    $resid->{"desc"} = $desc;
	    $atoms = [];
	    <>;
	    <>;
	    print STDERR "resid $id, desc $desc\n";
	    next;
	}
	elsif ($state eq "resid") {
	    if ($_ eq "") {
		$state = "end";
		next;
	    }
	    # die unless (/^\s+\d+\s+(\S+)\s+(\S+)\s*$/);
	    my @line = split(/\s+/);
	    my $name = $line[2];
	    next if ($name eq "DUMM");
	    # print join(",", @line)."\n";
	    my $type = $line[3];
	    my $chg = $line[11];
	    my $atom = {
		"id" => $name,
		"type" => $type,
		"chg" => $chg,
	    };
	    push(@{$atoms}, $atom);
	    print STDERR "  name $name, type $type, chg $chg\n";
	}
	elsif ($state eq "end") {
	    if (/^DONE$/) {
		$topo{$id}->{"atoms"} = $atoms;
		$state = "none";
		next;
	    }
	}
    }

    close(IN);
}

