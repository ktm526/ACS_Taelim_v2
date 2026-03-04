const express = require('express');
const router = express.Router();
const userController = require('../controller/userController');

// 로그인 (구체적 경로 우선)
router.post('/login', userController.login);

// CRUD
router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;
