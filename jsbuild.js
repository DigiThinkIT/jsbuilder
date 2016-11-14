#!/usr/bin/env node
const jsbuilder = require('./main');

var builder = jsbuilder.Builder.cli();
builder.build();
