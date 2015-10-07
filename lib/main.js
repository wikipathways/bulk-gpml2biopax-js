require('pretty-error').start(); // to make errors more readable
var _ = require('lodash');
var AdmZip = require('adm-zip');
var biopaxValidator = require('./biopax-validator.js');
var gpml2pvjson = require('gpml2pvjson');
var pvjson2biopax = require('pvjson2biopax');
var fs = require('fs');
var highland = require('highland');
var jsonld = require('jsonld');
var path = require('path');
var pd = require('pretty-data').pd;
var request = require('request');
var Rx = require('rx');
var RxNode = require('rx-node');
var strcase = require('tower-strcase');
var utils = require('../node_modules/gpml2pvjson/lib/utils.js');
var uuid = require('uuid');
var VError = require('verror');

var filename = 'bulk-gpml2biopax-js/lib/main.js';

var dereferenceElement = utils.dereferenceElement;

var biopaxEdgeTypes = utils.biopax.edgeTypes;
var biopaxNodeTypes = utils.biopax.nodeTypes;
var biopaxTypes = utils.biopax.allTypes;
var gpmlDataNodeTypeToBiopaxEntityTypeMappings =
    utils.gpmlDataNodeTypeToBiopaxEntityTypeMappings;

//*
// SETTINGS
var defaultConsole = console;

var organism = 'Homo sapiens';
//var organism = 'Mus musculus';

var testingMode = !true;
var overwrite = !true || testingMode;
var muteConsole = testingMode ? false : true;
var iteration = 'js0';
var iterationPrefix = 'iteration-';

var autoFix = true;
var outFormat = 'xml';

var samplePathwaysToTest;
if (testingMode) {
  organism = 'Homo sapiens';
  samplePathwaysToTest = [{
    db: 'wikipathways',
    identifier: 'WP3407',
    version: '0',
    organism: organism
  }];
}

var organismParamCase = strcase.paramCase(organism);
var organismUpperSnakeCase = organism.replace(' ', '_');

var testDirectoryPath = path.join(__dirname, '..', 'test');
var biopaxBasePath;
var gpmlSourcePath;
var owlSourcePath;

gpmlSourcePath = path.join(testDirectoryPath, 'input/wikipathways_' +
  organismUpperSnakeCase + '_Curation-AnalysisCollection__gpml');

var biopaxBasePath = path.join(testDirectoryPath, 'biopax');

owlSourcePath = path.join(
  biopaxBasePath, 'source-all', organismParamCase, 'owl', iterationPrefix + iteration);
// END SETTINGS
//*/

function createFromEvent(event, stream) {
  return Rx.Observable.fromEventPattern(
      function addHandler(h) {
        stream.on(event, h);
      });
}

// this works, but it requires munging "SBO:" to "SBO". output is rdf/xml
function gpml2biopax(pathwayMetadata) {

  /*
  // For quick access to those namespaces:
  var FOAF = $rdf.Namespace('http://xmlns.com/foaf/0.1/');
  var RDF = $rdf.Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
  var RDFS = $rdf.Namespace('http://www.w3.org/2000/01/rdf-schema#');
  var OWL = $rdf.Namespace('http://www.w3.org/2002/07/owl#');
  var DC = $rdf.Namespace('http://purl.org/dc/elements/1.1/');
  var RSS = $rdf.Namespace('http://purl.org/rss/1.0/');
  var XSD = $rdf.Namespace('http://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dt-');
  //*/

  var referenceTypes = [
    'ProteinReference',
    'SmallMoleculeReference',
    'DnaReference',
    'RnaReference'
  ];

  function duplicateElement(elements, id) {
    var originalElement = dereferenceElement(elements, id);
    var newElement = _.clone(originalElement);
    var newId = uuid.v4();
    newElement.id = newId;
    elements.push(newElement);
    return newElement;
  }

  return Rx.Observable.return(pathwayMetadata)
    .flatMap(function(pathway) {
      var identifier = pathway.identifier;
      var version = pathway.version || 0;

      var gpmlLocation = path.join(gpmlSourcePath, pathway.identifier + '.gpml');
      // Disable the above and enable the following line to use the playground gpml file.
      //var gpmlLocation = path.join(testDirectoryPath, 'input', 'playground.gpml');

      var gpmlChunkStream = highland(fs.createReadStream(gpmlLocation));

      if (muteConsole) {
        delete global.console;
        global.console = {};
        global.console.log = global.console.warn = global.console.error = function() {};
      }
      /* // TODO test to ensure the code below works or delete it.
         // It is intended to allow for just getting one WikiPathways pathway
         // from the webservice.
      var gpmlLocation = 'http://www.wikipathways.org/wpi/wpi.php' +
          '?action=downloadFile&type=gpml&pwTitle=Pathway:' +
          identifier + '&oldid=' + version;
      var gpmlChunkSource = RxNode.fromReadableStream(fs.createReadStream(gpmlLocation))
        .doOnError(
            function(err) {
              var err2 = new VError(err, 'failed to get GPML in "%s"', filename);
              console.error(err2.stack);
            }
        )
        .filter(function(gpmlChunk) {
          // don't return empty chunks
          return gpmlChunk;
        });
        //*/
        /*
        .map(function(data) {
          console.log('Disabling console logging...');
          delete global.console;
          global.console = {};
          global.console.log = global.console.warn = global.console.error = function() {};
          return data;
        });
        //*/
      return gpml2pvjson.gpmlToPvjsonSource(gpmlChunkStream)
        .doOnError(
            function(err) {
              var err2 = new VError(err, 'error (after?) converting GPML to ' +
                                    'pvjson in "%s"', filename);
              console.error(err2.stack);
            }
        )
        .map(function(data) {
          if (muteConsole) {
            global.console = defaultConsole;
          }
          return data;
        })
        .map(function(pvjson) {
          var pathwayIri = !!identifier ?
              'http://identifiers.org/wikipathways/' +
              identifier : gpmlLocation;
          pvjson.id = pathwayIri;
          pvjson.version = version;

          pvjson['@context'].filter(function(contextElement) {
            return contextElement.hasOwnProperty('@base');
          })
          .map(function(baseElement) {
            baseElement['@base'] = pathwayIri + '/';
          });

          return pvjson;
        });
    })
    .doOnError(
        function(err) {
          var err2 = new VError(err, 'failed to convert GPML to pvjson in "%s"', filename);
          throw err2;
        }
    )
    /* // TODO either make sure the following works or else delete it.
       // This is intended to save to disk the pvjson for each pathway.
    .map(function(pvjson) {
      var jsonldOutputPath = './gpml2pvjson-v2-output/' + pathwayMetadata.identifier + '.json';
      var jsonldOutput = fs.createWriteStream(jsonldOutputPath);
      var jsonldString = JSON.stringify(pvjson, null, '  ');
      fs.writeFileSync(jsonldOutputPath, jsonldString, 'utf8');
      return pvjson;
    })
    //*/
    .flatMap(function(pvjson) {
      if (testingMode) {
        console.log('pvjson');
        console.log(JSON.stringify(pvjson, null, '  '));
      }
      return pvjson2biopax.pvjson2biopax(pathwayMetadata, pvjson);
    })
    .doOnError(
        function(err) {
          var err2 = new VError(err, 'failed to convert pvjson to BioPAX in "%s"', filename);
          throw err2;
        }
    );
}

/*****************************
 * Source data
 ****************************/

var pathwaysToTestSource;

var gpmlSource;
var dirStats;
try {
  dirStats = fs.statSync(gpmlSourcePath);
} catch (err) {
  dirStats = false;
}

var availableIdentifierSource;
if (!overwrite && dirStats && dirStats.nlink > 5) {
  // Use pre-downloaded pathway set
  availableIdentifierSource = Rx.Observable.fromNodeCallback(fs.readdir)(gpmlSourcePath)
    .map(function(filenameList) {
      return Rx.Observable.fromArray(filenameList);
    })
    .mergeAll()
    .filter(function(identifier) {
      return identifier.match(/\.gpml$/);
    })
    .map(function(path) {
      var identifier = path.match(/WP\d+/)[0];
      return identifier;
    });
} else {
  // Download pathway set, unzip, rename and save files, return identifiers
  console.log('Downloading bulk GPML data...');
  var tmpZipFilePath = './tmp-zip-file-for-download.zip';
  var bulkDownloadUrl = 'http://www.wikipathways.org//wpi/batchDownload.php?species=' +
    organism + '&fileType=gpml&tag=Curation:AnalysisCollection';
  var requestSource = RxNode.fromReadableStream(request(bulkDownloadUrl));

  var writeStream = fs.createWriteStream(tmpZipFilePath);
  var req = request(bulkDownloadUrl);
  availableIdentifierSource = createFromEvent('finish', req.pipe(writeStream))
    // we just need the first "finish" event here, because it's the only one,
    // but the request stream doesn't appear to end on its own for some reason.
    .first()
    .flatMap(function() {
      var zip = new AdmZip(tmpZipFilePath);
      return Rx.Observable.fromArray(zip.getEntries())
        .flatMap(function(zipEntry) {
          var entryName = zipEntry.entryName;
          var identifier = entryName.match(/WP\d+/)[0];
          var gpmlString = zip.readAsText(entryName);
          return Rx.Observable.fromNodeCallback(fs.writeFile)(
            path.join(gpmlSourcePath, identifier + '.gpml'),
            gpmlString,
            'utf8'
          )
            .map(function() {
              return identifier;
            });
        });
    });

}

// regardless of whether pathways come from online or local files,
// we generate the metadata for them.
var pathwaysToTestSource = availableIdentifierSource
  .map(function(identifier) {
    var metadata = {
      db: 'wikipathways',
      identifier: identifier,
      version: '0',
      organism: organism
    };
    return metadata;
  })
  .filter(function(metadata) {
    return !testingMode || samplePathwaysToTest
      .map(function(metadata) {
        return metadata.identifier;
      }).indexOf(metadata.identifier) > -1;
  })
  .toArray();

// If "overwrite" is not activated, we want to avoid running the
// converter for pathways that have already been converted
var pathwaysCompletedSource = Rx.Observable.fromNodeCallback(fs.readdir)(
    owlSourcePath)
  .defaultIfEmpty([null])
  .map(function(filenameList) {
    return Rx.Observable.fromArray(filenameList);
  })
  .mergeAll()
  .map(function(filename) {
    return filename.replace('.owl', '');
  })
  .toArray();

var pathwayMetadataSource = Rx.Observable.zip(
      pathwaysToTestSource,
      pathwaysCompletedSource,
      function(pathwaysToTest, pathwaysCompleted) {
        return [pathwaysToTest, pathwaysCompleted];
      }
  )
  .map(function(result) {
    var pathwaysToTest = result[0];
    var pathwaysCompleted = result[1];
    return pathwaysToTest.filter(function(metadata) {
      return overwrite ||
          pathwaysCompleted.indexOf(metadata.identifier) === -1;
    });
  })
  .map(function(metadataList) {
    return Rx.Observable.fromArray(metadataList);
  })
  .mergeAll()
  .map(function(metadata) {
    metadata.version = 0;
    return metadata;
  })
  .map(function(metadata) {
    var outputPath = path.join(owlSourcePath, metadata.identifier + '.owl');
    metadata.outputPath = outputPath;
    return metadata;
  })
  .filter(function(metadata) {
    return metadata.organism === organism;
  })
  .doOnError(
      function(err) {
        var err2 = new VError(err, 'failed to get metadata in "%s"', filename);
        throw err2;
      }
  )
  .retryWhen(function(attempts) {
    return Rx.Observable.range(1, 3)
      .map(function(i) {
        return i * 3;
      })
      .zip(attempts, function(i) {
        return i;
      })
      .flatMap(function(i) {
        console.log('996delay retry by ' + i + ' second(s)');
        return Rx.Observable.timer(i * 1000);
      });
  })
  .controlled();

var biopaxSource = pathwayMetadataSource
  .flatMap(function(metadata) {
    var identifier = metadata.identifier;
    console.log('Processing ' + identifier + '...');
    return gpml2biopax(metadata)
      .doOnError(
          function(err) {
            var err2 = new VError(err, 'error (after?) converting GPML to BioPAX for ' +
                                  identifier + ' in "%s"', filename);
            throw err2;
          }
      )
      //*
      .retryWhen(function(attempts) {
        return Rx.Observable.range(1, 3)
          .map(function(i) {
            return i * 3;
          })
          .zip(attempts, function(i) {
            return i;
          })
          .flatMap(function(i) {
            console.log('1023delay retry by ' + i + ' second(s)');
            return Rx.Observable.timer(i * 1000);
          });
      })
      //*/
      .doOnNext(
          function(s) {
            pathwayMetadataSource.request(1);
          }
      )
      .filter(function(biopaxRdfXml) {
        return biopaxRdfXml;
      })
      .map(function(biopaxRdfXml) {
        return {
          biopaxRdfXml: biopaxRdfXml,
          metadata: metadata
        };
      });
  })
  .doOnError(
      function(err) {
        var err2 = new VError(err, 'failed to convert GPML to BioPAX ' +
                              'in "%s"', filename);
        throw err2;
      }
  );

biopaxSource
  .doOnNext(function(biopaxResponse) {
    var biopaxRdfXml = biopaxResponse.biopaxRdfXml;
    var metadata = biopaxResponse.metadata;
    if (!testingMode) {
      return Rx.Observable.fromNodeCallback(fs.writeFile)(
          metadata.outputPath, biopaxRdfXml, 'utf8')
        .subscribeOnNext();
    } else {
      console.log('biopaxRdfXml');
      console.log(biopaxRdfXml);
    }
  })
  .flatMap(function(biopaxResponse) {
    var biopaxRdfXml = biopaxResponse.biopaxRdfXml;
    var metadata = biopaxResponse.metadata;
    /* TODO get this working or delete it
    if (testingMode) {
      // When using the code below, we might get an error,
      // possibly from from changing the CWD
      return biopaxValidator.validateWithClient({
        autoFix: true,
        identifier: metadata.identifier,
        organism: organism,
        iteration: iteration
      });
    }
    //*/
    return Rx.Observable.empty();
  })
  .toArray()
  .flatMap(function(data) {
    if (!testingMode) {
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
    } else {
      return Rx.Observable.empty();
    }
    return Rx.Observable.empty();
  })
  .subscribe(function() {
    console.log('Iteration Completed...');
  }, function(err) {
    var err2 = new VError(err, 'Error in biopaxSource Observable in "%s"', filename);
    throw err2;
  }, function() {
    console.log('Done');
  });

pathwayMetadataSource.request(1);
