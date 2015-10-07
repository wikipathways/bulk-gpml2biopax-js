// TODO find the xml parser and then rename ncbigene to Entrez Gene
require('pretty-error').start(); // to make errors more readable
var _ = require('lodash');
var exec = require('child_process').exec;
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var Rx = require('rx');
var RxNode = require('rx-node');
var strcase = require('tower-strcase');
var VError = require('verror');
var xmldom = require('xmldom');

var filename = 'gpml2biopax-js/lib/biopax-validator.js';

var paxtoolsPath = '/Applications/biopax-validator-4.0.0-SNAPSHOT';
var pcSubmissionPath = path.join(__dirname, '..', '..', 'pc-submissions');
var owlSourcePathAll = path.join(
    pcSubmissionPath, 'v20150916', 'wikipathways-human-v20150916-biopax3');
var owlDestPathAll = path.join(
    pcSubmissionPath, 'v20150929', 'wikipathways-human-v20150929-biopax3');

var preferredPrefixToDbMappings = {
  'ncbigene': 'Entrez Gene',
  'hmdb': 'HMDB',
  'cas': 'CAS',
  'pubchem.compound': 'PubChem-compound',
  'pubchem.substance': 'PubChem-substance',
  'ec-code': 'Enzyme Nomenclature',
  'ensembl': 'Ensembl',
  'chebi': 'ChEBI',
  'taxonomy': 'Taxonomy'
};

var preferredPrefixes = _.keys(preferredPrefixToDbMappings);
console.log('preferredPrefixes');
console.log(preferredPrefixes);

function renameDbFirstIteration(filepath) {
  var sourceFilePath = path.join(owlSourcePathAll, filepath);
  var sourceFile = fs.readFileSync(sourceFilePath, 'utf8');
  var DOMParser = xmldom.DOMParser; // jshint ignore:line
  var doc = new DOMParser().parseFromString(sourceFile, 'text/xml');
  _.filter(doc.getElementsByTagNameNS('http://www.biopax.org/release/biopax-level3.owl#', 'db'),
    (function(dbElement) {
      return preferredPrefixes.indexOf(dbElement.textContent) > -1;
    }))
    .forEach(function(dbElement) {
      dbElement.textContent = preferredPrefixToDbMappings[dbElement.textContent];
      console.log('dbElement.textContent2');
      console.log(dbElement.textContent);
    });
  var XMLSerializer = xmldom.XMLSerializer;
  var docString = new XMLSerializer().serializeToString(doc);
  var destFilepath = path.join(owlDestPathAll, filepath);
  fs.writeFileSync(destFilepath, docString, {encoding: 'utf8'});
  return filepath;
//    var errorsAndWarningsByPathway = _(validationElements)
//      .map(function(validationElement) {
//        var description = validationElement.getAttribute('description');
//        var identifier = description.match(/WP\d+/)[0];
//        var pathwayFilepath = description.match(/file:(\/.*\.owl)/)[1];
//        var errorAndWarningClasses = _(validationElement.getElementsByTagName('error'))
//          .map(function(errorElement) {
//            var errorAndWarningCases = _(errorElement.getElementsByTagName('errorCase'))
//              .map(function(errorAndWarningCase) {
//                var textContent = errorAndWarningCase.textContent;
//                if (textContent === '\n                \n            ') {
//                  textContent = null;
//                }
//                return {
//                  object: errorAndWarningCase.getAttribute('object'),
//                  textContent: textContent
//                };
//              })
//              .value();
//
//            return {
//              code: errorElement.getAttribute('code'),
//              message: errorElement.getAttribute('message'),
//              type: errorElement.getAttribute('type'),
//              cases: errorAndWarningCases
//            };
//          })
//          .value();
//
//        var errors = errorAndWarningClasses.filter(function(errorAndWarningClass) {
//          return errorAndWarningClass.type === 'ERROR';
//        });
//        var warnings = errorAndWarningClasses.filter(function(errorAndWarningClass) {
//          return errorAndWarningClass.type === 'WARNING';
//        });
//
//        var result = {};
//        result.identifier = identifier;
//        result.filepath = pathwayFilepath;
//        if (!_.isEmpty(errors)) {
//          result.errors = errors;
//        }
//        if (!_.isEmpty(warnings)) {
//          result.warnings = warnings;
//        }
//
//        return result;
//      })
//      .value();
//
//    var errorsAndWarningsByPathwayString = JSON.stringify(errorsAndWarningsByPathway, null, '  ');
//
//    var errorSummaryPath = validationReportFullFilepath
//      .replace('full-directory-report.xml', 'issues-by-pathway.json');
//    fs.writeFileSync(errorSummaryPath, errorsAndWarningsByPathwayString, 'utf8');
//
//    var errorPartition = Rx.Observable.fromArray(
//        errorsAndWarningsByPathway)
//      .partition(function(item) {
//        return !_.isEmpty(item.errors);
//      });
//
//    var errorsSource = errorPartition[0]
//      .map(function(item) {
//        item.directoryNamespace = 'errors';
//        return item;
//      });
//
//    var warningsOrNothingPartition = errorPartition[1]
//      .partition(function(item) {
//        return !_.isEmpty(item.warnings);
//      });
//
//    var warningsSource = warningsOrNothingPartition[0]
//      .map(function(item) {
//        item.directoryNamespace = 'warnings-only';
//        return item;
//      });
//
//    var noWarningsNoErrorsSource = warningsOrNothingPartition[1]
//      .map(function(item) {
//        item.directoryNamespace = 'no-warnings-no-errors';
//        return item;
//      });
//
//    return Rx.Observable.merge(
//      errorsSource,
//      warningsSource,
//      noWarningsNoErrorsSource
//    )
//      .doOnNext(function(item) {
//        var identifier = item.identifier;
//        var sourceFilepath = item.filepath;
//
//        var filepathComponents = path.parse(sourceFilepath);
//        var filename = filepathComponents.name;
//        var newFilename = identifier;
//
//        var rawTargetFilepath = sourceFilepath
//            .replace(/source-all/, 'source-' + item.directoryNamespace)
//            .replace(filename, newFilename);
//        var rawTargetDir = path.dirname(rawTargetFilepath);
//        Rx.Observable.fromNodeCallback(fs.readdir)(rawTargetDir)
//          .flatMap(function(filepathList) {
//            return Rx.Observable.from(filepathList);
//          })
//          .filter(function(filepath) {
//            return filepath.match(/\.owl$/);
//          })
//          .flatMap(function(filepath) {
//            var fullFilepath = path.join(rawTargetDir, filepath);
//            return Rx.Observable.fromNodeCallback(fs.stat)(fullFilepath)
//              .filter(function(filestats) {
//                var now = new Date().getTime();
//                return filestats.isFile() && (now - filestats.mtime.getTime() > 60 * 1000);
//              })
//              .doOnNext(function(result) {
//                console.log('Deleting ' + fullFilepath);
//                fs.unlinkSync(fullFilepath);
//              });
//          })
//          .subscribeOnNext(function(result) {
//            // do something
//          });
//
//        fs.createReadStream(sourceFilepath)
//          .pipe(fs.createWriteStream(rawTargetFilepath));
//
//        var modifiedSourceFilepath = sourceFilepath
//            .replace(/source-all/, 'auto-fixed')
//            .replace(filename, newFilename);
//
//        var modifiedTargetFilepath = modifiedSourceFilepath
//            .replace(/auto-fixed/, 'auto-fixed-' + item.directoryNamespace);
//        fs.createReadStream(modifiedSourceFilepath)
//          .pipe(fs.createWriteStream(modifiedTargetFilepath));
//
//        var modifiedTargetDir = path.dirname(modifiedTargetFilepath);
//        Rx.Observable.fromNodeCallback(fs.readdir)(modifiedTargetDir)
//          .flatMap(function(filepathList) {
//            return Rx.Observable.from(filepathList);
//          })
//          .filter(function(filepath) {
//            return filepath.match(/\.owl$/);
//          })
//          .flatMap(function(filepath) {
//            var fullFilepath = path.join(modifiedTargetDir, filepath);
//            return Rx.Observable.fromNodeCallback(fs.stat)(fullFilepath)
//              .filter(function(filestats) {
//                var now = new Date().getTime();
//                return filestats.isFile() && (now - filestats.mtime.getTime() > 60 * 1000);
//              })
//              .doOnNext(function(result) {
//                console.log('Deleting ' + fullFilepath);
//                fs.unlinkSync(fullFilepath);
//              });
//          })
//          .subscribeOnNext(function(result) {
//            // do something
//          });
//      });
}

Rx.Observable.fromNodeCallback(fs.readdir)(owlSourcePathAll)
  .flatMap(function(filepathList) {
    return Rx.Observable.from(filepathList);
  })
  .filter(function(filepath) {
    return filepath.match(/\.owl$/);
  })
  .map(function(filepath) {
    return renameDbFirstIteration(filepath);
  })
  .subscribeOnNext(function(result) {
    console.log('Completed ' + result);
  });

//function categorizePathwaysByValidationResult(args) {
//  return setDirectories(args)
//    .flatMap(function() {
//      var validationReport = fs.readFileSync(validationReportFullFilepath, 'utf8');
//      var DOMParser = xmldom.DOMParser; // jshint ignore:line
//      var doc = new DOMParser().parseFromString(validationReport, 'text/xml');
//      var validationElements = doc.getElementsByTagName('validation');
//      var errorsAndWarningsByPathway = _(validationElements)
//        .map(function(validationElement) {
//          var description = validationElement.getAttribute('description');
//          var identifier = description.match(/WP\d+/)[0];
//          var pathwayFilepath = description.match(/file:(\/.*\.owl)/)[1];
//          var errorAndWarningClasses = _(validationElement.getElementsByTagName('error'))
//            .map(function(errorElement) {
//              var errorAndWarningCases = _(errorElement.getElementsByTagName('errorCase'))
//                .map(function(errorAndWarningCase) {
//                  var textContent = errorAndWarningCase.textContent;
//                  if (textContent === '\n                \n            ') {
//                    textContent = null;
//                  }
//                  return {
//                    object: errorAndWarningCase.getAttribute('object'),
//                    textContent: textContent
//                  };
//                })
//                .value();
//
//              return {
//                code: errorElement.getAttribute('code'),
//                message: errorElement.getAttribute('message'),
//                type: errorElement.getAttribute('type'),
//                cases: errorAndWarningCases
//              };
//            })
//            .value();
//
//          var errors = errorAndWarningClasses.filter(function(errorAndWarningClass) {
//            return errorAndWarningClass.type === 'ERROR';
//          });
//          var warnings = errorAndWarningClasses.filter(function(errorAndWarningClass) {
//            return errorAndWarningClass.type === 'WARNING';
//          });
//
//          var result = {};
//          result.identifier = identifier;
//          result.filepath = pathwayFilepath;
//          if (!_.isEmpty(errors)) {
//            result.errors = errors;
//          }
//          if (!_.isEmpty(warnings)) {
//            result.warnings = warnings;
//          }
//
//          return result;
//        })
//        .value();
//
//      var errorsAndWarningsByPathwayString = JSON.stringify(
  //      errorsAndWarningsByPathway, null, '  ');
//
//      var errorSummaryPath = validationReportFullFilepath
//        .replace('full-directory-report.xml', 'issues-by-pathway.json');
//      fs.writeFileSync(errorSummaryPath, errorsAndWarningsByPathwayString, 'utf8');
//
//      var errorPartition = Rx.Observable.fromArray(
//          errorsAndWarningsByPathway)
//        .partition(function(item) {
//          return !_.isEmpty(item.errors);
//        });
//
//      var errorsSource = errorPartition[0]
//        .map(function(item) {
//          item.directoryNamespace = 'errors';
//          return item;
//        });
//
//      var warningsOrNothingPartition = errorPartition[1]
//        .partition(function(item) {
//          return !_.isEmpty(item.warnings);
//        });
//
//      var warningsSource = warningsOrNothingPartition[0]
//        .map(function(item) {
//          item.directoryNamespace = 'warnings-only';
//          return item;
//        });
//
//      var noWarningsNoErrorsSource = warningsOrNothingPartition[1]
//        .map(function(item) {
//          item.directoryNamespace = 'no-warnings-no-errors';
//          return item;
//        });
//
//      return Rx.Observable.merge(
//        errorsSource,
//        warningsSource,
//        noWarningsNoErrorsSource
//      )
//        .doOnNext(function(item) {
//          var identifier = item.identifier;
//          var sourceFilepath = item.filepath;
//
//          var filepathComponents = path.parse(sourceFilepath);
//          var filename = filepathComponents.name;
//          var newFilename = identifier;
//
//          var rawTargetFilepath = sourceFilepath
//              .replace(/source-all/, 'source-' + item.directoryNamespace)
//              .replace(filename, newFilename);
//          var rawTargetDir = path.dirname(rawTargetFilepath);
//          Rx.Observable.fromNodeCallback(fs.readdir)(rawTargetDir)
//            .flatMap(function(filepathList) {
//              return Rx.Observable.from(filepathList);
//            })
//            .filter(function(filepath) {
//              return filepath.match(/\.owl$/);
//            })
//            .flatMap(function(filepath) {
//              var fullFilepath = path.join(rawTargetDir, filepath);
//              return Rx.Observable.fromNodeCallback(fs.stat)(fullFilepath)
//                .filter(function(filestats) {
//                  var now = new Date().getTime();
//                  return filestats.isFile() && (now - filestats.mtime.getTime() > 60 * 1000);
//                })
//                .doOnNext(function(result) {
//                  console.log('Deleting ' + fullFilepath);
//                  fs.unlinkSync(fullFilepath);
//                });
//            })
//            .subscribeOnNext(function(result) {
//              // do something
//            });
//
//          fs.createReadStream(sourceFilepath)
//            .pipe(fs.createWriteStream(rawTargetFilepath));
//
//          var modifiedSourceFilepath = sourceFilepath
//              .replace(/source-all/, 'auto-fixed')
//              .replace(filename, newFilename);
//
//          var modifiedTargetFilepath = modifiedSourceFilepath
//              .replace(/auto-fixed/, 'auto-fixed-' + item.directoryNamespace);
//          fs.createReadStream(modifiedSourceFilepath)
//            .pipe(fs.createWriteStream(modifiedTargetFilepath));
//
//          var modifiedTargetDir = path.dirname(modifiedTargetFilepath);
//          Rx.Observable.fromNodeCallback(fs.readdir)(modifiedTargetDir)
//            .flatMap(function(filepathList) {
//              return Rx.Observable.from(filepathList);
//            })
//            .filter(function(filepath) {
//              return filepath.match(/\.owl$/);
//            })
//            .flatMap(function(filepath) {
//              var fullFilepath = path.join(modifiedTargetDir, filepath);
//              return Rx.Observable.fromNodeCallback(fs.stat)(fullFilepath)
//                .filter(function(filestats) {
//                  var now = new Date().getTime();
//                  return filestats.isFile() && (now - filestats.mtime.getTime() > 60 * 1000);
//                })
//                .doOnNext(function(result) {
//                  console.log('Deleting ' + fullFilepath);
//                  fs.unlinkSync(fullFilepath);
//                });
//            })
//            .subscribeOnNext(function(result) {
//              // do something
//            });
//        });
//    });
//}
