# mccal-api

McCal Media API - A Node/Express REST API for serving portfolio manifests.

## Overview

This API provides endpoints to manage and retrieve portfolio manifests for McCal Media. It follows RESTful conventions with a versioned API structure.

## Getting Started

### Prerequisites

- Node.js 18.x or higher

### Installation

```bash
npm install
```

### Running the Server

**Production mode:**
```bash
npm run api:start
```

**Development mode (with auto-reload):**
```bash
npm run api:dev
```

The server runs on port 3000 by default. Set the `PORT` environment variable to change this.

## API Endpoints

### Health Check

```
GET /health
```

Returns the server health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### List All Manifests

```
GET /api/v1/manifests
```

Returns all portfolio manifests.

**Response:**
```json
{
  "manifests": [
    {
      "id": "portfolio-1",
      "name": "McCal Media Portfolio",
      "description": "Sample portfolio manifest",
      "version": "1.0.0",
      "items": [...]
    }
  ]
}
```

### Get Manifest by ID

```
GET /api/v1/manifests/:id
```

Returns a specific manifest by its ID.

**Response (200):**
```json
{
  "id": "portfolio-1",
  "name": "McCal Media Portfolio",
  "description": "Sample portfolio manifest",
  "version": "1.0.0",
  "items": [...]
}
```

**Response (404):**
```json
{
  "error": "Manifest not found"
}
```

## Project Structure

```
mccal-api/
├── src/
│   └── api/
│       ├── server.js       # Express server entry point
│       └── manifests/      # JSON manifest files
│           └── *.json
├── package.json
├── LICENSE
└── README.md
```

## Standards

This project follows the repository standards defined in the McCal-Codes organization. See the contributing guidelines for more details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.