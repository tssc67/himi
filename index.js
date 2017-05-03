switch(process.argv[2]){
    case 'server':
        require('./server.js');
        break;
    case 'destination':
    case 'source':
        require('./client.js');
        break;
}