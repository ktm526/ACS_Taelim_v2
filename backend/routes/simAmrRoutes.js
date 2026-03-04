const express = require('express');
const router = express.Router();
const simAmrController = require('../controller/simAmrController');

router.get('/', simAmrController.getAllSimAmrs);
router.get('/:id', simAmrController.getSimAmrById);
router.post('/', simAmrController.createSimAmr);
router.put('/:id', simAmrController.updateSimAmr);
router.delete('/:id', simAmrController.deleteSimAmr);

module.exports = router;
