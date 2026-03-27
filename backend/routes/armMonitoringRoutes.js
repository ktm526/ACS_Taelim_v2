const express = require('express');
const router = express.Router();
const { MovingbuildArmInfo } = require('../services/mesStatusService');

router.get('/', (req, res) => {
    res.json({ message: 'arm monitoring api is running' });
});

router.post('/state', (req, res) => {
    let id = req.body["ID"];
    // console.log(id);
    const data = JSON.parse(req.body["script"]);
    MovingbuildArmInfo(data, id);
    // console.log(`[${ip}] Received Doosan States : ${data}`);
    res.json({result : 'Ok'});
});

module.exports = router;