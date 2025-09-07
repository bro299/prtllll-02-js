const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'https://your-frontend-domain.com'],
  credentials: true
}));

// Serve static files from public directory
app.use(express.static('public'));

// Database setup with new structure
const dbPath = path.join(__dirname, 'dpr_data.db');

class DPRDatabase {
  constructor() {
    this.db = null;
    this.initDatabase();
  }

  async initDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          resolve();
        }
      });
    });
  }

  // Advanced search with pagination and filters - updated for new schema
  async search(query, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        limit = 25,
        offset = 0,
        sortBy = 'nama',
        sortOrder = 'ASC',
        filters = {}
      } = options;

      let sql = `SELECT * FROM anggota_dpr WHERE 1=1`;
      const params = [];

      // Search in multiple fields
      if (query) {
        const searchPattern = `%${query}%`;
        sql += ` AND (
          LOWER(nama) LIKE LOWER(?) 
          OR LOWER(fraksi) LIKE LOWER(?) 
          OR LOWER(jabatan) LIKE LOWER(?)
          OR LOWER(tempat_lahir) LIKE LOWER(?)
          OR LOWER(provinsi) LIKE LOWER(?)
          OR LOWER(alamat) LIKE LOWER(?)
        )`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      // Apply filters
      if (filters.fraksi) {
        sql += ` AND LOWER(fraksi) LIKE LOWER(?)`;
        params.push(`%${filters.fraksi}%`);
      }
      if (filters.provinsi) {
        sql += ` AND LOWER(provinsi) LIKE LOWER(?)`;
        params.push(`%${filters.provinsi}%`);
      }
      if (filters.jabatan) {
        sql += ` AND LOWER(jabatan) LIKE LOWER(?)`;
        params.push(`%${filters.jabatan}%`);
      }
      if (filters.minUsia) {
        sql += ` AND usia >= ?`;
        params.push(filters.minUsia);
      }
      if (filters.maxUsia) {
        sql += ` AND usia <= ?`;
        params.push(filters.maxUsia);
      }
      if (filters.isKetua) {
        sql += ` AND is_ketua = 1`;
      }
      if (filters.isWakilKetua) {
        sql += ` AND is_wakil_ketua = 1`;
      }

      // Sorting
      const validSortFields = ['nama', 'fraksi', 'jabatan', 'usia', 'tempat_lahir', 'provinsi', 'created_at'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'nama';
      const sortDir = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      
      sql += ` ORDER BY ${sortField} ${sortDir}`;

      // Pagination
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get total count for pagination
  async getSearchCount(query, filters = {}) {
    return new Promise((resolve, reject) => {
      let sql = `SELECT COUNT(*) as count FROM anggota_dpr WHERE 1=1`;
      const params = [];

      if (query) {
        const searchPattern = `%${query}%`;
        sql += ` AND (
          LOWER(nama) LIKE LOWER(?) 
          OR LOWER(fraksi) LIKE LOWER(?) 
          OR LOWER(jabatan) LIKE LOWER(?)
          OR LOWER(tempat_lahir) LIKE LOWER(?)
          OR LOWER(provinsi) LIKE LOWER(?)
          OR LOWER(alamat) LIKE LOWER(?)
        )`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      // Apply same filters as search
      if (filters.fraksi) {
        sql += ` AND LOWER(fraksi) LIKE LOWER(?)`;
        params.push(`%${filters.fraksi}%`);
      }
      if (filters.provinsi) {
        sql += ` AND LOWER(provinsi) LIKE LOWER(?)`;
        params.push(`%${filters.provinsi}%`);
      }
      if (filters.jabatan) {
        sql += ` AND LOWER(jabatan) LIKE LOWER(?)`;
        params.push(`%${filters.jabatan}%`);
      }
      if (filters.minUsia) {
        sql += ` AND usia >= ?`;
        params.push(filters.minUsia);
      }
      if (filters.maxUsia) {
        sql += ` AND usia <= ?`;
        params.push(filters.maxUsia);
      }
      if (filters.isKetua) {
        sql += ` AND is_ketua = 1`;
      }
      if (filters.isWakilKetua) {
        sql += ` AND is_wakil_ketua = 1`;
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });
  }

  // Get member by ID
  async getMemberById(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM anggota_dpr WHERE id = ?';
      this.db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Enhanced statistics for new schema
  async getStats() {
    return new Promise((resolve, reject) => {
      const queries = {
        total: 'SELECT COUNT(*) as count FROM anggota_dpr',
        
        byFraksi: `
          SELECT 
            CASE 
              WHEN fraksi IS NULL OR fraksi = '' OR fraksi = '-' THEN 'Tidak Ada Fraksi'
              ELSE fraksi 
            END as fraksi, 
            COUNT(*) as count 
          FROM anggota_dpr 
          GROUP BY fraksi 
          ORDER BY count DESC
        `,
        
        byProvinsi: `
          SELECT provinsi, COUNT(*) as count 
          FROM anggota_dpr 
          WHERE provinsi IS NOT NULL 
          GROUP BY provinsi 
          ORDER BY count DESC 
          LIMIT 15
        `,
        
        byJabatan: `
          SELECT jabatan, COUNT(*) as count 
          FROM anggota_dpr 
          WHERE jabatan IS NOT NULL AND jabatan != '' 
          GROUP BY jabatan 
          ORDER BY count DESC 
          LIMIT 10
        `,
        
        byUsia: `
          SELECT 
            CASE 
              WHEN usia IS NULL THEN 'Tidak Diketahui'
              WHEN usia < 30 THEN 'Di bawah 30'
              WHEN usia BETWEEN 30 AND 40 THEN '30-40 tahun'
              WHEN usia BETWEEN 41 AND 50 THEN '41-50 tahun'
              WHEN usia BETWEEN 51 AND 60 THEN '51-60 tahun'
              WHEN usia > 60 THEN 'Di atas 60'
              ELSE 'Tidak Diketahui'
            END as kategori_usia,
            COUNT(*) as count,
            AVG(CASE WHEN usia IS NOT NULL THEN usia END) as avg_usia
          FROM anggota_dpr 
          GROUP BY kategori_usia 
          ORDER BY count DESC
        `,
        
        byGender: `
          SELECT 
            CASE 
              WHEN LOWER(nama) LIKE 'hj.%' OR LOWER(nama) LIKE '%siti%' OR LOWER(nama) LIKE '%dewi%' OR LOWER(nama) LIKE '%sri%' OR LOWER(nama) LIKE '%ratna%' OR LOWER(nama) LIKE '%indira%' OR LOWER(nama) LIKE '%ani%' THEN 'Perempuan'
              WHEN LOWER(nama) LIKE 'h.%' OR LOWER(nama) LIKE '%ahmad%' OR LOWER(nama) LIKE '%muhammad%' OR LOWER(nama) LIKE '%abdul%' OR LOWER(nama) LIKE '%said%' THEN 'Laki-laki'
              ELSE 'Tidak Diketahui'
            END as gender,
            COUNT(*) as count
          FROM anggota_dpr 
          GROUP BY gender 
          ORDER BY count DESC
        `,
        
        leadership: `
          SELECT 
            'Ketua' as jabatan_type,
            COUNT(*) as count
          FROM anggota_dpr 
          WHERE is_ketua = 1
          UNION ALL
          SELECT 
            'Wakil Ketua' as jabatan_type,
            COUNT(*) as count
          FROM anggota_dpr 
          WHERE is_wakil_ketua = 1
          UNION ALL
          SELECT 
            'Anggota' as jabatan_type,
            COUNT(*) as count
          FROM anggota_dpr 
          WHERE is_ketua = 0 AND is_wakil_ketua = 0
        `,
        
        avgAge: 'SELECT AVG(usia) as avg_age, MIN(usia) as min_age, MAX(usia) as max_age FROM anggota_dpr WHERE usia IS NOT NULL',
        
        recentMembers: 'SELECT nama, fraksi, jabatan, provinsi FROM anggota_dpr ORDER BY id DESC LIMIT 5'
      };

      const results = {};
      let completed = 0;
      const total = Object.keys(queries).length;

      Object.entries(queries).forEach(([key, query]) => {
        this.db.all(query, (err, rows) => {
          if (err) {
            console.error(`Error in ${key} query:`, err);
            results[key] = [];
          } else {
            results[key] = rows;
          }
          
          completed++;
          if (completed === total) {
            resolve(results);
          }
        });
      });
    });
  }

  // Get unique values for filters
  async getFilterOptions() {
    return new Promise((resolve, reject) => {
      const queries = {
        fraksi: `
          SELECT DISTINCT fraksi 
          FROM anggota_dpr 
          WHERE fraksi IS NOT NULL AND fraksi != '' AND fraksi != '-' 
          ORDER BY fraksi
        `,
        provinsi: `
          SELECT DISTINCT provinsi 
          FROM anggota_dpr 
          WHERE provinsi IS NOT NULL 
          ORDER BY provinsi
        `,
        jabatan: `
          SELECT DISTINCT jabatan 
          FROM anggota_dpr 
          WHERE jabatan IS NOT NULL AND jabatan != '' 
          ORDER BY jabatan
        `,
        tempat_lahir: `
          SELECT DISTINCT tempat_lahir 
          FROM anggota_dpr 
          WHERE tempat_lahir IS NOT NULL AND tempat_lahir != '' 
          ORDER BY tempat_lahir 
          LIMIT 100
        `
      };

      const results = {};
      let completed = 0;
      const total = Object.keys(queries).length;

      Object.entries(queries).forEach(([key, query]) => {
        this.db.all(query, (err, rows) => {
          if (err) {
            console.error(`Error in ${key} query:`, err);
            results[key] = [];
          } else {
            results[key] = rows.map(row => Object.values(row)[0]);
          }
          
          completed++;
          if (completed === total) {
            resolve(results);
          }
        });
      });
    });
  }

  // Export data to CSV
  async exportToCSV() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM anggota_dpr ORDER BY id';
      this.db.all(sql, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

const database = new DPRDatabase();

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get all members with pagination
app.get('/api/members', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      sortBy = 'nama',
      sortOrder = 'ASC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const options = {
      limit: parseInt(limit),
      offset,
      sortBy,
      sortOrder
    };

    const members = await database.search('', options);
    const total = await database.getSearchCount('');
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: members,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal mengambil data anggota'
    });
  }
});

// Search members with advanced options
app.post('/api/search', async (req, res) => {
  try {
    const { 
      query = '',
      page = 1,
      limit = 25,
      sortBy = 'nama',
      sortOrder = 'ASC',
      filters = {}
    } = req.body;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const options = {
      limit: parseInt(limit),
      offset,
      sortBy,
      sortOrder,
      filters
    };

    const results = await database.search(query.trim(), options);
    const total = await database.getSearchCount(query.trim(), filters);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      results,
      query: query.trim(),
      count: results.length,
      total,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal melakukan pencarian'
    });
  }
});

// Get member by ID
app.get('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const member = await database.getMemberById(id);
    
    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found',
        message: 'Anggota DPR tidak ditemukan'
      });
    }

    res.json({
      success: true,
      data: member
    });
  } catch (error) {
    console.error('Get member by ID error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal mengambil data anggota'
    });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await database.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal mengambil statistik'
    });
  }
});

// Get filter options
app.get('/api/filters', async (req, res) => {
  try {
    const options = await database.getFilterOptions();
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    console.error('Filter options error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal mengambil opsi filter'
    });
  }
});

// Export data as CSV
app.get('/api/export', async (req, res) => {
  try {
    const data = await database.exportToCSV();
    
    // Convert to CSV format
    const csvHeader = 'id,provinsi_id,nama,tempat_lahir,tanggal_lahir,jabatan,fraksi,alamat,keterangan,usia,provinsi\n';
    const csvRows = data.map(row => 
      [
        row.id,
        row.provinsi_id || '',
        `"${(row.nama || '').replace(/"/g, '""')}"`,
        `"${(row.tempat_lahir || '').replace(/"/g, '""')}"`,
        `"${(row.tanggal_lahir || '').replace(/"/g, '""')}"`,
        `"${(row.jabatan || '').replace(/"/g, '""')}"`,
        `"${(row.fraksi || '').replace(/"/g, '""')}"`,
        `"${(row.alamat || '').replace(/"/g, '""')}"`,
        `"${(row.keterangan || '').replace(/"/g, '""')}"`,
        row.usia || '',
        `"${(row.provinsi || '').replace(/"/g, '""')}"`
      ].join(',')
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="dpr_data_export.csv"');
    res.send(csvContent);
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengekspor data CSV'
    });
  }
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: 'Terjadi kesalahan pada server'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Not found',
    message: 'Endpoint tidak ditemukan',
    requested: req.originalUrl
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 DPR API Server running on port ${PORT}`);
  console.log(`📊 API Endpoints:`);
  console.log(`   GET  /api/health - Health check`);
  console.log(`   GET  /api/members - Get all members`);
  console.log(`   POST /api/search - Search members`);
  console.log(`   GET  /api/members/:id - Get member by ID`);
  console.log(`   GET  /api/stats - Get statistics`);
  console.log(`   GET  /api/filters - Get filter options`);
  console.log(`   GET  /api/export - Export data`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    if (database.db) {
      database.db.close();
    }
    process.exit(0);
  });
});

module.exports = app;