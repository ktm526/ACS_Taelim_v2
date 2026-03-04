const mapService = require('../services/mapService');

// GET /api/maps
const getAllMaps = async (req, res, next) => {
  try {
    const maps = await mapService.getAllMaps();
    res.json(maps);
  } catch (err) {
    next(err);
  }
};

// GET /api/maps/current
const getCurrentMap = async (req, res, next) => {
  try {
    const map = await mapService.getCurrentMap();
    if (!map) return res.status(404).json({ message: 'No current map set' });
    res.json(map);
  } catch (err) {
    next(err);
  }
};

// GET /api/maps/:id
const getMapById = async (req, res, next) => {
  try {
    const map = await mapService.getMapById(req.params.id);
    if (!map) return res.status(404).json({ message: 'Map not found' });
    res.json(map);
  } catch (err) {
    next(err);
  }
};

// POST /api/maps
const createMap = async (req, res, next) => {
  try {
    const map = await mapService.createMap(req.body);
    res.status(201).json(map);
  } catch (err) {
    next(err);
  }
};

// PUT /api/maps/:id
const updateMap = async (req, res, next) => {
  try {
    const map = await mapService.updateMap(req.params.id, req.body);
    if (!map) return res.status(404).json({ message: 'Map not found' });
    res.json(map);
  } catch (err) {
    next(err);
  }
};

// PUT /api/maps/:id/set-current
const setCurrentMap = async (req, res, next) => {
  try {
    const map = await mapService.setCurrentMap(req.params.id);
    if (!map) return res.status(404).json({ message: 'Map not found' });
    res.json({ message: 'Current map updated', map });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/maps/:id
const deleteMap = async (req, res, next) => {
  try {
    const map = await mapService.deleteMap(req.params.id);
    if (!map) return res.status(404).json({ message: 'Map not found' });
    res.json({ message: 'Map deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllMaps,
  getCurrentMap,
  getMapById,
  createMap,
  updateMap,
  setCurrentMap,
  deleteMap,
};
