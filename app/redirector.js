const net = require('net');


var server = net.createServer(function (socket) {
    socket.on('data',(msg)=>{
        console.log(msg);
        console.log(socket._handle);
        socket.end();
    })
});

server.listen('8989');   