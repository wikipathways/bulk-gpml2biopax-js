require('pretty-error').start(); // to make errors more readable
var _ = require('lodash');
var exec = require('child_process').exec;
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var Rx = require('rx');
var RxNode = require('rx-node');
var sax = require('sax');
var saxStreamIsStrict = true;
var strcase = require('tower-strcase');
var VError = require('verror');
var xmldom = require('xmldom');

var filename = 'gpml2biopax-js/lib/biopax-validator.js';

var autofixedDirectoryPath;
var validationReportFullFilepath;
var owlSourcePathAll;
var owlSourcePathErrors;
var owlSourcePathWarningsOnly;
var owlSourcePathNoWarningsNoErrors;
var paxtoolsPath = '/Applications/biopax-validator-4.0.0-SNAPSHOT';
var validationReportDirectoryPath;
var projectDirectoryPath = path.join(__dirname, '..');
var testDirectoryPath = path.join(projectDirectoryPath, 'test');
var iterationPrefix = 'iteration-';

function setDirectory(name, args) {
  var organism = args.organism;
  var outFormat = args.outFormat || 'xml';
  var iteration = args.iteration;

  var organismParamCase = strcase.paramCase(organism);
  var baseDirectoryPath = path.join(testDirectoryPath, 'biopax');

  var directoryPath = path.join(
    baseDirectoryPath, name, organismParamCase, outFormat, iterationPrefix + iteration.toString());

  return Rx.Observable.fromNodeCallback(function(callback) {
    mkdirp(directoryPath, function(err) {
      if (err) {
        var err2 = new VError(err, 'Error checking whether dir ' + directoryPath +
                              ' "%s" exists', filename);
        throw err2;
      }
      return callback(null, directoryPath);
    });
  })();
}

function setDirectories(args) {
  var outFormat = args.outFormat || 'xml';

  var owlArgs = _.clone(args);
  owlArgs.outFormat = 'owl';

  return Rx.Observable.merge(
    setDirectory('source-all', owlArgs)
      .doOnNext(function(value) {
        owlSourcePathAll = value;
        console.log('owlSourcePathAll');
        console.log(owlSourcePathAll);
      }),
    setDirectory('source-errors', owlArgs)
      .doOnNext(function(value) {
        owlSourcePathErrors = value;
      }),
    setDirectory('source-warnings-only', owlArgs)
      .doOnNext(function(value) {
        owlSourcePathWarningsOnly = value;
      }),
    setDirectory('source-no-warnings-no-errors', owlArgs)
      .doOnNext(function(value) {
        owlSourcePathNoWarningsNoErrors = value;
      }),
    setDirectory('auto-fixed', owlArgs)
      .doOnNext(function(value) {
        autofixedDirectoryPath = value;
      }),
    setDirectory('validation-reports', args)
      .doOnNext(function(value) {
        validationReportDirectoryPath = value;
        validationReportFullFilepath = path.join(validationReportDirectoryPath,
                                                'full-directory-report.' + outFormat);
        console.log('validationReportFullFilepath');
        console.log(validationReportFullFilepath);
      })
  )
  .toArray();
}

function convertSaxShapeToJxon(saxData) {
  var jxon = {};
  jxon.yay = {a:1};
  jxon = {};
  var keyValue = saxData.keyValue;
  if (keyValue) {
    jxon.keyValue = keyValue;
  }

  var attributes = saxData.attributes;
  if (attributes) {
    _.pairs(attributes)
      .forEach(function(pair) {
        var attributeName = pair[0];
        var attributeValue = pair[1].value;
        jxon['@' + attributeName] = attributeValue;
      });
  }

  return jxon;
}

function parseSax(args) {
  var filepath = args.filepath;
  // stream usage
  // takes the same options as the parser
  var saxStream = sax.createStream(saxStreamIsStrict, {
    xmlns: true,
    trim: true
  });
  saxStream.on('error', function(err) {
    // unhandled errors will throw, since this is a proper node
    // event emitter.
    var err2 = new VError(err, 'Error saxParser in "%s"', filename);
    console.error('error!', err2.stack);
    // clear the error
    this._parser.error = null;
    this._parser.resume();
  });

  /*
  openTagStream = highland('opentag', saxStream);
  textStream = highland('text', saxStream);
  closeTagStream = highland('closetag', saxStream);
  //*/

  //var eventSource = Rx.Observable.fromEvent(saxStream, 'opentag');
  var eventSource = Rx.Observable.fromEvent(saxStream, 'opentag');

  var elements = {};
  var parentTagNames = [];
  var currentElement;

  /*
  var source = Rx.Observable.fromEventPattern(
    function addHandler(h) {
      saxStream.on('processinginstruction', h);
    },
    function delHandler(h) {
      saxStream.off('end', h);
    });
  //*/
  /*
  function createFromSaxEvent(event) {
    return Rx.Observable.fromEventPattern(
        function addHandler(h) {
          saxStream.on(event, h);
        },
        function delHandler(h) {
          saxStream.off(event, h);
        },
        function(arr) {
          return {
            event: event,
            data: arr
          };
        });
  }
  //*/
  function createFromSaxEvent(event) {
    return Rx.Observable.fromEventPattern(
        function addHandler(h) {
          saxStream.on(event, h);
        })
        .map(function(data) {
          console.log('currentElement156');
          console.log(currentElement);
          return {
            event: event,
            data: data
          };
        });
  }

  var openTagSource = createFromSaxEvent('opentag')
    .map(function(result) {
      var data = result.data;

      currentElement = convertSaxShapeToJxon(data);

      var parent;
      var tagName = currentElement.tagName = data.name;
      currentElement.xpath = parentTagNames.concat([tagName]).join('/');
      if (!data.isSelfClosing) {
        if (!_.isEmpty(parentTagNames)) {
          parent = parentTagNames.reduce(function(accumulator, parentTagName) {
            accumulator = accumulator[parentTagName];
            return accumulator;
          }, elements);
          currentElement.parent = parent;
        } else {
          parent = elements;
        }

        parentTagNames.push(tagName);
        parent[tagName] = currentElement;
      } else {
        console.log('isSelfClosing');
      }
      console.log('currentElement188');
      console.log(currentElement);
      result.currentElement = currentElement;
      console.log('currentElement192');
      console.log(currentElement);

      console.log('currentElement195');
      console.log(currentElement);

      return result;
    });

  var textSource = createFromSaxEvent('text')
    .map(function(result) {
      console.log('currentElement196');
      console.log(currentElement);
      var data = result.data;
      currentElement.keyValue = data;
      console.log('currentElement200');
      console.log(currentElement);
      return result;
    });

  var closeTagSource = createFromSaxEvent('closetag')
    .map(function(result) {
      console.log('currentElement203');
      console.log(currentElement);
      var data = result.data;
      var parent;
      var tagName;

      parentTagNames.pop();
      if (!_.isEmpty(parentTagNames)) {
        parent = parentTagNames.reduce(function(accumulator, parentTagName) {
          accumulator = accumulator[parentTagName];
          return accumulator;
        }, elements);
        currentElement.parent = parent;
      } else {
        parent = elements;
      }

      tagName = data.value;
      delete parent[tagName];

      result.currentElement = currentElement;
      console.log('currentElement221');
      console.log(currentElement);
      return result;
    });

  var endSource = createFromSaxEvent('end');

  var source = Rx.Observable.merge(openTagSource, textSource, closeTagSource)
    .takeUntil(endSource);

  var eventStream = fs.createReadStream(filepath)
    .pipe(saxStream);

  return source;
}

function validateWithClient(args) {
  var organism = args.organism;
  var identifier = args.identifier;
  var outFormat = args.outFormat || 'xml';

  return setDirectories(args)
    .map(function() {
      var javaCommand = 'java -jar biopax-validator-client.jar ' +
          path.join(owlSourcePathAll, identifier + '.owl') + ' ' +
          path.join(validationReportDirectoryPath, identifier + '.' + outFormat) + ' ' +
            'xml notstrict only-errors ';

      var commands = [
        'cd ' + paxtoolsPath,
        javaCommand,
        'cd ' + projectDirectoryPath
      ].join(' && ');

      return commands;
    })
    .flatMap(function(commands) {
      return Rx.Observable.fromNodeCallback(function(callback) {
        var child = exec(commands,
          function(err, stdout, stderr) {
            if (err) {
              var err2 = new VError(err, 'exec error for commands ' + commands +
                                    ' in "%s"', filename);
              console.log(err2.stack);
            }
            return callback(null, stdout);
          });
      })();
    });
}

function validateWithLocalJar(args) {
  args = args || {};
  var autoFix = args.autoFix || '';
  var organism = args.organism;
  var outFormat = args.outFormat = (args.outFormat || 'xml');
  var profile = args.profile || 'notstrict';

  return setDirectories(args)
    .map(function() {
      var javaCommand =
        'sh ' + path.join(paxtoolsPath, 'validate-patched-local.sh') + ' ' +
            owlSourcePathAll + ' ' +
        '--output=' + validationReportFullFilepath + ' ' +
        '--out-format=' + outFormat + ' ' +
        '--profile=' + profile + ' ';

      javaCommand = !!autoFix ? javaCommand + ' --auto-fix ' : javaCommand;

      var commands = ['cd ' + paxtoolsPath,
        'export JAVA_HOME=java',
        javaCommand,
        'cd ' + projectDirectoryPath].join(' && ');

      console.log('commands');
      console.log(commands);

      return commands;
    })
    .flatMap(function(commands) {
      return Rx.Observable.fromNodeCallback(function(callback) {
        var child = exec(commands,
          function(err, stdout, stderr) {
            if (err) {
              var err2 = new VError(err, 'exec error for commands ' + commands +
                                    ' in "%s"', filename);
              console.log(err2.stack);
            }
            return callback(null, stdout);
          });
      })();
    })
    .toArray()
    .flatMap(function(result) {
      return Rx.Observable.fromNodeCallback(fs.readdir)(paxtoolsPath)
        .map(function(filenameList) {
          return Rx.Observable.fromArray(filenameList);
        })
        .mergeAll()
        .filter(function(filepath) {
          return filepath.match(/\.owl$/);
        })
        .map(function(filepath) {
          var filepathComponents = path.parse(filepath);
          var filename = filepathComponents.name;
          var ext = filepathComponents.ext;
          var identifier = filepath.match(/WP\d+/)[0];
          var newFilepath = identifier + ext;
          // NOTE: The auto-fixed BioPAX OWL files are saved to
          // the paxtools directory, so we move them to their
          // appropriate directory here.
          var sourceAutoFixedFilepath = path.join(paxtoolsPath, filepath);
          var outputAutoFixedFilepath = path.join(autofixedDirectoryPath, newFilepath);
          var biopaxString = fs.readFileSync(sourceAutoFixedFilepath);
          fs.writeFileSync(outputAutoFixedFilepath, biopaxString, 'utf8');
          fs.unlinkSync(sourceAutoFixedFilepath);

          /* I don't think the section below is needed.
          if (outFormat === 'HTML') {
            var identifier = filepath.match(/WP\d+/)[0];
            var htmlFilePath = identifier + '.html';
            var sourceHtmlReportFilepath = path.join(paxtoolsPath, htmlFilePath);
            var outputHtmlReportFilepath = path.join(validationReportDirectoryPath, htmlFilePath);
            var outputString = fs.readFileSync(sourceHtmlReportFilepath);
            fs.writeFileSync(outputHtmlReportFilepath, outputString, 'utf8');
            fs.unlinkSync(sourceHtmlReportFilepath);
          }
          //*/
          return true;
        });
        /*
        .toArray()
        .flatMap(function(result) {
          // NOTE: it appears necessary to move the generated HTML format
          // validation reports from the paxtools directory into their
          // appropriate directory. I don't know how to send them directly
          // to the desired directory.
          var paxtoolsPath = '/Applications/biopax-validator-4.0.0-SNAPSHOT/';
          return Rx.Observable.fromNodeCallback(fs.readdir)(paxtoolsPath)
            .map(function(filenameList) {
              return Rx.Observable.fromArray(filenameList);
            })
            .mergeAll()
            .filter(function(path) {
              return path.match(/\.html$/);
            })
            .map(function(path) {
              var htmlString = fs.readFileSync(paxtoolsPath + path);
              var outputDirectoryPath = path.join('validation-reports', organismParamCase,
                                                  'html', iterationPrefix + iteration);
              fs.writeFileSync(outputDirectoryPath,
                               htmlString, 'utf8');
              fs.unlinkSync(paxtoolsPath + path);
              return true;
            });
        });
        //*/
    });
}

function extractErrorsByPathway(args) {
  var organism = args.organism;

  var saxSource = setDirectories(args)
    .flatMap(function() {
      return parseSax({
        filepath: validationReportFullFilepath
      });
    });

  /*
  var biopaxErrorSource = saxSource.filter(function(item) {
      return item.event === 'opentag' &&
        item.data.xpath === 'validatorResponse/validation/error';
    })
    .filter(function(item) {
      return item.data.attributes.type &&
        item.data.attributes.type.value === 'ERROR';
    })
    .map(function(item) {
      return item.data;
    })
    .map(function(item) {
      var parent = item.parent;
      var entry = {
        description: parent.attributes.description.value,
        code: item.attributes.code.value,
        notFixedCases: parseFloat(item.attributes.notFixedCases.value)
      };
      return entry;
    })
    .toArray();
  //*/

  /*
  var biopaxMessageSource = saxSource
    .filter(function(item) {
      return item.event === 'opentag' &&
        item.data.xpath === 'validatorResponse/validation/error/errorCase/message';
    })
    .map(function(item) {
      return item.data;
    })
    .toArray()
    .map(function(result) {
      var jsonString = JSON.stringify(result, null, '  ');
      console.log('jsonString');
      console.log(jsonString);
      var summaryPath = path.join(validationReportDirectoryPath, 'summary-stats.json');
      fs.writeFileSync(summaryPath, jsonString, 'utf8');
    })
    .doOnError(function(err) {
      var err2 = new VError(err, 'Unspecified error in extractErrors Observable in "%s"', filename);
      throw err2;
    });
    //*/

  //return biopaxMessageSource;
  return saxSource
    .filter(function(item) {
      return item.event === 'closetag' &&
        item.currentElement.xpath === 'validatorResponse';
    })
    .map(function(entry) {
      console.log('entry406');
      console.log(entry);
      return entry.currentElement;
    })
    .map(function(jxon) {
      console.log('currentElement411');
      console.log(jxon);
      return jxon;
    });
}

/*
function extractErrorsOld(args) {
  var organism = args.organism;

  return setDirectories(args)
    .flatMap(function() {
      return parseSax({
        filepath: validationReportFullFilepath
      });
    })
    .filter(function(item) {
      return item.event === 'opentag' &&
        item.data.xpath === 'validatorResponse/validation/error';
    })
    .filter(function(item) {
      return item.data.attributes.type &&
        item.data.attributes.type.value === 'ERROR';
    })
    .map(function(item) {
      return item.data;
    })
    .map(function(item) {
      var parent = item.parent;
      var entry = {
        description: parent.attributes.description.value,
        code: item.attributes.code.value,
        notFixedCases: parseFloat(item.attributes.notFixedCases.value)
      };
      return entry;
    })
    .reduce(function(accumulator, element) {
      accumulator.push(element);
      return accumulator;
    }, [])
    .map(function(result) {
      var jsonString = JSON.stringify(result, null, '  ');
      console.log('jsonString');
      console.log(jsonString);
      var summaryPath = path.join(validationReportDirectoryPath, 'summary-stats.json');
      fs.writeFileSync(summaryPath, jsonString, 'utf8');
    })
    .doOnError(function(err) {
      var err2 = new VError(err, 'Unspecified error in extractErrors Observable in "%s"', filename);
      throw err2;
    });
}
//*/

function categorizePathwaysByValidationResult(args) {
  return setDirectories(args)
    .flatMap(function() {
      var validationReport = fs.readFileSync(validationReportFullFilepath, 'utf8');
      var DOMParser = xmldom.DOMParser; // jshint ignore:line
      var doc = new DOMParser().parseFromString(validationReport, 'text/xml');
      var validationElements = doc.getElementsByTagName('validation');
      var errorsAndWarningsByPathway = _(validationElements)
        .map(function(validationElement) {
          var description = validationElement.getAttribute('description');
          var identifier = description.match(/WP\d+/)[0];
          var pathwayFilepath = description.match(/file:(\/.*\.owl)/)[1];
          var errorAndWarningClasses = _(validationElement.getElementsByTagName('error'))
            .map(function(errorElement) {
              var errorAndWarningCases = _(errorElement.getElementsByTagName('errorCase'))
                .map(function(errorAndWarningCase) {
                  var textContent = errorAndWarningCase.textContent;
                  if (textContent === '\n                \n            ') {
                    textContent = null;
                  }
                  return {
                    object: errorAndWarningCase.getAttribute('object'),
                    textContent: textContent
                  };
                })
                .value();

              return {
                code: errorElement.getAttribute('code'),
                message: errorElement.getAttribute('message'),
                type: errorElement.getAttribute('type'),
                cases: errorAndWarningCases
              };
            })
            .value();

          var errors = errorAndWarningClasses.filter(function(errorAndWarningClass) {
            return errorAndWarningClass.type === 'ERROR';
          });
          var warnings = errorAndWarningClasses.filter(function(errorAndWarningClass) {
            return errorAndWarningClass.type === 'WARNING';
          });

          var result = {};
          result.identifier = identifier;
          result.filepath = pathwayFilepath;
          if (!_.isEmpty(errors)) {
            result.errors = errors;
          }
          if (!_.isEmpty(warnings)) {
            result.warnings = warnings;
          }

          return result;
        })
        .value();

      var errorsAndWarningsByPathwayString = JSON.stringify(errorsAndWarningsByPathway, null, '  ');

      var errorSummaryPath = validationReportFullFilepath
        .replace('full-directory-report.xml', 'issues-by-pathway.json');
      fs.writeFileSync(errorSummaryPath, errorsAndWarningsByPathwayString, 'utf8');

      var errorPartition = Rx.Observable.fromArray(
          errorsAndWarningsByPathway)
        .partition(function(item) {
          return !_.isEmpty(item.errors);
        });

      var errorsSource = errorPartition[0]
        .map(function(item) {
          item.directoryNamespace = 'errors';
          return item;
        });

      var warningsOrNothingPartition = errorPartition[1]
        .partition(function(item) {
          return !_.isEmpty(item.warnings);
        });

      var warningsSource = warningsOrNothingPartition[0]
        .map(function(item) {
          item.directoryNamespace = 'warnings-only';
          return item;
        });

      var noWarningsNoErrorsSource = warningsOrNothingPartition[1]
        .map(function(item) {
          item.directoryNamespace = 'no-warnings-no-errors';
          return item;
        });

      return Rx.Observable.merge(
        errorsSource,
        warningsSource,
        noWarningsNoErrorsSource
      )
        .doOnNext(function(item) {
          var identifier = item.identifier;
          var sourceFilepath = item.filepath;

          var filepathComponents = path.parse(sourceFilepath);
          var filename = filepathComponents.name;
          var newFilename = identifier;

          var rawTargetFilepath = sourceFilepath
              .replace(/source-all/, 'source-' + item.directoryNamespace)
              .replace(filename, newFilename);
          var rawTargetDir = path.dirname(rawTargetFilepath);
          Rx.Observable.fromNodeCallback(fs.readdir)(rawTargetDir)
            .flatMap(function(filepathList) {
              return Rx.Observable.from(filepathList);
            })
            .filter(function(filepath) {
              return filepath.match(/\.owl$/);
            })
            .flatMap(function(filepath) {
              var fullFilepath = path.join(rawTargetDir, filepath);
              return Rx.Observable.fromNodeCallback(fs.stat)(fullFilepath)
                .filter(function(filestats) {
                  var now = new Date().getTime();
                  return filestats.isFile() && (now - filestats.mtime.getTime() > 60 * 1000);
                })
                .doOnNext(function(result) {
                  console.log('Deleting ' + fullFilepath);
                  fs.unlinkSync(fullFilepath);
                });
            })
            .subscribeOnNext(function(result) {
              // do something
            });

          fs.createReadStream(sourceFilepath)
            .pipe(fs.createWriteStream(rawTargetFilepath));

          var modifiedSourceFilepath = sourceFilepath
              .replace(/source-all/, 'auto-fixed')
              .replace(filename, newFilename);

          var modifiedTargetFilepath = modifiedSourceFilepath
              .replace(/auto-fixed/, 'auto-fixed-' + item.directoryNamespace);
          fs.createReadStream(modifiedSourceFilepath)
            .pipe(fs.createWriteStream(modifiedTargetFilepath));

          var modifiedTargetDir = path.dirname(modifiedTargetFilepath);
          Rx.Observable.fromNodeCallback(fs.readdir)(modifiedTargetDir)
            .flatMap(function(filepathList) {
              return Rx.Observable.from(filepathList);
            })
            .filter(function(filepath) {
              return filepath.match(/\.owl$/);
            })
            .flatMap(function(filepath) {
              var fullFilepath = path.join(modifiedTargetDir, filepath);
              return Rx.Observable.fromNodeCallback(fs.stat)(fullFilepath)
                .filter(function(filestats) {
                  var now = new Date().getTime();
                  return filestats.isFile() && (now - filestats.mtime.getTime() > 60 * 1000);
                })
                .doOnNext(function(result) {
                  console.log('Deleting ' + fullFilepath);
                  fs.unlinkSync(fullFilepath);
                });
            })
            .subscribeOnNext(function(result) {
              // do something
            });
        });
    });
}

function getValidationSummaryStats(args) {
  return setDirectories(args)
    .flatMap(function() {
      return Rx.Observable.fromNodeCallback(fs.readdir)(owlSourcePathAll)
        .flatMap(function(filenameList) {
          return Rx.Observable.from(filenameList);
        })
        .filter(function(filename) {
          return filename.match(/\.owl$/);
        })
        .toArray()
        .map(function(filenameList) {
          return filenameList.length;
        });
    })
    .map(function(pathwayCountFromDirectoryItemsCount) {
      var validationReport = fs.readFileSync(validationReportFullFilepath, 'utf8');
      var DOMParser = xmldom.DOMParser; // jshint ignore:line
      var doc = new DOMParser().parseFromString(validationReport, 'text/xml');

      var validationElements = doc.getElementsByTagName('validation');
      var pathwayCount = validationElements.length;

      if (pathwayCount !== pathwayCountFromDirectoryItemsCount) {
        var message = 'Pathway counts do not match. From dir contents ' +
            pathwayCountFromDirectoryItemsCount +
            ' vs. from validation report ' + pathwayCount + ')';
        throw new Error(message);
      }

      var summaryStats = {};
      summaryStats.byPathway = {};
      summaryStats.byPathway.total = pathwayCount;

      var pathwaysByValidationCategory = _.map(validationElements, function(validationElement) {
        var resultByPathway = {};
        var description = validationElement.getAttribute('description');
        var identifier = description.match(/WP\d+/)[0];
        resultByPathway.identifier = identifier;

        var errorElements = validationElement.getElementsByTagName('error');

        var pathwayResultsByType = _.pairs(
          _.groupBy(errorElements, function(errorElement) {
              return errorElement.getAttribute('type');
            }))
        .reduce(function(accumulator, pair) {
          var key = pair[0];
          var count = pair[1].length;
          accumulator[key] = count;
          return accumulator;
        }, {});

        console.log('pathwayResultsByType');
        console.log(pathwayResultsByType);

        if (pathwayResultsByType.ERROR) {
          resultByPathway.validationCategory = 'hasErrors';
        } else if (pathwayResultsByType.WARNING) {
          resultByPathway.validationCategory = 'hasWarningsButNoErrors';
        } else {
          resultByPathway.validationCategory = 'noIssues';
        }

        return resultByPathway;
      });

      summaryStats.byPathway.countsByValidationCategory =
          _.countBy(pathwaysByValidationCategory, 'validationCategory');
      if (_.isUndefined(summaryStats.byPathway.countsByValidationCategory.noIssues)) {
        summaryStats.byPathway.countsByValidationCategory.noIssues = 0;
      }

      var errorElements = doc.getElementsByTagName('error');

      /*
      var errorAndWarningTotals = _.countBy(validationElements, function(validationElement) {
        return validationElement.getAttribute('type');
      });
      //*/

      summaryStats.byIssue = _.pairs(
        _.groupBy(errorElements, function(errorElement) {
            return errorElement.getAttribute('type');
          }))
        .reduce(function(accumulator, pair) {
          var key = pair[0];
          var value = pair[1];
          var result = {};
          result.count = value.length;

          var resultsGroupedByCode = _.groupBy(value, function(validationElement) {
            return validationElement.getAttribute('code');
          });

          result.uniqueCodeCount = _.keys(resultsGroupedByCode).length;

          result.countsByCode = _.pairs(resultsGroupedByCode)
            .reduce(function(innerAccumulator, pair) {
              var key = pair[0];
              var count = pair[1].length;
              innerAccumulator[key] = count;
              return innerAccumulator;
            }, {});

          accumulator[key] = result;
          return accumulator;
        }, {});

      var jsonString = JSON.stringify(summaryStats, null, '  ');

      var summaryPath = path.join(validationReportDirectoryPath, 'summary-stats.json');
      fs.writeFileSync(summaryPath, jsonString, 'utf8');
    });
}

module.exports = {
  categorizePathwaysByValidationResult: categorizePathwaysByValidationResult,
  getValidationSummaryStats: getValidationSummaryStats,
  extractErrorsByPathway: extractErrorsByPathway,
  setDirectories: setDirectories,
  validateWithClient: validateWithClient,
  validateWithLocalJar: validateWithLocalJar
};
