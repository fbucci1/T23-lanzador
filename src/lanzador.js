'use strict'

const T23_LA_OUT_FILE='T23_LA_OUT_FILE';
const T23_LA_OUT_FILE_FORMAT=' T23_LA_OUT_FILE_FORMAT';
const T23_LA_ENV_READ_AND_SET_='T23_LA_ENV_READ_AND_SET_';
const T23_LA_CMD_APP='T23_LA_CMD_APP';

var sharedUtils = require('@t23/t23-shared-utils');

/**
**************************
*** Launcher.js
**************************
Example of use:
export T23_SM_PROVIDER=vault
export T23_SM_KEY=app1
export T23_SM_VAULT_ADDR=http://local-vault-server:8200
export T23_SM_VAULT_USER=myuser
export T23_SM_VAULT_PASS=mypassword
export T23_LA_OUT_FILE=./config/config.json
export T23_LA_OUT_FILE_FORMAT=json
export T23_LA_ENV_READ_AND_SET_1="first-secret,T23_SECRET_1"
export T23_LA_ENV_READ_AND_SET_2="second-secret,T23_SECRET_2"
export T23_LA_CMD_APP="node server.js > /tmp/server.js.log 2>&1"
node launcher.js
*/

function readSecretsFromSM(smConfig){
    //If already retrieved, do not retrrieve them again
    if (smConfig._cached_secrets){
        return smConfig._cached_secrets;
    }
    //
    var secretManager = require('@t23/t23-cliente-gestor-secretos');
    var iSecretManager = secretManager.getInstance(smConfig);
    var data=iSecretManager.getSecrets();
    //
    // Cache the response
    smConfig._cached_secrets=data;
    //
    return data;
}

// Retrieve information about configuration file to be generated and generates it if applicable
function readAndPrcessOutFile(smConfig, laConfig){
    // Checks if applpicable
    if (!laConfig[T23_LA_OUT_FILE]){
        console.log('++ Skipping out file creation.');
        return;
    }
    // Read secrets from Secret Manager
    var data=readSecretsFromSM(smConfig);
    //
    // Formtat secrets to expected file format
    var content=null;
    if (!laConfig[T23_LA_OUT_FILE_FORMAT]){
        laConfig[T23_LA_OUT_FILE_FORMAT]='json';
    }
    if (laConfig[T23_LA_OUT_FILE_FORMAT]=='json'){
        content=JSON.stringify(data);
    } else {
        console.error('Output format not supported yet');
        return;
    }
    //
    // Write to file
    const fs = require('fs');
    try {
        var filePath=laConfig[T23_LA_OUT_FILE];
        //
        fs.writeFileSync(filePath, content);
        //
        console.log('++ File generated successfully.');
        //
        var fileContent=sharedUtils.readFile(filePath);
        try {
            var data=JSON.parse(fileContent);
            for (const key in data) {
                console.log('---- File content is '+ sharedUtils.truncador(key) +' ' + sharedUtils.truncador(data[key]));
            }
        } catch (e){
            console.log('---- File content is not JSON '+ sharedUtils.truncador(fileContent));
        }      
    } catch (e) {
      console.error('Fatal error saving to file');
      console.error(e);
      return;
    }
}

// Retrieve information about configuration env vatiables to be generated and generates them if applicable
function readAndPrcessOutEnv(smConfig, laConfig){
    // Read secrets from Secret Manager
    var data=readSecretsFromSM(smConfig);
    //
    var sanityRegex = /^[a-zA-Z0-9-\.\_]+$/;
    Object.keys(process.env).forEach(function(key) {
      if (key.startsWith(T23_LA_ENV_READ_AND_SET_)){ //Expected T23_ENV_READ_AND_SET_1=first-secret,SECRET_1
        if (process.env[key] && process.env[key]!=''){
            var splitted = process.env[key].split(',', 2);
            if (splitted.length!=2){
                throw new Error('Ignoring '+key+'. Value must have a comma. Expected key,key. Found:"'+process.env[key]+'"');
            } else if (!sanityRegex.test(splitted[0])) {
                throw new Error('Ignoring '+key+'. Value 1 does not match regex. Found:"'+splitted[0]+'"');
            } else if (!sanityRegex.test(splitted[1])) {
                throw new Error('Ignoring '+key+'. Value 2 does not match regex. Found:"'+splitted[1]+'"');
            } else {
                var secretName=splitted[0];
                if (!data[secretName]){
                    console.error('Retrieved secret does not contain property '+secretName);
                    //console.error('Secret: '+JSON.stringify(data));
                    throw new Error('Retrieved secret does not contain property '+secretName);
                }
                var value=data[splitted[0]];
                //
                console.log('++ Setting env variable '+splitted[1] + ' ' + sharedUtils.truncador(value) );
                process.env[splitted[1]]=value;
            }    
        }
      }
    });
}
function readAndLaunchApplication(laConfig){
    //
    // Read application to launch
    var cmdApp=laConfig[T23_LA_CMD_APP];
    if (!cmdApp){
        console.log('++ Skipping application launch.');
        return;
    }
    //
    // Execute application
    const { exec } = require('child_process');
    console.log('++ Launching application: '+cmdApp);
    console.log('');
    exec(cmdApp, (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
}


console.log('++ Starting launcher');
//
// Read Secret Manager configuration
var smConfig=sharedUtils.readSMConfiguration();
//
// Read Launcher configuration
var laConfig={};
sharedUtils.readConfiguration(laConfig,'T23_LA_');
//
if(smConfig){
    //
    // Retrieve information about configuration file to be generated and generates it if applicable
    readAndPrcessOutFile(smConfig, laConfig);
    //
    // Retrieve information about configuration env variables to be generated and generates them if applicable
    readAndPrcessOutEnv(smConfig, laConfig);
} else {
    console.log('++ Skipping generating file and env variables as smConfig is null');
}
//
// Retrieve information about application to launch and launch it if applicable
readAndLaunchApplication(laConfig);

//
// Ends
console.log('++ Launcher finished.');
