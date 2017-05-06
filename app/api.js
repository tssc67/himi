const express = require('express');
const migration = require('./migration.js');
var apiRouter = express.Router();

apiRouter
.post('/register',(req,res)=>{
    migration.registerJob(req.body.src,req.body.des,1);
    res.end("Registered");
})

.post('/migrate',(req,res)=>{
    migration.migrate();
    res.end("Migration has started");
})

module.exports = apiRouter; 