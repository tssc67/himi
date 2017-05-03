const http = require('http');
const express = require('express');
const ws = require('ws');
const bodyParser = require('body-parser');
var app = express();
var server = http.createServer(app);
// var wss = new ws.Server({server});

app.use(bodyParser.json({limit: '1mb'}));
app.use(bodyParser.urlencoded({ extended: true , limit:'1mb'}));
app.use(express.static(`${process.cwd()}/static`));
app.set('view engine','ejs');
app.set('views', process.cwd() + '/views');
app.disable('view cache');
// app.use((req,res)=>{
//     res.render('index');
// });
// require('./client.js')(wss);
app.use(require('./api.js'));

exports.start = function(){
    server.listen(cfg.web.port);
}