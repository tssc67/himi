var http = require('http');
global.cfg = require('config');
global.failoverState = 'offline';
const bluebird = require('bluebird');
const redis = require("redis");
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
var workers=[];


if(cluster.isMaster){
    console.log(cfg);
    forkCluster();
    var gossipServer = http.createServer(gossipHandler)
    var healthcheckServer = http.createServer(healthcheckHandler);
    gossipServer.listen(cfg.gossip.port);
    healthcheckServer.listen(cfg.healthcheck.port)
}  

else{
    //Application Logic start here
    var main = require('./app/main.js');
    process.on('message',function(msg){
        switch(msg){
            case 'start':
                main.start();
                break;
        }
    })
} 

function initialize(){
    console.log("Initializing Server");
    if(failoverState=='offline')
    failoverState = 'initial';
    getRemoteFailoverState(0)
    .then(state=>{
        switch(state){
            case 'initial':
                runServer();
                return gossip(0,'run');
            case 'offline':
                if(failoverState=='failover'){
                    return gossip(0,'start')
                    .then(()=>"failover");
                }
                return gossip(0,'start');
            case 'running':
            case 'failover':
                return gossip(0,'replication_request')
                .then(()=>"replicating")
        }
    },errState=>{
        runServer();
        return 'failover';
    }) 
    .then(state=>{
        failoverState = state;
    }).catch(console.log);
}

var started = false;
function runServer(){
    if(started)return;
    started = true;
    setInterval(healthcheck,1000);
    workers.map(worker => worker.send('start'));
    console.log("Server is running");
}

function forkCluster(){
    for(let i = 0;i < numCPUs;++i){
        workers.push(cluster.fork());
    }
    cluster.on('exit',(worker,code,signal)=>{
        console. log(`worker ${worker.process.pid} died`);
    });
    cluster.on('message',(worker,msg)=>{
        if(msg == 'failover' && failoverState != 'sourcing')
            failoverState = 'failover';
    })
}


function healthcheckHandler(req,res){
    res.end("OK");
}

function gossipHandler(req,res){
    if(req.headers.password != cfg.gossip.password){
        res.statusCode = 403;
        return res.end("CHU!");
    }
    switch(req.headers.message){
        case undefined:
            break;
        case 'start':
            initialize();
            break;
        case 'replication_success':
        case 'run':
            failoverState = 'running';
            runServer();
            break;
        case 'replication_request':
            failoverState = 'sourcing';
            replicate();
            break;
    }
    res.end(failoverState);
}

function replicate(){
    // return new Promise(function(resolve,reject){
    //     bluebird.promisifyAll(redis.RedisClient.prototype);
    //     bluebird.promisifyAll(redis.Multi.prototype);
    //     var loredis = redis.createClient(); 
    //     var reredis = redis.createClient({
    //         host:cfg.remote[0]
    //     });
    //     reredis.flushdbAsync()
    //     .then(()=>loredis.keysAsync('*'))
    //     .then(keys=>{
    //         return loredis.migrateAsync(cfg.remote[0],6379,"",0,5000,'COPY','KEYS',...keys);
    //     })
    //     .then(()=>{
    //         gossip(0,"replication_success")
    //         .then(()=>{
    //             failoverState = 'running';
    //         });
    //     })
    // });
}