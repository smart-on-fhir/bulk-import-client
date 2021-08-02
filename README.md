# bulk-import-client
CLI Client app for Bulk Data Import


This is an app that can ping (kick-off) Bulk Data imports pn behalf of a Data
Provider as described [here](https://github.com/smart-on-fhir/bulk-import/blob/master/import-pnp.md#bulk-data-import-kick-off-request-ping-from-data-provider-to-data-consumer).
To do so, it must be registered as a client at the Data Consumer site.


## Installation
```sh
git clone https://github.com/smart-on-fhir/bulk-import-client.git
cd bulk-import-client
```

Once you are into the project folder, make sure you are using NodeJS >= 16. If
you have `nvm` just run `nvm use`. Then install the dependencies:
```sh
npm i
```

## Configuration
Rename the file `example.env` to `.env` and edit is as needed. The default
configuration connects this app to the prototype server at https://bulk-import-consumer.herokuapp.com/,
which imports data from the reference bulk data server at https://bulk-data.smarthealthit.org/.
See comments in the config file for further instructions.

## Usage
The basic usage is (from within the project folder):
```sh
node ./build/ -e 'https://bulk-data-server/$export'
```
This tells the (pre-configured) Data Consumer server to start a dynamic import
from the bulk data server at "https://bulk-data-server/$export".

For more options run:
```sh
node ./build/ --help
```
