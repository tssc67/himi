const sshClient = require('ssh2').Client;
const bl = require('bl');
var jobs = [];

exports.registerJob = function(sshSrc,sshDes){
    function checkNodeProcess(sshOption){
        var conn = new sshClient();
        return new Promise(function(resolve,reject){
            conn.on('ready', function() {
                conn.exec('ps -C node | awk \'{print $1}\'', function(err, stream) {
                    if (err) throw err;
                    stream.on('close',()=>{
                        conn.end();
                    })
                    stream.on('data', function(data) {
                        var pidCol = data.toString().split('\n');
                        console.log(pidCol);
                        if(pidCol.length <3)return reject();
                        var pid = pidCol[1];
                        return resolve({
                            src:sshSrc,
                            des:sshDes,
                            pid
                        })
                    }).stderr.on('data', function(data) {
                        console.log('STDERR: ' + data);
                        return reject(data);
                    });
                });
            }).connect(sshOption);      
        });
    }
    return checkNodeProcess(sshSrc)
    .then(passed=>{
        jobs.push(passed)
        console.log(jobs);
    })
    .catch(console.log)
}

var escapeShell = function(cmd) {
  return '"'+cmd.replace(/(["\s'$`\\])/g,'\\$1')+'"';
};

exports.migrate = function(){
    console.log("Migration started");
    //Repetitive code fixed it later . . .
    function dumpNode(sshOption,pid){
        var conn = new sshClient();
        return new Promise(function(resolve,reject){
            conn.on('ready', function() {
                console.log("Dumping " + pid);
                conn.exec(`rm -rf ~/img && mkdir ~/img && sudo criu dump -t ${pid} --images-dir ~/img --tcp-established  --shell-job --ext-unix-sk`
                ,{pty:true}, function(err, stream) {
                    if (err) throw err;
                    stream.on('close',()=>{
                        console.log("stream end");
                        conn.end();
                        resolve();
                    })
                    stream.on('data', function(data) {
                        data = data.toString();
                        console.log(data.toString());
                        if(data.indexOf('password for')>-1)return stream.write(sshOption.password + '\n');
                         
                    }).stderr.on('data', function(data) {
                        console.log('STDERR: ' + data);
                        return reject(data.toString());
                    });
                });
            }).connect(sshOption);      
        }).catch(console.log)
    }
    function copyImg(src,des){
        var conn = new sshClient();
        return new Promise(function(resolve,reject){
            conn.on('ready',function(){
                console.log("Transfering img file")
                conn.exec(`scp -r ~/img ${src.username}@${des.host}:~`
                ,{pty:true}, function(err, stream) {
                    if (err) throw err;
                    stream.on('close',()=>{
                        console.log("stream end");
                        conn.end();
                        resolve();
                    })
                    stream.on('data', function(data) {
                        data = data.toString();
                        process.stdout.write(data);
                        if(data.indexOf('password')>-1)return stream.write(des.password + '\n')
                    }).stderr.on('data', function(data) {
                        console.log('STDERR: ' + data);
                        return reject(data.toString());
                    });
                });
            }).connect(src)
        }).catch(console.log)
    }
    function readInetsk(sshOption){
        var conn = new sshClient();
        return new Promise(function(resolve,reject){
            conn.on('ready', function() {
                console.log("Decoding inetsk");
                conn.exec(`crit decode -i ~/img/inetsk.img --pretty`
                ,{pty:true}, function(err, stream) {
                    if (err) throw err;
                    stream.pipe(bl(function(err,data){
                        if(err)return reject(err)
                        return resolve(JSON.parse(data.toString()));
                    }));
                });
            }).connect(sshOption);      
        }).catch(console.log)  
    }

    function modifyInetsk(sshOption,inetsk){
        var conn = new sshClient();
        return new Promise(function(resolve,reject){
            conn.on('ready',function(){
                console.log("Encoding crit");
                conn.exec(`echo ${escapeShell(inetsk)} | sudo crit encode -o ~/img/inetsk.img`
                ,{pty:true}, function(err, stream) {
                    if (err) throw err;
                    stream.on('data',(data)=>{
                        data = data.toString();
                        console.log(data);
                        if(data.indexOf('password')>-1)return stream.write(sshOption.password + '\n')
                    })
                    stream.on('close',()=>{
                        console.log("stream end");
                        conn.end();
                        resolve();
                    }).stderr.on('data', function(data) {
                        console.log('STDERR: ' + data);
                        return reject(data.toString());
                    });
                });
            }).connect(sshOption)
        }).catch(console.log)
    }
    function restoreNode(sshOption,pid){
        var conn = new sshClient();
        return new Promise(function(resolve,reject){
            conn.on('ready', function() {
                console.log("Restoring " + pid);
                conn.exec(`sudo criu restore -t ${pid} --images-dir ~/img --tcp-established  --shell-job --ext-unix-sk`
                ,{pty:true}, function(err, stream) {
                    if (err) throw err;
                    stream.on('close',()=>{
                        console.log("stream end");
                        resolve();
                        conn.end();
                    })
                    stream.on('error',console.log);
                    stream.on('data', function(data) {
                        data = data.toString();
                        process.stdout.write(data);
                        if(data.indexOf('password for')>-1)return stream.write(sshOption.password + '\n');
                         
                    }).stderr.on('data', function(data) {
                        console.log('STDERR: ' + data);
                        return reject(data.toString());
                    });
                });
            }).connect(sshOption);      
        }).catch(console.log)
    }
    return new Promise(function(resolve,reject){
        jobs.forEach(job=>{
            dumpNode(job.src,job.pid)
            .then(()=>{
                console.log("Changing IP in inetsk")
                return readInetsk(job.src)
            })
            .then(inetsk=>{
                inetsk.entries = inetsk.entries.map(entry=>{
                    if(entry.src_addr[0] == job.src.host)entry.src_addr[0] = job.des.host
                    return entry;
                })
                console.log("New inetsk \n",JSON.stringify(inetsk));
                return modifyInetsk(job.src,JSON.stringify(inetsk));
            }).then(()=>{
                console.log("wtf");
                return copyImg(job.src,job.des)
            }).then(()=>{
                return restoreNode(job.des,job.pid);
            })
        });
    })
}