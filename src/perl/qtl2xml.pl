#!/usr/bin/perl

use FindBin;
use lib "$FindBin::RealBin";

use strict;

use MakeTopparXML;

my %topo;
my %parm;
my %links;

$MakeTopparXML::ns = "que";

loadQuePtl("../xul_gui/data/queptl.top");

MakeTopparXML::makeXML(\%topo, \%links, \%parm);

sub loadQuePtl($)
{
    my %resnmap = ("ADE" => "Ar",
		   "CYT" => "Cr",
		   "GUA" => "Gr",
		   "THY" => "Td",
		   "URI" => "Ur");


    my $fname = shift;
    open(IN, $fname) || die "$fname $?:$!";

    my $state = "none";

    my $id;
    my $iring;
    my $value;

    while (<IN>) {
	chomp;
	next if (/^\#/);

	if ($state eq "none") {
	    if (/^PropResid\s+(\S+)\s*$/) {
		$state = "resid";
		$id = $1;
		$iring = 0;
		# print STDERR "Resid: $id, [".$resnmap{$id}."]\n";
		my $resid = $topo{$id};
		if ($resnmap{$id}) {
		    my $oldid = $id;
		    $id = $resnmap{$oldid};
		    $resid = $topo{$id};
		    append_list($resid, "aliases", {"type"=>"resid",
						    "value"=>$oldid});
		    # print STDERR "name changed $id\n";
		}

		$resid = $topo{$id} = {"id"=>$id} unless ($resid);
		next;
	    }
	}
	elsif ($state eq "resid") {
	    if (/^\s*Pivot\s+(\S+)\s*$/) {
		print STDERR "piv $id -> $1\n";
		$topo{$id}->{"pivot"} = $1;
		next;
	    }
	    if (/^\s*Alias\s+(\S+)\s*$/) {
		print STDERR "alias $id -> $1\n";
		my $resid = $topo{$id};
		append_list($resid, "aliases", {"type"=>"resid",
						"value"=>$1});
		next;
	    }
	    if (/^\s*SideCh\s+(.+)\s+END$/) {
		print STDERR "sidech $id -> $1\n";
		$value = $1;
		$value =~ s/\'/\*/g;
		$topo{$id}->{"sidech"} = $value;
		next;
	    }
	    if (/^\s*MainCh\s+(.+)\s+END$/) {
		print STDERR "mainch $id -> $1\n";
		$value = $1;
		$value =~ s/\'/\*/g;
		$topo{$id}->{"mainch"} = $value;
		next;
	    }
	    if (/^\s*Ring\s+(.+)\s+END$/) {
		print STDERR "ring $id -> $1\n";
		$value = $1;
		$value =~ s/\'/\*/g;
		$topo{$id}->{"rings"}->[$iring] = $value;
		++$iring;
		next;
	    }
	    if (/^\s*Prop\s+(\S+)\s+(\S+)\s*$/) {
		next if ($1 eq "type");
		print STDERR "Prop $id $1 = $2\n";
		$topo{$id}->{"prop"}->{$1} = $2;
		next;
	    }
	    if (/^\s*END/) {
		$state = "none";
		$iring = 0;
		next;
	    }
	}
    }

    close(IN);
    print STDERR "$fname OK\n";
}

