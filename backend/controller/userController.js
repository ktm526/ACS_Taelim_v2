const userService = require('../services/userService');

// GET /api/users
const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
};

// GET /api/users/:id
const getUserById = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// POST /api/users
const createUser = async (req, res, next) => {
  try {
    const { username, password, role, name } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'username and password are required' });
    }
    const user = await userService.createUser({ username, password, role, name });
    res.status(201).json(user);
  } catch (err) {
    // unique 제약 위반
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'Username already exists' });
    }
    next(err);
  }
};

// PUT /api/users/:id
const updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/users/:id
const deleteUser = async (req, res, next) => {
  try {
    const user = await userService.deleteUser(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// POST /api/users/login
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'username and password are required' });
    }
    const user = await userService.login(username, password);
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }
    res.json({ message: 'Login successful', user });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  login,
};
