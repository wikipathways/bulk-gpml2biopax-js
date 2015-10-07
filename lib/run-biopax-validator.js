var _ = require('lodash');
var biopaxValidator = require('./biopax-validator.js');
var fs = require('fs');
var path = require('path');
var Rx = require('rx');
var RxNode = require('rx-node');
var strcase = require('tower-strcase');
var VError = require('verror');

var filename = 'gpml2biopax-js/lib/run-biopax-validator.js';

function run(args) {
  var organism = args.organism;
  var iteration = args.iteration;
  var outFormat = args.outFormat;
  var autoFix = typeof args.autoFix === 'undefined' ? true : args.autoFix;

  /*
  return biopaxValidator.extractErrorsByPathway({
      organism: organism,
      iteration: iteration
    });
  //*/

  /*
  return biopaxValidator.categorizePathwaysByValidationResult({
      organism: organism,
      iteration: iteration
    });
  //*/

  /*
  return biopaxValidator.getValidationSummaryStats({
      organism: organism,
      iteration: iteration
    });
  //*/

  // Generate xml or html validation report(s)
  //*
  return biopaxValidator.validateWithLocalJar({
    autoFix: autoFix,
    iteration: iteration,
    organism: organism,
    outFormat: outFormat
  })
    .flatMap(function(result) {
      if (outFormat === 'xml') {
        return biopaxValidator.getValidationSummaryStats({
          organism: organism,
          iteration: iteration
        });
      } else {
        return Rx.Observable.empty();
      }
    });
  //*/

  /* Create all required directories
  return Rx.Observable.merge(
    biopaxValidator.setDirectories({
      iteration: iteration,
      organism: organism,
      outFormat: 'xml'
    }),
    biopaxValidator.setDirectories({
      iteration: iteration,
      organism: organism,
      outFormat: 'html'
    })
  );
  //*/
}

var organismList = [
  'Homo sapiens',
  //'Mus musculus'
];

// Generate XML and JSON validation reports
// and also generate auto-fixed BioPAX
// (depending on which items are commented
// out in the "run" method above)
Rx.Observable.fromArray(organismList)
  .map(function(organism) {
    var args = {};
    args.organism = organism;
    args.iteration = 'js0';
    //args.iteration = 'java0';

    args.outFormat = 'xml';
    return args;
  })
  .flatMap(run)
  .subscribe(function(result) {
    console.log('onNext...');
  }, function(err) {
    throw err;
  }, function() {
    console.log('done...');
  });

/* Generate HTML validation report
Rx.Observable.fromArray(organismList)
  .map(function(organism) {
    var args = {};
    args.organism = organism;
    args.iteration = 'js0';
    //args.iteration = 'java0';

    args.outFormat = 'html';
    args.autoFix = false;
    return args;
  })
  .flatMap(run)
  .subscribe(function(result) {
    console.log('onNext...');
  }, function(err) {
    throw err;
  }, function() {
    console.log('done...');
  });
//*/
