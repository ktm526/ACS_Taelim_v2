const simAmrService = require('../services/simAmrService');

// GET /api/sim-amrs
const getAllSimAmrs = async (req, res, next) => {
  try {
    const simAmrs = await simAmrService.getAllSimAmrs();
    res.json(simAmrs);
  } catch (err) {
    next(err);
  }
};

// GET /api/sim-amrs/:id
const getSimAmrById = async (req, res, next) => {
  try {
    const simAmr = await simAmrService.getSimAmrById(req.params.id);
    if (!simAmr) return res.status(404).json({ message: 'SimAmr not found' });
    res.json(simAmr);
  } catch (err) {
    next(err);
  }
};

// POST /api/sim-amrs
const createSimAmr = async (req, res, next) => {
  try {
    const simAmr = await simAmrService.createSimAmr(req.body);
    res.status(201).json(simAmr);
  } catch (err) {
    next(err);
  }
};

// PUT /api/sim-amrs/:id
const updateSimAmr = async (req, res, next) => {
  try {
    const simAmr = await simAmrService.updateSimAmr(req.params.id, req.body);
    if (!simAmr) return res.status(404).json({ message: 'SimAmr not found' });
    res.json(simAmr);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/sim-amrs/:id
const deleteSimAmr = async (req, res, next) => {
  try {
    const simAmr = await simAmrService.deleteSimAmr(req.params.id);
    if (!simAmr) return res.status(404).json({ message: 'SimAmr not found' });
    res.json({ message: 'SimAmr deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllSimAmrs,
  getSimAmrById,
  createSimAmr,
  updateSimAmr,
  deleteSimAmr,
};
