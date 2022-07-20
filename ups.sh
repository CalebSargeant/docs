#!/bin/bash

STATUS=$(upsc eaton ups.status 2>&1 | grep -v '^Init SSL')

if [ $STATUS == "OL" ]; then
    exit
elif [ $STATUS == "OB" ]; then
    BATTERY=$(upsc eaton battery.charge 2>&1 | grep -v '^Init SSL')
    BEEPER=$(upsc eaton ups.beeper.status 2>&1 | grep -v '^Init SSL')

    if [ $BEEPER == "enabled" ]; then
        upscmd -u admin -p password eaton beeper.disable
    fi

    if [ $BATTERY < 55 ]; then
        upscmd eaton -u admin -p password load.off
    elif [ $BATTERY > 55 ]; then
        exit
    fi
fi