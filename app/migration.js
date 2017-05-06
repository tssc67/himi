const sshClient = require('ssh2').Client;
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

exports.migrate = function(){
    console.log("Migration started");
    function dumpNode(sshOption,pid){
        var conn = new sshClient();
        return new Promise(function(resolve,reject){
            conn.on('ready', function() {
                console.log("Dumping " + pid);
                conn.exec(`rm -rf ~/img && mkdir ~/img && sudo criu dump -t ${pid} --images-dir ~/img --tcp-established  --shell-job --ext-unix-sk`
                ,{pty:true}, function(err, stream) {
                    if (err) throw err;
                    stream.on('close',()=>{
                        conn.end();
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
                conn.exec(`scp -r ~/img ${src.username}@${src.host}:~`
                ,{pty:true}, function(err, stream) {
                    if (err) throw err;
                    stream.on('close',()=>{
                        conn.end();
                    })
                    stream.on('data', function(data) {
                        data = data.toString();
                        console.log(data.toString());
                        if(data.indexOf('password for')>-1)return stream.write(sshOption.password + '\n')
                         
                    }).stderr.on('data', function(data) {
                        console.log('STDERR: ' + data);
                        return reject(data.toString());
                    });
                });
            }).connect(src)
        }).catch(console.log)
    }
    function restoreNode(sshOption,pid){

    }
    return new Promise(function(resolve,reject){
        jobs.forEach(job=>{
            dumpNode(job.src,job.pid)
            .then(()=>{
                return copyImg(job.src,job.des)
            });
        });
    })
}