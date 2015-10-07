# bulk-gpml2biopax-js

Convert GPML to BioPAX in RDF/XML format, in bulk.

## Convert

To convert all curated pathways for a given organism, open main.js
and set the organism. Also, ensure testing mode is false. Then run the following:

```js
node index.js
```

The output BioPAX RDF/XML should be in test/biopax/source-all/...

## Validate

To validate the generated BioPAX and optionally generate auto-fixed BioPAX,
comment out/uncomment the desired sections from run-biopax-validator.js and
then run it:

```js
node lib/run-biopax-validator.js
```
