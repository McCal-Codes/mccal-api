const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Versioned router
const v1Router = express.Router();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manifests directory path
const manifestsDir = path.join(__dirname, 'manifests');

// GET /api/v1/manifests - List all manifests
v1Router.get('/manifests', (req, res, next) => {
  try {
    if (!fs.existsSync(manifestsDir)) {
      return res.json({ manifests: [] });
    }

    const files = fs.readdirSync(manifestsDir).filter(file => file.endsWith('.json'));
    const manifests = files.map(file => {
      const filePath = path.join(manifestsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    });

    res.json({ manifests });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/manifests/:id - Get a specific manifest by ID
v1Router.get('/manifests/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ID to prevent path traversal attacks
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid manifest ID' });
    }

    const filePath = path.join(manifestsDir, `${id}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Manifest not found' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const manifest = JSON.parse(content);

    res.json(manifest);
  } catch (error) {
    next(error);
  }
});

// Mount versioned router
app.use('/api/v1', v1Router);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`McCal API server running on port ${PORT}`);
});

module.exports = app;
