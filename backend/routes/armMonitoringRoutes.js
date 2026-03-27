const express = require('express');
const router = express.Router();
const { MovingbuildArmInfo } = require('../services/mesStatusService');

router.get('/', (req, res) => {
    res.json({ message: 'arm monitoring api is running' });
});

router.post('/state', (req, res) => {
    const data = req.body["script"];
    MovingbuildArmInfo(data);
    // console.log(`[${ip}] Received Doosan States : ${data}`);
    res.json({result : 'Ok'});
});

module.exports = router;