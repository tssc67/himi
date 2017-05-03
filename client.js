var http = require('http');
global.cfg = require('config');
require('./app/main.js').start();
function healthcheckHandler(req,res){
    res.end("OK");
}
