#!/bin/bash

EXT_ID=fav-emoji@ijin82

cd $EXT_ID

glib-compile-schemas ./schemas

zip ../$EXT_ID.zip *.js
zip ../$EXT_ID.zip metadata.json
zip ../$EXT_ID.zip stylesheet.css

zip -r ../$EXT_ID.zip data
zip -r ../$EXT_ID.zip schemas
zip -r ../$EXT_ID.zip locale
zip -r ../$EXT_ID.zip icons
zip -r ../$EXT_ID.zip handlers

shopt -s globstar

zip -d ../$EXT_ID.zip **/*.pot 2>/dev/null || true
zip -d ../$EXT_ID.zip **/*.po 2>/dev/null || true
